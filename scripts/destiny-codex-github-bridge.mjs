import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractCodexTaskReference, fingerprintCodexAccountId, fingerprintCodexEnvironmentId } from "../src/codex-connection-identity.mjs";
import { advanceDestinyTaskSubmission, planDestinyTaskSubmission, validateDestinySubmissionLedger } from "../src/destiny-codex-dispatch.mjs";
import { buildCodexCloudExecArgs, destinyGithubTaskDigest, parseDestinyGithubTaskIssue } from "../src/destiny-github-task.mjs";

const REPOSITORY = "michaeljwilliams0123/mahoraga";
const OWNER = "michaeljwilliams0123";
const options = parseOptions(process.argv.slice(2));
const issueNumber = Number(required("issue-number"));
if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new TypeError("destiny-github-issue-number-invalid");
const codexHome = path.resolve(options.get("codex-home") ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
const stateDir = path.resolve(options.get("state-dir") ?? path.join(os.homedir(), ".mahoraga", "destiny-codex"));

const auth = JSON.parse(await readFile(path.join(codexHome, "auth.json"), "utf8"));
if (String(auth.auth_mode ?? "").toLowerCase() === "apikey" || typeof auth.OPENAI_API_KEY === "string") throw new Error("destiny-codex-chatgpt-auth-required");
const currentAccountFingerprint = fingerprintCodexAccountId(auth.tokens?.account_id);
const route = await readRoute(path.join(stateDir, "route-private.json"));
let environmentId;
let bootstrapRoute = false;
if (route) {
  if (route.schemaVersion !== 2 || route.kind !== "destiny-codex-private-route" || route.repository !== REPOSITORY || typeof route.environmentId !== "string" || typeof route.codexEnvironmentFingerprint !== "string") throw new Error("destiny-codex-private-route-invalid");
  if (currentAccountFingerprint !== route.codexAccountFingerprint) throw new Error("destiny-codex-account-binding-mismatch");
  environmentId = route.environmentId;
  if (fingerprintCodexEnvironmentId(environmentId) !== route.codexEnvironmentFingerprint) throw new Error("destiny-codex-environment-fingerprint-mismatch");
  if (options.has("environment-id") && options.get("environment-id") !== environmentId) throw new Error("destiny-codex-environment-binding-mismatch");
} else {
  environmentId = options.get("environment-id");
  if (!environmentId) throw new Error("destiny-codex-environment-id-required-before-binding");
  bootstrapRoute = true;
}

const issue = options.has("issue-file") ? JSON.parse(await readFile(path.resolve(options.get("issue-file")), "utf8")) : await fetchIssue(issueNumber);
const task = parseDestinyGithubTaskIssue(issue, { repository: REPOSITORY, owner: OWNER });
if (task.issueNumber !== issueNumber) throw new Error("destiny-github-issue-number-mismatch");

await mkdir(stateDir, { recursive: true });
const ledgerPath = path.join(stateDir, "submitted-github-tasks.json");
const lockPath = `${ledgerPath}.lock`;
const taskDigest = destinyGithubTaskDigest(task);
const lockHandle = await acquireLedgerLock(lockPath);
let result;
try {
  result = await submitUnderLock();
} finally {
  await releaseLedgerLock(lockPath, lockHandle);
}
console.log(JSON.stringify(result));

async function submitUnderLock() {
  let ledger = await readLedger(ledgerPath);
  const planned = planDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, routeId: "openai-destiny", issueNumber, now: new Date().toISOString() });
  if (planned.duplicate) {
    return { submitted: false, duplicate: true, bootstrapRoute, issueNumber, taskId: task.taskId, taskUrl: planned.record.taskUrl ?? null };
  }
  ledger = planned.ledger;
  await writeLedger(ledgerPath, ledger);
  ledger = advanceDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, nextState: "submitting", now: new Date().toISOString() }).ledger;
  await writeLedger(ledgerPath, ledger);

  const executable = "codex";
  let stdout;
  try {
    stdout = execFileSync(executable, buildCodexCloudExecArgs(environmentId, task), { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 });
  } catch {
    ledger = advanceDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, nextState: "failed-closed", now: new Date().toISOString() }).ledger;
    await writeLedger(ledgerPath, ledger);
    throw new Error("destiny-codex-cloud-submit-failed");
  }
  const taskUrl = extractTaskUrl(stdout);
  const outputSha256 = createHash("sha256").update(stdout).digest("hex");
  ledger = advanceDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, nextState: "submitted", now: new Date().toISOString(), taskUrl, outputSha256 }).ledger;
  await writeLedger(ledgerPath, ledger);
  return { submitted: true, duplicate: false, bootstrapRoute, issueNumber, taskId: task.taskId, taskUrl };
}

async function fetchIssue(number) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/issues/${number}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mahoraga-destiny-codex-bridge" } });
  if (!response.ok) throw new Error(`destiny-github-issue-fetch-failed:${response.status}`);
  return response.json();
}
async function readRoute(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw new Error("destiny-codex-private-route-invalid"); }
}
async function readLedger(file) {
  try { return validateDestinySubmissionLedger(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) { if (error?.code === "ENOENT") return {}; throw new Error("destiny-codex-submit-ledger-invalid"); }
}
async function writeLedger(file, ledger) {
  const tempPath = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempPath, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
  }
}
async function acquireLedgerLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, { encoding: "utf8" });
      await handle.sync();
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const lock = await readLedgerLock(lockPath);
      if (!lock || !Number.isSafeInteger(lock.pid) || lock.pid < 1) throw new Error("destiny-codex-submit-lock-held");
      try {
        process.kill(lock.pid, 0);
        throw new Error("destiny-codex-submit-lock-held");
      } catch (probeError) {
        if (probeError?.message === "destiny-codex-submit-lock-held" || probeError?.code === "EPERM") throw new Error("destiny-codex-submit-lock-held");
        if (probeError?.code !== "ESRCH") throw new Error("destiny-codex-submit-lock-held");
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new Error("destiny-codex-submit-lock-held");
}
async function readLedgerLock(lockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    return lock && typeof lock === "object" && !Array.isArray(lock) ? lock : null;
  } catch {
    return null;
  }
}
async function releaseLedgerLock(lockPath, handle) {
  await handle.close().catch(() => {});
  await rm(lockPath, { force: true });
}
function extractTaskUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/https:\/\/chatgpt\.com\/s\/(cd_[a-f0-9]{32})(?=$|[?#\s)\]}>,.;:])/i);
  if (!match) return null;
  try {
    if (extractCodexTaskReference(match[0]) !== match[1].toLowerCase()) return null;
  } catch {
    return null;
  }
  return `https://chatgpt.com/s/${match[1].toLowerCase()}`;
}
function parseOptions(tokens) {
  const result = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index]; const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) throw new TypeError("destiny-codex-bridge-options-invalid");
    const name = flag.slice(2); if (result.has(name)) throw new TypeError("destiny-codex-bridge-option-duplicate"); result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing --${name}`); return value; }

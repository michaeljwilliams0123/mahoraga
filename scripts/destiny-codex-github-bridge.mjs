import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fingerprintCodexAccountId, fingerprintCodexEnvironmentId } from "../src/codex-connection-identity.mjs";
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
const taskDigest = destinyGithubTaskDigest(task);
let ledger = await readLedger(ledgerPath);
const planned = planDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, routeId: "openai-destiny", issueNumber, now: new Date().toISOString() });
if (planned.duplicate) {
  console.log(JSON.stringify({ submitted: false, duplicate: true, bootstrapRoute, issueNumber, taskId: task.taskId, taskUrl: planned.record.taskUrl ?? null }));
  process.exit(0);
}
ledger = planned.ledger;
await writeLedger(ledgerPath, ledger);
ledger = advanceDestinyTaskSubmission(ledger, { taskId: task.taskId, taskDigest, nextState: "submitting", now: new Date().toISOString() }).ledger;
await writeLedger(ledgerPath, ledger);

const executable = process.env.CODEX_BIN ?? "codex";
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
console.log(JSON.stringify({ submitted: true, duplicate: false, bootstrapRoute, issueNumber, taskId: task.taskId, taskUrl }));

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
  await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
function extractTaskUrl(value) {
  const match = typeof value === "string" ? value.match(/https:\/\/chatgpt\.com\/[^\s]+/) : null;
  return match ? match[0].replace(/[),.;]+$/, "") : null;
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

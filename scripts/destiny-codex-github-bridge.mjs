import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fingerprintCodexAccountId } from "../src/codex-connection-identity.mjs";
import { buildCodexCloudExecArgs, parseDestinyGithubTaskIssue } from "../src/destiny-github-task.mjs";

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
  if (route.schemaVersion !== 1 || route.kind !== "destiny-codex-private-route" || route.repository !== REPOSITORY || typeof route.environmentId !== "string") throw new Error("destiny-codex-private-route-invalid");
  if (currentAccountFingerprint !== route.codexAccountFingerprint) throw new Error("destiny-codex-account-binding-mismatch");
  environmentId = route.environmentId;
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
const ledger = await readLedger(ledgerPath);
if (ledger[task.taskId]) {
  console.log(JSON.stringify({ submitted: false, duplicate: true, bootstrapRoute, issueNumber, taskId: task.taskId, taskUrl: ledger[task.taskId].taskUrl ?? null }));
  process.exit(0);
}

const executable = process.env.CODEX_BIN ?? "codex";
let stdout;
try {
  stdout = execFileSync(executable, buildCodexCloudExecArgs(environmentId, task), { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 });
} catch { throw new Error("destiny-codex-cloud-submit-failed"); }
const taskUrl = extractTaskUrl(stdout);
const submittedAt = new Date().toISOString();
ledger[task.taskId] = { issueNumber, submittedAt, taskUrl, outputSha256: createHash("sha256").update(stdout).digest("hex") };
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
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
  try { const parsed = JSON.parse(await readFile(file, "utf8")); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch (error) { if (error?.code === "ENOENT") return {}; throw new Error("destiny-codex-submit-ledger-invalid"); }
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

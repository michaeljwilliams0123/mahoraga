import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESTINY_DISPATCH_DIRECTORY,
  DESTINY_DISPATCH_REPOSITORY,
  DESTINY_VERIFICATION,
  createDestinyCodexDispatch,
  validateDestinyCodexDispatch,
  validateDestinyDispatchPullRequest,
  validateDestinyDispatchRegistry,
} from "../src/destiny-codex-dispatch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] ?? "help";
const options = parseOptions(process.argv.slice(3));

if (command === "create") await create();
else if (command === "validate") await validateRegistry();
else if (command === "validate-pr") await validatePullRequest();
else {
  console.log(`Usage:
  node scripts/destiny-codex-dispatch.mjs create --idempotency-key <key> --base-commit <sha> --title <title> --task <task> --allowed-paths <csv> [--verification <csv>] [--maximum-attempts <1-3>]
  node scripts/destiny-codex-dispatch.mjs validate
  node scripts/destiny-codex-dispatch.mjs validate-pr --root <candidate-checkout>`);
  if (command !== "help") process.exitCode = 2;
}

async function create() {
  const dispatch = createDestinyCodexDispatch({
    idempotencyKey: required("idempotency-key"),
    repository: DESTINY_DISPATCH_REPOSITORY,
    baseCommit: required("base-commit"),
    title: required("title"),
    task: required("task"),
    allowedPaths: csv(required("allowed-paths")),
    verification: options.get("verification") ? csv(options.get("verification")) : Object.keys(DESTINY_VERIFICATION),
    maximumAttempts: options.has("maximum-attempts") ? Number(required("maximum-attempts")) : 1,
  });
  const directory = path.join(ROOT, DESTINY_DISPATCH_DIRECTORY);
  const file = path.join(directory, `${dispatch.dispatchId}.json`);
  await mkdir(directory, { recursive: true });
  if (await isFile(file)) {
    const existing = validateDestinyCodexDispatch(JSON.parse(await readFile(file, "utf8")));
    if (existing.requestHash !== dispatch.requestHash) throw new Error("destiny-idempotency-conflict");
    return print({ created: false, path: relative(file), dispatchId: existing.dispatchId, requestHash: existing.requestHash });
  }
  await writeFile(file, `${JSON.stringify(dispatch, null, 2)}\n`, "utf8");
  print({ created: true, path: relative(file), dispatchId: dispatch.dispatchId, requestHash: dispatch.requestHash });
}

async function validateRegistry() {
  const directory = path.join(ROOT, DESTINY_DISPATCH_DIRECTORY);
  const files = await jsonFiles(directory);
  const records = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), "utf8"))));
  const validated = validateDestinyDispatchRegistry(records);
  print({ healthy: true, count: validated.length, dispatchIds: validated.map((item) => item.dispatchId) });
}

async function validatePullRequest() {
  const candidateRoot = options.has("root") ? path.resolve(process.cwd(), options.get("root")) : ROOT;
  const title = environment("PR_TITLE");
  const author = environment("PR_AUTHOR");
  const owner = environment("REPOSITORY_OWNER");
  const baseBranch = environment("PR_BASE_REF");
  const baseSha = gitCommit(environment("PR_BASE_SHA"));
  const headSha = gitCommit(environment("PR_HEAD_SHA"));
  const mergeBase = execFileSync("git", ["-C", candidateRoot, "merge-base", baseSha, headSha], { encoding: "utf8", windowsHide: true }).trim().toLowerCase();
  const changedFiles = execFileSync("git", ["-C", candidateRoot, "diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...${headSha}`], { encoding: "utf8", windowsHide: true })
    .split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"));
  const dispatchPaths = changedFiles.filter((file) => file.startsWith(`${DESTINY_DISPATCH_DIRECTORY}/`) && file.endsWith(".json"));
  if (dispatchPaths.length !== 1) throw new Error("destiny-single-envelope-required");
  const dispatchPath = dispatchPaths[0];
  const dispatch = JSON.parse(await readFile(path.join(candidateRoot, dispatchPath), "utf8"));
  const receipt = validateDestinyDispatchPullRequest({ title, author, owner, baseBranch, mergeBase, changedFiles, dispatchPath, dispatch });
  print({ healthy: true, ...receipt, shortRequestHash: receipt.requestHash.slice(0, 12) });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, [
      `dispatch_id=${receipt.dispatchId}`,
      `request_hash=${receipt.requestHash}`,
      `short_request_hash=${receipt.requestHash.slice(0, 12)}`,
      `implementation_file_count=${receipt.implementationFileCount}`,
      "",
    ].join("\n"), "utf8");
  }
}

function parseOptions(tokens) {
  const parsed = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError("destiny-command-options-invalid");
    const name = key.slice(2);
    if (parsed.has(name)) throw new TypeError("destiny-command-option-duplicate");
    parsed.set(name, value);
  }
  return parsed;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing --${name}`); return value; }
function environment(name) { const value = process.env[name]; if (!value) throw new TypeError(`Missing ${name}`); return value; }
function csv(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function gitCommit(value) { if (!/^[a-f0-9]{40}$/i.test(value)) throw new TypeError("destiny-git-commit-invalid"); return value.toLowerCase(); }
function relative(file) { return path.relative(ROOT, file).replaceAll("\\", "/"); }
function print(value) { console.log(JSON.stringify(value)); }
async function isFile(file) { try { return (await stat(file)).isFile(); } catch { return false; } }
async function jsonFiles(directory) {
  try { return (await readdir(directory)).filter((file) => /^dcx-[a-f0-9]{24}\.json$/.test(file)).sort(); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

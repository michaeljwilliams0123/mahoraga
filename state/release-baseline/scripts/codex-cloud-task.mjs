import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import {
  createCodexCloudDispatchBundle,
  createCodexCloudTask,
  renderCodexCloudIssue,
  validateCodexCloudReturn,
  validateCodexCloudTask,
} from "../src/codex-cloud-contract.mjs";

const TASK_DIRECTORY = path.join(ROOT, "coordination", "cloud-tasks");

const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "create") {
  const task = createCodexCloudTask({
    idempotencyKey: required("idempotency-key"),
    repository: options.get("repository") ?? "michaeljwilliams0123/mahoraga",
    baseCommit: required("base-commit"),
    title: required("title"),
    task: required("task"),
    allowedPaths: csv(required("allowed-paths")),
    verification: csv(required("verification")),
    maximumAttempts: options.has("maximum-attempts") ? Number(options.get("maximum-attempts")) : 1,
    integrationMode: options.get("integration-mode") ?? "pull-request",
    createdBy: options.get("created-by") ?? "main-codex",
  }, options.has("id") ? { taskId: options.get("id") } : undefined);
  await mkdir(TASK_DIRECTORY, { recursive: true });
  const file = path.join(TASK_DIRECTORY, `${task.taskId}.json`);
  await writeFile(file, `${JSON.stringify(task, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ created: path.relative(ROOT, file).replaceAll("\\", "/"), taskId: task.taskId, idempotencyKey: task.idempotencyKey }, null, 2));
} else if (command === "list") {
  const tasks = await taskFiles();
  console.log(JSON.stringify(tasks.map((task) => ({ taskId: task.taskId, idempotencyKey: task.idempotencyKey, title: task.title, baseCommit: task.baseCommit })), null, 2));
} else if (command === "dispatch-bundle") {
  console.log(JSON.stringify(createCodexCloudDispatchBundle(await taskFiles())));
} else if (command === "validate") {
  const task = validateCodexCloudTask(await jsonFile(required("file")));
  console.log(JSON.stringify({ valid: true, taskId: task.taskId, idempotencyKey: task.idempotencyKey }, null, 2));
} else if (command === "render") {
  const task = validateCodexCloudTask(await jsonFile(required("file")));
  console.log(JSON.stringify(renderCodexCloudIssue(task), null, 2));
} else if (command === "validate-return") {
  const task = validateCodexCloudTask(await jsonFile(required("task")));
  const result = validateCodexCloudReturn(await jsonFile(required("result")), task);
  console.log(JSON.stringify({ valid: true, taskId: result.taskId, state: result.state, pullRequestNumber: result.pullRequestNumber }, null, 2));
} else {
  console.log(`Usage:
  node scripts/codex-cloud-task.mjs create --idempotency-key <key> --base-commit <sha> --title <text> --task <text> --allowed-paths <csv> --verification <csv> [--integration-mode <pull-request|merge-after-verify>]
  node scripts/codex-cloud-task.mjs list
  node scripts/codex-cloud-task.mjs dispatch-bundle
  node scripts/codex-cloud-task.mjs validate --file <task.json>
  node scripts/codex-cloud-task.mjs render --file <task.json>
  node scripts/codex-cloud-task.mjs validate-return --task <task.json> --result <return.json>`);
}

async function taskFiles() {
  let names;
  try { names = await readdir(TASK_DIRECTORY); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  const tasks = [];
  for (const name of names.filter((value) => value.endsWith(".json")).sort()) {
    const task = validateCodexCloudTask(JSON.parse(await readFile(path.join(TASK_DIRECTORY, name), "utf8")));
    if (name !== `${task.taskId}.json`) throw new TypeError(`Codex cloud task filename does not match its task ID: ${name}`);
    tasks.push(task);
  }
  return tasks;
}

async function jsonFile(file) {
  const absolute = path.resolve(ROOT, file);
  const relative = path.relative(ROOT, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError("Codex cloud contract file must be inside the repository.");
  return JSON.parse(await readFile(absolute, "utf8"));
}
function parseOptions(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError(`Invalid option near ${key ?? "end"}.`);
    const name = key.slice(2);
    if (result.has(name)) throw new TypeError(`Duplicate option: ${name}`);
    result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing required option: --${name}`); return value; }
function csv(value) { return String(value).split(",").map((item) => item.trim()).filter(Boolean); }

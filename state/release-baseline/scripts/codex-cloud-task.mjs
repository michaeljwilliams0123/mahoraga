import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { renderCodexCloudIssue, validateCodexCloudReturn, validateCodexCloudTask } from "../src/codex-cloud-contract.mjs";

const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "validate") {
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
  node scripts/codex-cloud-task.mjs validate --file <task.json>
  node scripts/codex-cloud-task.mjs render --file <task.json>
  node scripts/codex-cloud-task.mjs validate-return --task <task.json> --result <return.json>`);
}

async function jsonFile(file) {
  const absolute = path.resolve(ROOT, file);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new TypeError("Codex cloud contract file must be inside the repository.");
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

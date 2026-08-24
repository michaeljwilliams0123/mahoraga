import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { dispatchCloudIssue } from "../src/cloud-task-gateway.mjs";

const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "dispatch") {
  const eventFile = required("event");
  const event = JSON.parse(await readFile(eventFile, "utf8"));
  const result = await dispatchCloudIssue({ event, baseCommit: required("base-commit"), root: ROOT });
  console.log(JSON.stringify({ ...result, recordPath: path.relative(ROOT, result.recordPath).replaceAll("\\", "/") }));
} else {
  console.log("Usage: node scripts/cloud-task-gateway.mjs dispatch --event <github-event.json> --base-commit <sha>");
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

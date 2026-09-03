import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT, loadManifest } from "../src/config.mjs";
import { validateAssignmentRecord } from "../src/coordination-records.mjs";
import { executeWorkspaceAgentCapability } from "../src/workspace-agent-worker.mjs";

const [command = "health", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);
const manifest = await loadManifest();
const worker = manifest.workers.find((item) => item.id === "workspace-agent-cloud");
if (!worker) throw new Error("Workspace Agent worker is not registered.");

if (command === "health") {
  print(await executeWorkspaceAgentCapability("workspace-agent.health", {}, worker));
} else if (command === "trigger") {
  const assignment = await readAssignment(required("assignment-id"));
  print(await executeWorkspaceAgentCapability("workspace-agent.trigger", assignmentTask(assignment), worker));
} else if (command === "status") {
  print(await executeWorkspaceAgentCapability("workspace-agent.status", { providerRunId: required("run-id") }, worker));
} else {
  console.log("Usage: node scripts/workspace-agent.mjs health | trigger --assignment-id <sec-id> | status --run-id <apirun-id>");
}

async function readAssignment(id) {
  if (!/^sec-[0-9a-f-]{8,72}$/i.test(id)) throw new TypeError("Assignment ID is invalid.");
  const file = path.join(ROOT, "coordination", "assignments", `${id}.json`);
  return validateAssignmentRecord(JSON.parse(await readFile(file, "utf8")));
}
function assignmentTask(record) {
  return {
    assignmentId: record.assignmentId,
    correlationId: record.correlationId,
    expectedBaseCommit: record.expectedBaseCommit,
    returnBranch: record.returnBranch,
    allowedPaths: record.allowedPaths,
    requestedOutcome: record.expectedTask,
  };
}
function parseOptions(values) { const result = new Map(); for (let index = 0; index < values.length; index += 2) { const key = values[index]; const value = values[index + 1]; if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError(`Invalid option near ${key ?? "end"}.`); result.set(key.slice(2), value); } return result; }
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing required option: --${name}`); return value; }
function print(result) { console.log(JSON.stringify(result, null, 2)); }

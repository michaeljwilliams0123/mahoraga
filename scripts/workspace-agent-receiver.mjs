import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { ROOT, loadManifest } from "../src/config.mjs";
import { validateAssignmentRecord, validateResultRecord } from "../src/coordination-records.mjs";
import { executeWorkspaceAgentCapability } from "../src/workspace-agent-worker.mjs";

const execFileAsync = promisify(execFile);
const CANONICAL_REPOSITORY = "michaeljwilliams0123/mahoraga";
const ASSIGNMENT_ID = /^sec-[a-f0-9-]{8,72}$/i;
const ASSIGNMENT_PATH = /^coordination\/assignments\/(sec-[a-f0-9-]{8,72})\.json$/i;
const COMMIT = /^[a-f0-9]{40}$/i;

export function validateWorkspaceAgentReceiverId(value) {
  if (typeof value !== "string" || !ASSIGNMENT_ID.test(value)) throw new TypeError("workspace-agent-receiver-assignment-id-invalid");
  return value;
}

export async function selectWorkspaceAgentAssignments({
  eventName,
  event,
  root = ROOT,
  listAddedPaths = defaultAddedPaths,
} = {}) {
  requireCanonicalEvent(event);
  let ids;
  if (eventName === "push") {
    if (event.ref !== "refs/heads/main") throw new Error("workspace-agent-receiver-ref-rejected");
    const before = requiredCommit(event.before, "before");
    const after = requiredCommit(event.after, "after");
    if (/^0+$/.test(before)) throw new Error("workspace-agent-receiver-root-push-rejected");
    const added = await listAddedPaths({ root, before, after });
    ids = added.map((relative) => {
      const match = ASSIGNMENT_PATH.exec(relative);
      if (!match) throw new Error("workspace-agent-receiver-path-rejected");
      return match[1];
    });
  } else if (eventName === "workflow_dispatch") {
    ids = [validateWorkspaceAgentReceiverId(event.inputs?.assignment_id)];
  } else if (eventName === "issue_comment") {
    if (event.action !== "created" || event.issue?.pull_request != null || event.sender?.login !== event.repository?.owner?.login) {
      throw new Error("workspace-agent-receiver-owner-command-rejected");
    }
    const match = /^\/mahoraga receive workspace-agent (sec-[a-f0-9-]{8,72})\s*$/i.exec(event.comment?.body ?? "");
    if (!match) throw new Error("workspace-agent-receiver-command-rejected");
    ids = [validateWorkspaceAgentReceiverId(match[1])];
  } else {
    throw new Error("workspace-agent-receiver-event-rejected");
  }

  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  if (unique.length !== 1) throw new Error("workspace-agent-receiver-multiple-assignments-rejected");
  return Promise.all(unique.map((id) => readAssignment(root, id)));
}

export async function receiveWorkspaceAgentEvent({
  eventName,
  event,
  root = ROOT,
  env = process.env,
  fetch = globalThis.fetch,
  listAddedPaths = defaultAddedPaths,
} = {}) {
  const assignments = await selectWorkspaceAgentAssignments({ eventName, event, root, listAddedPaths });
  if (assignments.length === 0) return Object.freeze({ schemaVersion: 1, state: "idle", modelExecution: false });
  const assignment = assignments[0];
  const completed = await resultExists(root, assignment);
  if (completed) {
    return Object.freeze({ schemaVersion: 1, state: "already-complete", assignmentId: assignment.assignmentId, modelExecution: false });
  }

  const manifest = await loadManifest();
  const worker = manifest.workers.find((item) => item.id === "workspace-agent-cloud");
  if (!worker) throw new Error("workspace-agent-receiver-worker-missing");
  const health = await executeWorkspaceAgentCapability("workspace-agent.health", {}, worker, { env, fetch });
  if (!health.verified) {
    return Object.freeze({
      schemaVersion: 1,
      state: health.providerHealth.platformApiKeyRejected ? "platform-api-key-rejected" : "unconfigured",
      assignmentId: assignment.assignmentId,
      modelExecution: false,
    });
  }

  const outcome = await executeWorkspaceAgentCapability("workspace-agent.trigger", assignmentTask(assignment), worker, { env, fetch });
  return Object.freeze({
    schemaVersion: 1,
    state: "accepted",
    assignmentId: assignment.assignmentId,
    modelExecution: true,
    providerRunId: outcome.providerReceipt.runId,
    returnBranch: outcome.providerReceipt.returnBranch,
  });
}

async function readAssignment(root, id) {
  validateWorkspaceAgentReceiverId(id);
  const file = path.join(root, "coordination", "assignments", `${id}.json`);
  const record = validateAssignmentRecord(JSON.parse(await readFile(file, "utf8")));
  if (record.assignmentId !== id) throw new Error("workspace-agent-receiver-assignment-file-conflict");
  return record;
}

async function resultExists(root, assignment) {
  const file = path.join(root, "coordination", "results", `${assignment.assignmentId}.json`);
  if (!(await stat(file).catch(() => null))?.isFile()) return false;
  validateResultRecord(JSON.parse(await readFile(file, "utf8")), assignment);
  return true;
}

async function defaultAddedPaths({ root, before, after }) {
  const result = await execFileAsync("git", [
    "-C", root, "diff", "--name-only", "--diff-filter=A", "-z", before, after, "--", "coordination/assignments",
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 64_000, timeout: 30_000 });
  return result.stdout.split("\0").filter(Boolean).sort();
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

function requireCanonicalEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event) || event.repository?.full_name !== CANONICAL_REPOSITORY) {
    throw new Error("workspace-agent-receiver-repository-rejected");
  }
}

function requiredCommit(value, label) {
  if (typeof value !== "string" || !COMMIT.test(value)) throw new TypeError(`workspace-agent-receiver-${label}-commit-invalid`);
  return value.toLowerCase();
}

async function runCli() {
  const [command = "receive", ...tokens] = process.argv.slice(2);
  if (command !== "receive") throw new TypeError("Usage: node scripts/workspace-agent-receiver.mjs receive --event-file <path>");
  const options = parseOptions(tokens);
  const eventFile = options.get("event-file") ?? process.env.GITHUB_EVENT_PATH;
  if (!eventFile) throw new TypeError("workspace-agent-receiver-event-file-required");
  const event = JSON.parse(await readFile(eventFile, "utf8"));
  const result = await receiveWorkspaceAgentEvent({ eventName: process.env.GITHUB_EVENT_NAME, event });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseOptions(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError(`Invalid option near ${key ?? "end"}.`);
    result.set(key.slice(2), value);
  }
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await runCli();

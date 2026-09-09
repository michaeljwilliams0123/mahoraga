import { createHash } from "node:crypto";

const CODEX_TASK_ID = /^dct-[a-f0-9]{24}$/;
const WORK_TASK_ID = /^dwt-[a-f0-9]{24}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const OWNER = /^[A-Za-z0-9_.-]+$/;
const CODEX_MARKER = /<!-- MAHORAGA_DESTINY_TASK_V1\r?\n([\s\S]{1,12000}?)\r?\nMAHORAGA_DESTINY_TASK_V1 -->/g;
const WORK_MARKER = /<!-- MAHORAGA_DESTINY_WORK_V1\r?\n([\s\S]{1,12000}?)\r?\nMAHORAGA_DESTINY_WORK_V1 -->/g;
const WORK_MARKER_OPEN = "<!-- MAHORAGA_DESTINY_WORK_V1";
const WORK_MARKER_CLOSE = "MAHORAGA_DESTINY_WORK_V1 -->";
const WORK_LANE = "destiny-work-event";

function opaque(value, code, max = 512) {
  if (typeof value !== "string") throw new TypeError(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\0\r\n]/.test(normalized)) throw new TypeError(code);
  return normalized;
}

function validateRepositoryAndOwner(repository, owner, prefix) {
  if (typeof repository !== "string" || !REPOSITORY.test(repository)) throw new TypeError(`${prefix}-repository-invalid`);
  if (typeof owner !== "string" || !OWNER.test(owner)) throw new TypeError(`${prefix}-owner-invalid`);
}

function extractSingleWorkMarker(body) {
  if (typeof body !== "string") throw new TypeError("destiny-work-task-body-invalid");
  const matches = [...body.matchAll(WORK_MARKER)];
  const opens = body.split(WORK_MARKER_OPEN).length - 1;
  const closes = body.split(WORK_MARKER_CLOSE).length - 1;
  if (matches.length === 0 && opens === 0 && closes === 0) throw new TypeError("destiny-work-task-marker-missing");
  if (matches.length !== 1 || opens !== 1 || closes !== 1) throw new TypeError("destiny-work-task-marker-ambiguous");
  return matches[0][1];
}

function parseJsonObject(source, code) {
  let value;
  try { value = JSON.parse(source); } catch { throw new TypeError(code); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function validateParsedWorkTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) throw new TypeError("destiny-work-task-invalid");
  if (task.schemaVersion !== 1 || task.executorLane !== WORK_LANE) throw new TypeError("destiny-work-task-invalid");
  if (typeof task.taskId !== "string" || !WORK_TASK_ID.test(task.taskId)) throw new TypeError("destiny-work-task-id-invalid");
  if (typeof task.repository !== "string" || !REPOSITORY.test(task.repository)) throw new TypeError("destiny-work-task-repository-invalid");
  if (!Number.isSafeInteger(task.pullRequest) || task.pullRequest < 1) throw new TypeError("destiny-work-task-pr-invalid");
  opaque(task.objective, "destiny-work-task-objective-invalid", 8000);
  if (task.attempts !== 1 || task.implementationOnly !== true || task.codeReview !== false) throw new TypeError("destiny-work-task-policy-invalid");
  const keys = Object.keys(task).sort().join(",");
  if (keys !== "attempts,codeReview,executorLane,implementationOnly,objective,pullRequest,repository,schemaVersion,taskId") {
    throw new TypeError("destiny-work-task-invalid");
  }
  return task;
}

export function destinyWorkTaskDigest(task) {
  const valid = validateParsedWorkTask(task);
  const canonical = JSON.stringify({
    schemaVersion: 1,
    taskId: valid.taskId,
    repository: valid.repository,
    pullRequest: valid.pullRequest,
    objective: opaque(valid.objective, "destiny-work-task-objective-invalid", 8000),
    attempts: 1,
    implementationOnly: true,
    codeReview: false,
    executorLane: WORK_LANE,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseDestinyGithubTaskIssue(issue, { repository, owner }) {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) throw new TypeError("destiny-github-task-issue-invalid");
  validateRepositoryAndOwner(repository, owner, "destiny-github-task");
  if (!Number.isSafeInteger(issue.number) || issue.number < 1) throw new TypeError("destiny-github-task-issue-invalid");
  if (issue.state !== "open") throw new TypeError("destiny-github-task-state-invalid");
  if (issue.pull_request != null) throw new TypeError("destiny-github-task-pr-invalid");
  if (issue.user?.login !== owner) throw new TypeError("destiny-github-task-author-invalid");
  if (typeof issue.body !== "string") throw new TypeError("destiny-github-task-body-invalid");
  const matches = [...issue.body.matchAll(CODEX_MARKER)];
  if (matches.length === 0) throw new TypeError("destiny-github-task-marker-missing");
  if (matches.length !== 1) throw new TypeError("destiny-github-task-marker-ambiguous");

  const payload = parseJsonObject(matches[0][1], "destiny-github-task-json-invalid");
  if (payload.schemaVersion !== 1 || payload.kind !== "destiny-codex-task") throw new TypeError("destiny-github-task-schema-invalid");
  if (typeof payload.taskId !== "string" || !CODEX_TASK_ID.test(payload.taskId)) throw new TypeError("destiny-github-task-id-invalid");
  if (payload.repository !== repository) throw new TypeError("destiny-github-task-repository-mismatch");
  const prompt = opaque(payload.prompt, "destiny-github-task-prompt-invalid", 8000);
  if (payload.attempts !== 1 || payload.implementationOnly !== true || payload.codeReview !== false) {
    throw new TypeError("destiny-github-task-policy-invalid");
  }
  const keys = Object.keys(payload).sort().join(",");
  if (keys !== "attempts,codeReview,implementationOnly,kind,prompt,repository,schemaVersion,taskId") {
    throw new TypeError("destiny-github-task-schema-invalid");
  }
  return Object.freeze({ schemaVersion: 1, taskId: payload.taskId, repository, issueNumber: issue.number, prompt, attempts: 1, implementationOnly: true, codeReview: false });
}

export function destinyGithubTaskDigest(taskInput) {
  const task = taskInput && typeof taskInput === "object" && !Array.isArray(taskInput) && Object.hasOwn(taskInput, "issueNumber")
    ? taskInput
    : parseDestinyGithubTaskIssue(taskInput, { repository: taskInput?.repository, owner: taskInput?.owner });
  const canonical = JSON.stringify({
    schemaVersion: 1,
    taskId: task.taskId,
    repository: task.repository,
    issueNumber: task.issueNumber,
    prompt: opaque(task.prompt, "destiny-github-task-prompt-invalid", 8000),
    attempts: 1,
    implementationOnly: true,
    codeReview: false,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}


export function buildCodexCloudExecArgs(environmentIdInput, task) {
  const environmentId = opaque(environmentIdInput, "destiny-codex-environment-id-invalid");
  if (!task || typeof task !== "object" || task.implementationOnly !== true || task.codeReview !== false || task.attempts !== 1) {
    throw new TypeError("destiny-github-task-policy-invalid");
  }
  return Object.freeze(["cloud", "exec", "--env", environmentId, "--attempts", "1", task.prompt]);
}

export function parseDestinyWorkTaskPullRequest(pullRequest, { repository, owner }) {
  if (!pullRequest || typeof pullRequest !== "object" || Array.isArray(pullRequest)) throw new TypeError("destiny-work-task-pr-invalid");
  validateRepositoryAndOwner(repository, owner, "destiny-work-task");
  if (!Number.isSafeInteger(pullRequest.number) || pullRequest.number < 1) throw new TypeError("destiny-work-task-pr-invalid");
  if (pullRequest.state !== "open") throw new TypeError("destiny-work-task-state-invalid");
  if (pullRequest.user?.login !== owner) throw new TypeError("destiny-work-task-author-invalid");
  if (pullRequest.base?.repo?.full_name !== repository) throw new TypeError("destiny-work-task-repository-mismatch");

  const payload = parseJsonObject(extractSingleWorkMarker(pullRequest.body), "destiny-work-task-json-invalid");
  if (payload.schemaVersion !== 1 || payload.kind !== "destiny-work-task") throw new TypeError("destiny-work-task-schema-invalid");
  if (typeof payload.taskId !== "string" || !WORK_TASK_ID.test(payload.taskId)) throw new TypeError("destiny-work-task-id-invalid");
  const objective = opaque(payload.objective, "destiny-work-task-objective-invalid", 8000);
  if (payload.attempts !== 1 || payload.implementationOnly !== true || payload.codeReview !== false) throw new TypeError("destiny-work-task-policy-invalid");
  const keys = Object.keys(payload).sort().join(",");
  if (keys !== "attempts,codeReview,implementationOnly,kind,objective,schemaVersion,taskId") throw new TypeError("destiny-work-task-schema-invalid");

  return Object.freeze({
    schemaVersion: 1,
    taskId: payload.taskId,
    repository,
    pullRequest: pullRequest.number,
    objective,
    attempts: 1,
    implementationOnly: true,
    codeReview: false,
    executorLane: WORK_LANE,
  });
}

export function destinyWorkReceiptPath(taskIdInput) {
  if (typeof taskIdInput !== "string" || !WORK_TASK_ID.test(taskIdInput)) throw new TypeError("destiny-work-task-id-invalid");
  return `coordination/destiny-work-receipts/${taskIdInput}.json`;
}

export function buildDestinyWorkReceipt(task) {
  const valid = validateParsedWorkTask(task);
  return Object.freeze({
    schemaVersion: 1,
    kind: "destiny-work-receipt",
    taskId: valid.taskId,
    taskDigest: destinyWorkTaskDigest(valid),
    status: "completed",
    executorLane: WORK_LANE,
  });
}

export function validateDestinyWorkReceipt(receiptInput, expectedTask) {
  const validTask = validateParsedWorkTask(expectedTask);
  const receipt = typeof receiptInput === "string"
    ? parseJsonObject(receiptInput, "destiny-work-receipt-json-invalid")
    : receiptInput;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new TypeError("destiny-work-receipt-invalid");
  if (receipt.schemaVersion !== 1 || receipt.kind !== "destiny-work-receipt" || receipt.status !== "completed" || receipt.executorLane !== WORK_LANE) {
    throw new TypeError("destiny-work-receipt-invalid");
  }
  if (typeof receipt.taskId !== "string" || !WORK_TASK_ID.test(receipt.taskId)) throw new TypeError("destiny-work-receipt-invalid");
  if (receipt.taskId !== validTask.taskId) throw new TypeError("destiny-work-receipt-task-mismatch");
  if (typeof receipt.taskDigest !== "string" || !DIGEST.test(receipt.taskDigest)) throw new TypeError("destiny-work-receipt-invalid");
  if (receipt.taskDigest !== destinyWorkTaskDigest(validTask)) throw new TypeError("destiny-work-receipt-task-digest-mismatch");
  const keys = Object.keys(receipt).sort().join(",");
  if (keys !== "executorLane,kind,schemaVersion,status,taskDigest,taskId") throw new TypeError("destiny-work-receipt-schema-invalid");
  return Object.freeze({ ...receipt });
}

export function planDestinyWorkExecution(task, { existingReceipt = null } = {}) {
  const valid = validateParsedWorkTask(task);
  const receiptPath = destinyWorkReceiptPath(valid.taskId);
  if (existingReceipt != null) {
    validateDestinyWorkReceipt(existingReceipt, valid);
    return Object.freeze({ execute: false, reason: "already-completed", taskId: valid.taskId, receiptPath });
  }
  return Object.freeze({ execute: true, reason: "pending", taskId: valid.taskId, receiptPath });
}

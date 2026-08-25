import { createHash, randomUUID } from "node:crypto";
import { COORDINATION_PRIVACY, pathAllowed } from "./coordination-records.mjs";

const TASK_KEYS = new Set([
  "schemaVersion", "taskId", "idempotencyKey", "repository", "baseCommit", "title", "task",
  "allowedPaths", "verification", "maximumAttempts", "integrationMode", "createdBy", "createdAt", "privacy",
]);
const RETURN_KEYS = new Set([
  "schemaVersion", "taskId", "idempotencyKey", "state", "issueNumber", "pullRequestNumber",
  "baseCommit", "headCommit", "changedFiles", "verification", "summary", "completedAt", "privacy",
]);
const PRIVACY_KEYS = new Set(["chatAccess", "conversationTranscriptIncluded", "credentialsIncluded", "contentBoundary"]);
const TERMINAL_STATES = new Set(["completed", "blocked"]);
const INTEGRATION_MODES = new Set(["pull-request", "merge-after-verify"]);
const SECRET_PATTERN = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+eyJ[A-Za-z0-9_-]{8,})/;

export function createCodexCloudTask(input, { taskId = `ccx-${randomUUID()}`, now = new Date().toISOString() } = {}) {
  return validateCodexCloudTask({
    schemaVersion: 1,
    taskId,
    idempotencyKey: input.idempotencyKey,
    repository: input.repository,
    baseCommit: String(input.baseCommit ?? "").toLowerCase(),
    title: input.title,
    task: input.task,
    allowedPaths: input.allowedPaths ?? [],
    verification: input.verification ?? [],
    maximumAttempts: input.maximumAttempts ?? 1,
    integrationMode: input.integrationMode ?? "pull-request",
    createdBy: input.createdBy ?? "main-codex",
    createdAt: now,
    privacy: { ...COORDINATION_PRIVACY },
  });
}

export function validateCodexCloudTask(record) {
  exact(record, TASK_KEYS, "Codex cloud task");
  if (record.schemaVersion !== 1) throw new TypeError("Codex cloud task schema version is invalid.");
  taskId(record.taskId);
  idempotencyKey(record.idempotencyKey);
  repository(record.repository);
  commit(record.baseCommit, "task base commit");
  bounded(record.title, 200, "task title");
  bounded(record.task, 2400, "task description", true);
  paths(record.allowedPaths, 64, "task allowed paths");
  strings(record.verification, 20, 300, "task verification");
  integer(record.maximumAttempts, 1, 3, "task maximum attempts");
  if (!INTEGRATION_MODES.has(record.integrationMode)) throw new TypeError("Codex cloud task integration mode is invalid.");
  slug(record.createdBy, "task creator");
  timestamp(record.createdAt, "task creation time");
  privacy(record.privacy);
  rejectSecrets([record.idempotencyKey, record.title, record.task, ...record.verification]);
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    idempotencyKey: record.idempotencyKey,
    repository: record.repository,
    baseCommit: record.baseCommit.toLowerCase(),
    title: record.title,
    task: record.task,
    allowedPaths: Object.freeze([...record.allowedPaths]),
    verification: Object.freeze([...record.verification]),
    maximumAttempts: record.maximumAttempts,
    integrationMode: record.integrationMode,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    privacy: Object.freeze({ ...record.privacy }),
  });
}

export function renderCodexCloudIssue(record) {
  const task = validateCodexCloudTask(record);
  const fingerprint = createHash("sha256").update(JSON.stringify(task)).digest("hex");
  const body = [
    "@codex",
    "",
    "<!-- mahoraga-codex-cloud-task:v1",
    `task-id=${task.taskId}`,
    `idempotency-key=${task.idempotencyKey}`,
    `fingerprint-sha256=${fingerprint}`,
    "-->",
    "",
    "## Bounded task",
    "",
    task.task,
    "",
    "## Repository boundary",
    "",
    `- Repository: \`${task.repository}\``,
    `- Base commit: \`${task.baseCommit}\``,
    `- Allowed paths: ${task.allowedPaths.map((item) => `\`${item}\``).join(", ")}`,
    `- Maximum attempts: ${task.maximumAttempts}`,
    `- Integration mode: \`${task.integrationMode}\``,
    task.integrationMode === "merge-after-verify"
      ? "- Return a pull request for Primary review; Primary may merge only after every declared verification command passes."
      : "- Return a pull request for Primary review; do not merge it as part of this task.",
    "",
    "## Verification",
    "",
    ...task.verification.map((item) => `- \`${item}\``),
    "",
    "## Privacy boundary",
    "",
    "Use only this bounded GitHub task and repository contents. Do not access, request, or export ChatGPT conversations, browser history, personal files, credentials, tokens, plugin responses, or unrelated context. Do not place model transcripts in issues, commits, pull requests, or result records.",
  ].join("\n");
  return Object.freeze({
    title: `[CODEX] ${task.title}`,
    body,
    labels: Object.freeze(["codex:queued", "privacy:repo-only"]),
    fingerprint,
  });
}

export function createCodexCloudDispatchBundle(records) {
  if (!Array.isArray(records)) throw new TypeError("Codex cloud dispatch records must be an array.");
  const taskIds = new Set();
  const idempotencyKeys = new Set();
  const tasks = records.map((record) => {
    const task = validateCodexCloudTask(record);
    if (taskIds.has(task.taskId)) throw new TypeError(`Duplicate Codex cloud task ID: ${task.taskId}`);
    if (idempotencyKeys.has(task.idempotencyKey)) throw new TypeError(`Duplicate Codex cloud idempotency key: ${task.idempotencyKey}`);
    taskIds.add(task.taskId);
    idempotencyKeys.add(task.idempotencyKey);
    return Object.freeze({
      taskId: task.taskId,
      idempotencyKey: task.idempotencyKey,
      issue: renderCodexCloudIssue(task),
    });
  });
  return Object.freeze({ schemaVersion: 1, tasks: Object.freeze(tasks) });
}

export function createCodexCloudReturn(taskRecord, input, { now = new Date().toISOString() } = {}) {
  const task = validateCodexCloudTask(taskRecord);
  const state = input.state ?? "completed";
  return validateCodexCloudReturn({
    schemaVersion: 1,
    taskId: task.taskId,
    idempotencyKey: task.idempotencyKey,
    state,
    issueNumber: input.issueNumber,
    pullRequestNumber: input.pullRequestNumber ?? null,
    baseCommit: task.baseCommit,
    headCommit: input.headCommit ? String(input.headCommit).toLowerCase() : null,
    changedFiles: input.changedFiles ?? [],
    verification: input.verification ?? [],
    summary: input.summary,
    completedAt: now,
    privacy: { ...COORDINATION_PRIVACY },
  }, task);
}

export function validateCodexCloudReturn(record, taskRecord = null) {
  exact(record, RETURN_KEYS, "Codex cloud return");
  if (record.schemaVersion !== 1) throw new TypeError("Codex cloud return schema version is invalid.");
  taskId(record.taskId);
  idempotencyKey(record.idempotencyKey);
  if (!TERMINAL_STATES.has(record.state)) throw new TypeError("Codex cloud return state is invalid.");
  integer(record.issueNumber, 1, Number.MAX_SAFE_INTEGER, "return issue number");
  if (record.state === "completed") {
    integer(record.pullRequestNumber, 1, Number.MAX_SAFE_INTEGER, "return pull request number");
    commit(record.headCommit, "return head commit");
  } else {
    nullableInteger(record.pullRequestNumber, "return pull request number");
    nullableCommit(record.headCommit, "return head commit");
  }
  commit(record.baseCommit, "return base commit");
  paths(record.changedFiles, 128, "return changed files", true);
  strings(record.verification, 20, 300, "return verification");
  bounded(record.summary, 2000, "return summary", true);
  timestamp(record.completedAt, "return completion time");
  privacy(record.privacy);
  rejectSecrets([record.summary, ...record.verification]);
  if (taskRecord) {
    const task = validateCodexCloudTask(taskRecord);
    if (record.taskId !== task.taskId || record.idempotencyKey !== task.idempotencyKey || record.baseCommit !== task.baseCommit) {
      throw new TypeError("Codex cloud return does not match its task.");
    }
    for (const file of record.changedFiles) if (!pathAllowed(file, task.allowedPaths)) {
      throw new TypeError(`Codex cloud return changed file is outside task scope: ${file}`);
    }
  }
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    idempotencyKey: record.idempotencyKey,
    state: record.state,
    issueNumber: record.issueNumber,
    pullRequestNumber: record.pullRequestNumber,
    baseCommit: record.baseCommit.toLowerCase(),
    headCommit: record.headCommit?.toLowerCase() ?? null,
    changedFiles: Object.freeze([...record.changedFiles]),
    verification: Object.freeze([...record.verification]),
    summary: record.summary,
    completedAt: record.completedAt,
    privacy: Object.freeze({ ...record.privacy }),
  });
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`);
}
function privacy(value) {
  exact(value, PRIVACY_KEYS, "Codex cloud privacy boundary");
  if (value.chatAccess !== false || value.conversationTranscriptIncluded !== false || value.credentialsIncluded !== false ||
      value.contentBoundary !== COORDINATION_PRIVACY.contentBoundary) throw new TypeError("Codex cloud privacy boundary is invalid.");
}
function taskId(value) { if (typeof value !== "string" || !/^ccx-[a-f0-9-]{8,72}$/i.test(value)) throw new TypeError("Codex cloud task ID is invalid."); }
function idempotencyKey(value) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) throw new TypeError("Codex cloud idempotency key is invalid."); }
function repository(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.split("/").some((item) => item === "." || item === "..")) throw new TypeError("Codex cloud repository is invalid.");
}
function commit(value, label) { if (typeof value !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) throw new TypeError(`${label} is invalid.`); }
function nullableCommit(value, label) { if (value !== null) commit(value, label); }
function slug(value, label) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function integer(value, minimum, maximum, label) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} is invalid.`); }
function nullableInteger(value, label) { if (value !== null) integer(value, 1, Number.MAX_SAFE_INTEGER, label); }
function bounded(value, maximum, label, multiline = false) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\0/.test(value) || (!multiline && /[\r\n]/.test(value))) throw new TypeError(`${label} is invalid.`);
}
function strings(value, maximumItems, maximumLength, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems || new Set(value).size !== value.length) throw new TypeError(`${label} is invalid.`);
  value.forEach((item) => bounded(item, maximumLength, label));
}
function paths(value, maximumItems, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > maximumItems || new Set(value).size !== value.length) throw new TypeError(`${label} are invalid.`);
  value.forEach((item) => safePath(item, label));
}
function safePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.startsWith("/") || value.startsWith("\\") || value.includes("\\") || /[\r\n\0]/.test(value) || !/^[A-Za-z0-9._/-]+$/.test(value)) throw new TypeError(`${label} are invalid.`);
  const segments = value.split("/");
  if (segments.some((item) => !item || item === "." || item === "..") || segments[0].toLowerCase() === ".git") throw new TypeError(`${label} are invalid.`);
}
function timestamp(value, label) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} is invalid.`); }
function rejectSecrets(values) { if (values.some((value) => SECRET_PATTERN.test(value))) throw new TypeError("Codex cloud records cannot contain credentials or tokens."); }

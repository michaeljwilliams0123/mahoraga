import { randomUUID } from "node:crypto";

const ASSIGNMENT_KEYS = new Set([
  "schemaVersion", "assignmentId", "correlationId", "title", "taskArea", "expectedTask",
  "expectedBaseCommit", "returnBranch", "allowedPaths", "createdBy", "assignedTo", "createdAt", "privacy",
]);
const RESULT_KEYS = new Set([
  "schemaVersion", "assignmentId", "status", "completedBy", "returnBranch", "returnCommit",
  "changedFiles", "verification", "summary", "completedAt", "privacy",
]);
const PRIVACY_KEYS = new Set(["chatAccess", "conversationTranscriptIncluded", "credentialsIncluded", "contentBoundary"]);
const RESULT_STATES = new Set(["completed", "blocked"]);

export const COORDINATION_PRIVACY = Object.freeze({
  chatAccess: false,
  conversationTranscriptIncluded: false,
  credentialsIncluded: false,
  contentBoundary: "task-metadata-and-repository-context-only",
});

export function createAssignmentRecord(input, { assignmentId = `sec-${randomUUID()}`, now = new Date().toISOString() } = {}) {
  const record = {
    schemaVersion: 1,
    assignmentId,
    correlationId: input.correlationId ?? assignmentId,
    title: input.title,
    taskArea: input.taskArea,
    expectedTask: input.expectedTask,
    expectedBaseCommit: String(input.expectedBaseCommit ?? "").toLowerCase(),
    returnBranch: `secondary/${assignmentId}`,
    allowedPaths: input.allowedPaths ?? [],
    createdBy: input.createdBy ?? "main-codex",
    assignedTo: input.assignedTo ?? "secondary-codex",
    createdAt: now,
    privacy: { ...COORDINATION_PRIVACY },
  };
  return validateAssignmentRecord(record);
}

export function validateAssignmentRecord(record) {
  exactRecord(record, ASSIGNMENT_KEYS, "assignment");
  if (record.schemaVersion !== 1) throw new TypeError("Coordination assignment schema version is invalid.");
  assignmentId(record.assignmentId);
  bounded(record.correlationId, 120, "assignment correlation ID");
  bounded(record.title, 240, "assignment title");
  slug(record.taskArea, "assignment task area");
  bounded(record.expectedTask, 1000, "assignment expected task", true);
  commit(record.expectedBaseCommit, "assignment expected base commit");
  if (record.returnBranch !== `secondary/${record.assignmentId}`) throw new TypeError("Assignment return branch is invalid.");
  paths(record.allowedPaths, 32, "assignment allowed paths");
  slug(record.createdBy, "assignment creator");
  slug(record.assignedTo, "assignment recipient");
  timestamp(record.createdAt, "assignment creation time");
  privacy(record.privacy);
  return Object.freeze(structuredClone(record));
}

export function createResultRecord(assignment, input, { now = new Date().toISOString() } = {}) {
  validateAssignmentRecord(assignment);
  const status = input.status ?? "completed";
  const record = {
    schemaVersion: 1,
    assignmentId: assignment.assignmentId,
    status,
    completedBy: input.completedBy ?? assignment.assignedTo,
    returnBranch: assignment.returnBranch,
    returnCommit: input.returnCommit ? String(input.returnCommit).toLowerCase() : null,
    changedFiles: input.changedFiles ?? [],
    verification: input.verification ?? [],
    summary: input.summary,
    completedAt: now,
    privacy: { ...COORDINATION_PRIVACY },
  };
  return validateResultRecord(record, assignment);
}

export function validateResultRecord(record, assignment = null) {
  exactRecord(record, RESULT_KEYS, "result");
  if (record.schemaVersion !== 1) throw new TypeError("Coordination result schema version is invalid.");
  assignmentId(record.assignmentId);
  if (!RESULT_STATES.has(record.status)) throw new TypeError("Coordination result status is invalid.");
  slug(record.completedBy, "result author");
  if (record.returnBranch !== `secondary/${record.assignmentId}`) throw new TypeError("Result return branch is invalid.");
  if (record.status === "completed") commit(record.returnCommit, "result return commit");
  else if (record.returnCommit !== null) commit(record.returnCommit, "result return commit");
  paths(record.changedFiles, 128, "result changed files", true);
  stringList(record.verification, 20, 240, "result verification");
  bounded(record.summary, 2000, "result summary", true);
  timestamp(record.completedAt, "result completion time");
  privacy(record.privacy);
  if (assignment) {
    const expected = validateAssignmentRecord(assignment);
    if (record.assignmentId !== expected.assignmentId || record.returnBranch !== expected.returnBranch) {
      throw new TypeError("Result does not match its assignment.");
    }
    for (const file of record.changedFiles) if (!pathAllowed(file, expected.allowedPaths)) {
      throw new TypeError(`Result changed file is outside assignment scope: ${file}`);
    }
  }
  return Object.freeze(structuredClone(record));
}

export function pathAllowed(file, allowedPaths) {
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) return false;
  return allowedPaths.some((allowed) => file === allowed || file.startsWith(`${allowed}/`));
}

export function validateActualChanges(actualFiles, result, assignment, protocolFiles = []) {
  const expected = validateAssignmentRecord(assignment);
  const returned = validateResultRecord(result, expected);
  paths(actualFiles, 256, "actual changed files", true);
  paths(protocolFiles, 4, "coordination protocol files", true);
  const protocol = new Set(protocolFiles);
  const implementationFiles = actualFiles.filter((file) => !protocol.has(file));
  for (const file of implementationFiles) if (!pathAllowed(file, expected.allowedPaths)) {
    throw new TypeError(`Actual changed file is outside assignment scope: ${file}`);
  }
  const actual = [...implementationFiles].sort();
  const claimed = [...returned.changedFiles].sort();
  if (actual.length !== claimed.length || actual.some((file, index) => file !== claimed[index])) {
    throw new TypeError("Result changed files do not match the actual Git diff.");
  }
  return Object.freeze(actual);
}

function exactRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Coordination ${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`Coordination ${label} field is not allowed: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`Coordination ${label} field is missing: ${key}`);
}
function privacy(value) {
  exactRecord(value, PRIVACY_KEYS, "privacy boundary");
  if (value.chatAccess !== false || value.conversationTranscriptIncluded !== false || value.credentialsIncluded !== false ||
      value.contentBoundary !== COORDINATION_PRIVACY.contentBoundary) throw new TypeError("Coordination privacy boundary is invalid.");
}
function assignmentId(value) { if (typeof value !== "string" || !/^sec-[a-f0-9-]{8,72}$/i.test(value)) throw new TypeError("Assignment ID is invalid."); }
function commit(value, label) { if (typeof value !== "string" || !/^[a-f0-9]{7,64}$/i.test(value)) throw new TypeError(`${label} is invalid.`); }
function slug(value, label) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function bounded(value, maximum, label, multiline = false) {
  const invalid = typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\u0000/.test(value) || (!multiline && /[\r\n]/.test(value));
  if (invalid) throw new TypeError(`${label} is invalid.`);
}
function safePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.startsWith("/") || value.startsWith("\\") ||
      value.includes("..") || value.includes("\\") || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value)) throw new TypeError(`${label} is invalid.`);
}
function paths(value, maximum, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > maximum || new Set(value).size !== value.length) throw new TypeError(`${label} are invalid.`);
  value.forEach((item) => safePath(item, label));
}
function stringList(value, maximumItems, maximumLength, label) {
  if (!Array.isArray(value) || value.length > maximumItems) throw new TypeError(`${label} is invalid.`);
  value.forEach((item) => bounded(item, maximumLength, label));
}
function timestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} is invalid.`);
}

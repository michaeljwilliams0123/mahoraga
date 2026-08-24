import { createHash } from "node:crypto";

export const RELAY_PROTOCOL_VERSION = "3.0.1";
export const RELAY_DELIVERY = Object.freeze({ mode: "at-least-once", effectSemantics: "idempotent" });

const TASK_KEYS = new Set([
  "protocolVersion", "taskId", "idempotencyKey", "requestHash", "request", "delivery", "status",
  "attemptCount", "maxAttempts", "fencingToken", "lease", "completion", "lastFailure", "cancellation",
  "createdAt", "updatedAt",
]);
const SUBMISSION_KEYS = new Set(["idempotencyKey", "taskType", "repository", "baseCommit", "allowedPaths", "maxAttempts", "metadata"]);
const REQUEST_KEYS = new Set(["taskType", "repository", "baseCommit", "allowedPaths", "maxAttempts", "metadata"]);
const DELIVERY_KEYS = new Set(["mode", "effectSemantics"]);
const LEASE_KEYS = new Set(["runnerId", "fencingToken", "leasedAt", "expiresAt"]);
const COMPLETE_KEYS = new Set(["runnerId", "fencingToken", "completedAt", "receipt"]);
const RECEIPT_KEYS = new Set(["headCommit", "verificationDigest", "changedPaths"]);
const FAILURE_KEYS = new Set(["runnerId", "fencingToken", "failedAt", "code", "retryable"]);
const CANCELLATION_KEYS = new Set(["cancelledAt", "reasonCode"]);
const LEASE_INPUT_KEYS = new Set(["runnerId", "leaseSeconds"]);
const FENCED_LEASE_INPUT_KEYS = new Set(["runnerId", "fencingToken", "leaseSeconds"]);
const COMPLETE_INPUT_KEYS = new Set(["runnerId", "fencingToken", "receipt"]);
const FAIL_INPUT_KEYS = new Set(["runnerId", "fencingToken", "code", "retryable"]);
const CANCEL_INPUT_KEYS = new Set(["reasonCode"]);
const STATUS_VALUES = new Set(["queued", "leased", "succeeded", "failed", "cancelled"]);
const METADATA_KEYS = new Set(["correlationId", "dataClass", "executionLane", "integrationMode", "issueNumber", "labels", "priority", "sourceIssue", "taskArea", "toolProfile"]);
const FORBIDDEN_METADATA_KEY = /(?:api.?key|auth|browser|chat|content|conversation|credential|document|history|message|password|prompt|response|secret|token)/i;
const SECRET_VALUE = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;

export class RelayContractError extends TypeError {
  constructor(code) {
    super(code);
    this.name = "RelayContractError";
    this.code = code;
  }
}

export function normalizeTaskSubmission(input) {
  exact(input, SUBMISSION_KEYS, "relay-submission");
  const idempotencyKey = boundedToken(input.idempotencyKey, 128, "relay-idempotency-key-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
  const taskType = boundedToken(input.taskType, 64, "relay-task-type-invalid", /^[a-z][a-z0-9.-]*$/);
  const repository = normalizeRepository(input.repository);
  const baseCommit = normalizeDigest(input.baseCommit, 40, "relay-base-commit-invalid");
  const allowedPaths = normalizePaths(input.allowedPaths, { maximum: 32, patterns: true, code: "relay-allowed-paths-invalid" });
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10) fail("relay-max-attempts-invalid");
  const metadata = normalizeMetadata(input.metadata);
  return deepFreeze({ idempotencyKey, taskType, repository, baseCommit, allowedPaths, maxAttempts: input.maxAttempts, metadata });
}

export function computeRequestHash(input) {
  const normalized = Object.hasOwn(input ?? {}, "idempotencyKey") ? normalizeTaskSubmission(input) : validateRequest(input);
  const request = requestFrom(normalized);
  return digest(canonicalJson(request));
}

export function submitTask(existingTasks, input, { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(existingTasks) || existingTasks.length > 10000) fail("relay-task-registry-invalid");
  const tasks = existingTasks.map(validateRelayTask);
  const normalized = normalizeTaskSubmission(input);
  const request = requestFrom(normalized);
  const requestHash = digest(canonicalJson(request));
  const matching = tasks.filter((task) => task.idempotencyKey === normalized.idempotencyKey);
  if (matching.length > 1) fail("relay-task-registry-invalid");
  if (matching.length === 1) {
    if (matching[0].requestHash !== requestHash) fail("relay-idempotency-conflict");
    return deepFreeze({ created: false, task: matching[0] });
  }
  const timestamp = normalizedTime(now, "relay-time-invalid");
  const task = validateRelayTask({
    protocolVersion: RELAY_PROTOCOL_VERSION,
    taskId: taskId(normalized.idempotencyKey, requestHash),
    idempotencyKey: normalized.idempotencyKey,
    requestHash,
    request,
    delivery: RELAY_DELIVERY,
    status: "queued",
    attemptCount: 0,
    maxAttempts: normalized.maxAttempts,
    fencingToken: 0,
    lease: null,
    completion: null,
    lastFailure: null,
    cancellation: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return deepFreeze({ created: true, task });
}

export function leaseTask(record, input, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  exact(input, LEASE_INPUT_KEYS, "relay-lease-request");
  const runnerId = runner(input.runnerId);
  const leaseSeconds = duration(input.leaseSeconds);
  const timestamp = transitionTime(task, now);
  if (terminal(task.status)) fail("relay-task-terminal");
  if (task.status === "leased" && Date.parse(task.lease.expiresAt) > Date.parse(timestamp)) fail("relay-lease-active");
  if (task.attemptCount >= task.maxAttempts) fail("relay-attempt-limit-reached");
  const fencingToken = task.fencingToken + 1;
  return validateRelayTask({
    ...task,
    status: "leased",
    attemptCount: task.attemptCount + 1,
    fencingToken,
    lease: { runnerId, fencingToken, leasedAt: timestamp, expiresAt: addSeconds(timestamp, leaseSeconds) },
    updatedAt: timestamp,
  });
}

export function renewLease(record, input, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  exact(input, FENCED_LEASE_INPUT_KEYS, "relay-renew-request");
  const timestamp = transitionTime(task, now);
  const active = activeLease(task, runner(input.runnerId), fencing(input.fencingToken), timestamp);
  const leaseSeconds = duration(input.leaseSeconds);
  const base = Math.max(Date.parse(timestamp), Date.parse(active.expiresAt));
  return validateRelayTask({
    ...task,
    lease: { ...active, expiresAt: new Date(base + leaseSeconds * 1000).toISOString() },
    updatedAt: timestamp,
  });
}

export function completeTask(record, input, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  exact(input, COMPLETE_INPUT_KEYS, "relay-complete-request");
  const runnerId = runner(input.runnerId);
  const fencingToken = fencing(input.fencingToken);
  const receipt = normalizeReceipt(input.receipt);
  if (task.status === "succeeded") {
    const same = task.completion.runnerId === runnerId && task.completion.fencingToken === fencingToken
      && canonicalJson(task.completion.receipt) === canonicalJson(receipt);
    if (!same) fail("relay-completion-replay-conflict");
    return task;
  }
  const timestamp = transitionTime(task, now);
  activeLease(task, runnerId, fencingToken, timestamp);
  return validateRelayTask({
    ...task,
    status: "succeeded",
    lease: null,
    completion: { runnerId, fencingToken, completedAt: timestamp, receipt },
    updatedAt: timestamp,
  });
}

export function failTask(record, input, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  exact(input, FAIL_INPUT_KEYS, "relay-fail-request");
  const runnerId = runner(input.runnerId);
  const fencingToken = fencing(input.fencingToken);
  const code = boundedToken(input.code, 64, "relay-failure-code-invalid", /^[a-z][a-z0-9.-]*$/);
  if (typeof input.retryable !== "boolean") fail("relay-failure-retryable-invalid");
  if (task.lastFailure?.fencingToken === fencingToken) {
    const same = task.lastFailure.runnerId === runnerId && task.lastFailure.code === code && task.lastFailure.retryable === input.retryable;
    if (!same) fail("relay-failure-replay-conflict");
    return task;
  }
  const timestamp = transitionTime(task, now);
  activeLease(task, runnerId, fencingToken, timestamp);
  const retryable = input.retryable && task.attemptCount < task.maxAttempts;
  return validateRelayTask({
    ...task,
    status: retryable ? "queued" : "failed",
    lease: null,
    lastFailure: { runnerId, fencingToken, failedAt: timestamp, code, retryable: input.retryable },
    updatedAt: timestamp,
  });
}

export function cancelTask(record, input, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  exact(input, CANCEL_INPUT_KEYS, "relay-cancel-request");
  const reasonCode = boundedToken(input.reasonCode, 64, "relay-cancellation-reason-invalid", /^[a-z][a-z0-9.-]*$/);
  if (task.status === "cancelled") {
    if (task.cancellation.reasonCode !== reasonCode) fail("relay-cancellation-replay-conflict");
    return task;
  }
  if (task.status === "succeeded" || task.status === "failed") fail("relay-task-terminal");
  const timestamp = transitionTime(task, now);
  return validateRelayTask({
    ...task,
    status: "cancelled",
    lease: null,
    cancellation: { cancelledAt: timestamp, reasonCode },
    updatedAt: timestamp,
  });
}

export function taskStatus(record, { now = new Date().toISOString() } = {}) {
  const task = validateRelayTask(record);
  const timestamp = normalizedTime(now, "relay-time-invalid");
  return deepFreeze({
    protocolVersion: task.protocolVersion,
    taskId: task.taskId,
    requestHash: task.requestHash,
    status: task.status,
    delivery: task.delivery,
    attemptCount: task.attemptCount,
    maxAttempts: task.maxAttempts,
    fencingToken: task.fencingToken,
    lease: task.lease ? { runnerId: task.lease.runnerId, expiresAt: task.lease.expiresAt, expired: Date.parse(task.lease.expiresAt) <= Date.parse(timestamp) } : null,
    terminalAt: task.completion?.completedAt ?? task.cancellation?.cancelledAt ?? (task.status === "failed" ? task.lastFailure?.failedAt : null) ?? null,
  });
}

export function validateRelayTask(record) {
  exact(record, TASK_KEYS, "relay-task");
  if (record.protocolVersion !== RELAY_PROTOCOL_VERSION) fail("relay-protocol-version-invalid");
  const idempotencyKey = boundedToken(record.idempotencyKey, 128, "relay-idempotency-key-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
  const request = validateRequest(record.request);
  const requestHash = normalizeDigest(record.requestHash, 64, "relay-request-hash-invalid");
  if (requestHash !== digest(canonicalJson(request))) fail("relay-request-hash-mismatch");
  if (record.taskId !== taskId(idempotencyKey, requestHash)) fail("relay-task-id-invalid");
  exact(record.delivery, DELIVERY_KEYS, "relay-delivery");
  if (record.delivery.mode !== RELAY_DELIVERY.mode || record.delivery.effectSemantics !== RELAY_DELIVERY.effectSemantics) fail("relay-delivery-invalid");
  if (!STATUS_VALUES.has(record.status)) fail("relay-status-invalid");
  if (!Number.isSafeInteger(record.maxAttempts) || record.maxAttempts < 1 || record.maxAttempts > 10 || record.maxAttempts !== request.maxAttempts) fail("relay-max-attempts-invalid");
  if (!Number.isSafeInteger(record.attemptCount) || record.attemptCount < 0 || record.attemptCount > record.maxAttempts) fail("relay-attempt-count-invalid");
  if (!Number.isSafeInteger(record.fencingToken) || record.fencingToken !== record.attemptCount) fail("relay-fencing-token-invalid");
  const createdAt = normalizedTime(record.createdAt, "relay-created-at-invalid");
  const updatedAt = normalizedTime(record.updatedAt, "relay-updated-at-invalid");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail("relay-timeline-invalid");
  const lease = record.lease === null ? null : validateLease(record.lease, record.fencingToken);
  const completion = record.completion === null ? null : validateCompletion(record.completion, record.fencingToken);
  const lastFailure = record.lastFailure === null ? null : validateFailure(record.lastFailure, record.fencingToken);
  const cancellation = record.cancellation === null ? null : validateCancellation(record.cancellation);
  validateState(record.status, { lease, completion, lastFailure, cancellation, attemptCount: record.attemptCount, maxAttempts: record.maxAttempts });
  for (const eventTime of [lease?.leasedAt, completion?.completedAt, lastFailure?.failedAt, cancellation?.cancelledAt].filter(Boolean)) {
    if (Date.parse(eventTime) < Date.parse(createdAt) || Date.parse(eventTime) > Date.parse(updatedAt)) fail("relay-timeline-invalid");
  }
  return deepFreeze({ ...structuredClone(record), idempotencyKey, requestHash, request, delivery: { ...RELAY_DELIVERY }, lease, completion, lastFailure, cancellation, createdAt, updatedAt });
}

function validateRequest(value) {
  exact(value, REQUEST_KEYS, "relay-request");
  const normalized = {
    taskType: boundedToken(value.taskType, 64, "relay-task-type-invalid", /^[a-z][a-z0-9.-]*$/),
    repository: normalizeRepository(value.repository),
    baseCommit: normalizeDigest(value.baseCommit, 40, "relay-base-commit-invalid"),
    allowedPaths: normalizePaths(value.allowedPaths, { maximum: 32, patterns: true, code: "relay-allowed-paths-invalid" }),
    maxAttempts: value.maxAttempts,
    metadata: normalizeMetadata(value.metadata),
  };
  if (!Number.isSafeInteger(normalized.maxAttempts) || normalized.maxAttempts < 1 || normalized.maxAttempts > 10) fail("relay-max-attempts-invalid");
  return deepFreeze(normalized);
}

function requestFrom(value) {
  return deepFreeze({ taskType: value.taskType, repository: value.repository, baseCommit: value.baseCommit, allowedPaths: value.allowedPaths, maxAttempts: value.maxAttempts, metadata: value.metadata });
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("relay-metadata-invalid");
  const keys = Object.keys(value).sort();
  if (keys.length > 16) fail("relay-metadata-too-large");
  const result = {};
  for (const key of keys) {
    if (!METADATA_KEYS.has(key) || FORBIDDEN_METADATA_KEY.test(key)) fail("relay-metadata-key-rejected");
    const item = value[key];
    if (typeof item === "string") result[key] = safeMetadataString(item);
    else if (typeof item === "boolean") result[key] = item;
    else if (typeof item === "number" && Number.isSafeInteger(item) && Math.abs(item) <= 1_000_000_000) result[key] = item;
    else if (Array.isArray(item) && item.length <= 16) result[key] = item.map((entry) => safeMetadataString(entry));
    else fail("relay-metadata-value-invalid");
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 4096) fail("relay-metadata-too-large");
  return deepFreeze(result);
}

function safeMetadataString(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[\0\r\n]/.test(value) || SECRET_VALUE.test(value)) fail("relay-metadata-value-rejected");
  return value;
}

function normalizeReceipt(value) {
  exact(value, RECEIPT_KEYS, "relay-completion-receipt");
  return deepFreeze({
    headCommit: normalizeDigest(value.headCommit, 40, "relay-head-commit-invalid"),
    verificationDigest: normalizeDigest(value.verificationDigest, 64, "relay-verification-digest-invalid"),
    changedPaths: normalizePaths(value.changedPaths, { maximum: 64, patterns: false, code: "relay-changed-paths-invalid" }),
  });
}

function validateLease(value, currentToken) {
  exact(value, LEASE_KEYS, "relay-lease");
  const result = { runnerId: runner(value.runnerId), fencingToken: fencing(value.fencingToken), leasedAt: normalizedTime(value.leasedAt, "relay-lease-time-invalid"), expiresAt: normalizedTime(value.expiresAt, "relay-lease-expiry-invalid") };
  if (result.fencingToken !== currentToken || Date.parse(result.expiresAt) <= Date.parse(result.leasedAt)) fail("relay-lease-invalid");
  return deepFreeze(result);
}

function validateCompletion(value, currentToken) {
  exact(value, COMPLETE_KEYS, "relay-completion");
  const result = { runnerId: runner(value.runnerId), fencingToken: fencing(value.fencingToken), completedAt: normalizedTime(value.completedAt, "relay-completion-time-invalid"), receipt: normalizeReceipt(value.receipt) };
  if (result.fencingToken !== currentToken) fail("relay-completion-token-invalid");
  return deepFreeze(result);
}

function validateFailure(value, currentToken) {
  exact(value, FAILURE_KEYS, "relay-failure");
  const result = { runnerId: runner(value.runnerId), fencingToken: fencing(value.fencingToken), failedAt: normalizedTime(value.failedAt, "relay-failure-time-invalid"), code: boundedToken(value.code, 64, "relay-failure-code-invalid", /^[a-z][a-z0-9.-]*$/), retryable: value.retryable };
  if (typeof result.retryable !== "boolean" || result.fencingToken > currentToken) fail("relay-failure-invalid");
  return deepFreeze(result);
}

function validateCancellation(value) {
  exact(value, CANCELLATION_KEYS, "relay-cancellation");
  return deepFreeze({ cancelledAt: normalizedTime(value.cancelledAt, "relay-cancellation-time-invalid"), reasonCode: boundedToken(value.reasonCode, 64, "relay-cancellation-reason-invalid", /^[a-z][a-z0-9.-]*$/) });
}

function validateState(status, value) {
  if (status === "queued" && (value.lease || value.completion || value.cancellation || value.attemptCount >= value.maxAttempts)) fail("relay-state-invalid");
  if (status === "queued" && value.lastFailure && !value.lastFailure.retryable) fail("relay-state-invalid");
  if (status === "leased" && (!value.lease || value.completion || value.cancellation || value.attemptCount < 1)) fail("relay-state-invalid");
  if (status === "succeeded" && (value.lease || !value.completion || value.cancellation)) fail("relay-state-invalid");
  if (status === "failed" && (value.lease || value.completion || !value.lastFailure || value.cancellation)) fail("relay-state-invalid");
  if (status === "failed" && value.lastFailure.retryable && value.attemptCount < value.maxAttempts) fail("relay-state-invalid");
  if (status === "cancelled" && (value.lease || value.completion || !value.cancellation)) fail("relay-state-invalid");
}

function activeLease(task, runnerId, token, now) {
  if (task.fencingToken !== token || task.lease?.fencingToken !== token || task.lease?.runnerId !== runnerId) fail("relay-stale-fencing-token");
  if (task.status !== "leased") fail("relay-lease-not-active");
  if (Date.parse(task.lease.expiresAt) <= Date.parse(now)) fail("relay-lease-expired");
  return task.lease;
}

function normalizePaths(value, { maximum, patterns, code }) {
  if (!Array.isArray(value) || value.length > maximum) fail(code);
  const result = value.map((item) => {
    if (typeof item !== "string" || item.length < 1 || item.length > 200 || item.startsWith("/") || item.includes("\\") || /[\0\r\n]/.test(item)) fail(code);
    if (!patterns && /[*?[\]{}]/.test(item)) fail(code);
    const segments = item.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) fail(code);
    return item;
  });
  if (new Set(result).size !== result.length) fail(code);
  return deepFreeze(result.sort());
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}-invalid`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label}-field-not-allowed:${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}-field-missing:${key}`);
}

function normalizeRepository(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(value)) fail("relay-repository-invalid");
  return value.toLowerCase();
}

function normalizeDigest(value, size, code) {
  const normalized = String(value ?? "").toLowerCase();
  if (!new RegExp(`^[a-f0-9]{${size}}$`).test(normalized)) fail(code);
  return normalized;
}

function boundedToken(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(code);
  return value;
}

function runner(value) { return boundedToken(value, 128, "relay-runner-id-invalid", /^[A-Za-z0-9][A-Za-z0-9._:-]*$/); }
function fencing(value) { if (!Number.isSafeInteger(value) || value < 1) fail("relay-fencing-token-invalid"); return value; }
function duration(value) { if (!Number.isSafeInteger(value) || value < 5 || value > 3600) fail("relay-lease-duration-invalid"); return value; }
function terminal(status) { return status === "succeeded" || status === "failed" || status === "cancelled"; }
function taskId(key, requestHash) { return `tsk_${digest(`${key}\n${requestHash}`).slice(0, 32)}`; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function addSeconds(value, seconds) { return new Date(Date.parse(value) + seconds * 1000).toISOString(); }
function transitionTime(task, value) { const result = normalizedTime(value, "relay-time-invalid"); if (Date.parse(result) < Date.parse(task.updatedAt)) fail("relay-time-regression"); return result; }
function normalizedTime(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function deepFreeze(value) { for (const item of Object.values(value)) if (item && typeof item === "object" && !Object.isFrozen(item)) deepFreeze(item); return Object.freeze(value); }
function fail(code) { throw new RelayContractError(code); }

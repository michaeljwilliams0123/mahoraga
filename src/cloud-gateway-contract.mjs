import { createHash, timingSafeEqual } from "node:crypto";

export const GATEWAY_SCHEMA_VERSION = 1;
export const GATEWAY_PRODUCT = "mahoraga";
export const PUBLIC_UI_KEYS = Object.freeze(["schemaVersion", "product", "authenticated", "capabilities"]);
export const MAX_ENVELOPE_BYTES = 16 * 1024;
export const MAX_PAGE_SIZE = 50;

const SUBMIT_KEYS = new Set(["idempotencyKey", "taskType", "requestedOutcome"]);
const STATUS_KEYS = new Set(["taskId", "limit", "cursor"]);
const CANCEL_KEYS = new Set(["taskId", "idempotencyKey", "reasonCode"]);
const ARTIFACT_KEYS = new Set(["taskId", "idempotencyKey", "fileName", "mimeType", "sizeBytes", "sha256"]);
const CURSOR_KEYS = new Set(["taskId", "limit", "cursor"]);
const AUTH_KEYS = new Set(["sessionId", "userId", "csrfToken", "origin", "authenticated"]);
const SESSION_KEYS = new Set(["sessionId", "userId", "csrfDigest", "authenticated", "createdAt"]);
const TASK_KEYS = new Set(["taskId", "userId", "status", "idempotencyKey", "taskType", "createdAt"]);
const GRANT_KEYS = new Set(["grantId", "taskId", "artifactId", "userId", "expiresAt"]);
const EVENT_KEYS = new Set(["eventId", "taskId", "sequence", "kind", "createdAt"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
const TASK_ID = /^tsk-[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._ ()+-]{0,119}$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const SECRET = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;
const PRIVATE_ECHO = /(?:prompt|answer|transcript|chat|conversation|credential|password|browser history)/i;
const ALLOWED_ORIGINS = new Set([
  "https://mahoraga-cloud-workspace.vercel.app",
]);

export class CloudGatewayContractError extends TypeError {
  constructor(code) {
    super(code);
    this.name = "CloudGatewayContractError";
    this.code = code;
  }
}

export function publicUiState({ authenticated = false, capabilities = ["chat"] } = {}) {
  if (typeof authenticated !== "boolean") fail("gateway-ui-authenticated-invalid");
  if (!Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > 16) fail("gateway-ui-capabilities-invalid");
  const names = capabilities.map((item) => boundedToken(item, 32, "gateway-ui-capability-invalid", /^[a-z][a-z0-9-]*$/));
  return freeze({ schemaVersion: GATEWAY_SCHEMA_VERSION, product: GATEWAY_PRODUCT, authenticated, capabilities: names });
}

export function createSession({ sessionId, userId, csrfToken, now = new Date().toISOString() }) {
  const id = boundedToken(sessionId, 128, "gateway-session-id-invalid", TOKEN);
  const user = boundedToken(userId, 64, "gateway-user-id-invalid", TOKEN);
  const csrf = boundedToken(csrfToken, 128, "gateway-csrf-invalid", TOKEN);
  rejectSecrets([id, user, csrf]);
  return freeze({
    sessionId: id,
    userId: user,
    csrfDigest: digest(csrf),
    authenticated: true,
    createdAt: timestamp(now, "gateway-time-invalid"),
  });
}

export function authenticateRequest(session, request) {
  exact(session, SESSION_KEYS, "gateway-session");
  exact(request, AUTH_KEYS, "gateway-auth");
  if (session.authenticated !== true || request.authenticated !== true) fail("gateway-unauthenticated");
  if (session.sessionId !== request.sessionId || session.userId !== request.userId) fail("gateway-session-mismatch");
  if (!ALLOWED_ORIGINS.has(request.origin)) fail("gateway-origin-rejected");
  const csrf = boundedToken(request.csrfToken, 128, "gateway-csrf-invalid", TOKEN);
  const digestBuffer = Buffer.from(digest(csrf), "hex");
  const expected = Buffer.from(session.csrfDigest, "hex");
  if (digestBuffer.length !== expected.length || !timingSafeEqual(digestBuffer, expected)) fail("gateway-csrf-mismatch");
  rejectSecrets([request.sessionId, request.userId, request.csrfToken, request.origin]);
  return freeze({ sessionId: session.sessionId, userId: session.userId, origin: request.origin });
}

export function submitEnvelope(auth, body, { existingTasks = [], now = new Date().toISOString() } = {}) {
  boundSize(body);
  exact(body, SUBMIT_KEYS, "gateway-submit");
  const idempotencyKey = boundedToken(body.idempotencyKey, 128, "gateway-idempotency-invalid", TOKEN);
  const taskType = boundedToken(body.taskType, 64, "gateway-task-type-invalid", /^[a-z][a-z0-9.-]*$/);
  const requestedOutcome = safeText(body.requestedOutcome, 240, "gateway-outcome-invalid");
  const matches = existingTasks.map(validateTask).filter((task) => task.idempotencyKey === idempotencyKey);
  if (matches.length > 1) fail("gateway-task-registry-invalid");
  if (matches.length === 1) {
    if (matches[0].userId !== auth.userId || matches[0].taskType !== taskType) fail("gateway-idempotency-conflict");
    return freeze({ created: false, task: publicTask(matches[0]) });
  }
  const createdAt = timestamp(now, "gateway-time-invalid");
  const task = validateTask({
    taskId: `tsk-${digest(`${auth.userId}:${idempotencyKey}`).slice(0, 32)}`,
    userId: auth.userId,
    status: "queued",
    idempotencyKey,
    taskType,
    createdAt,
  });
  return freeze({ created: true, task: publicTask(task), requestedOutcomeDigest: digest(requestedOutcome) });
}

export function statusEnvelope(auth, body, { tasks = [], now = new Date().toISOString() } = {}) {
  boundSize(body);
  exact(body, STATUS_KEYS, "gateway-status");
  const task = ownedTask(auth, body.taskId, tasks);
  const limit = pageSize(body.limit);
  if (body.cursor !== null && (typeof body.cursor !== "string" || !SHA256.test(body.cursor))) fail("gateway-cursor-invalid");
  timestamp(now, "gateway-time-invalid");
  return freeze({
    schemaVersion: GATEWAY_SCHEMA_VERSION,
    task: publicTask(task),
    page: { limit, cursor: body.cursor, nextCursor: null },
  });
}

export function cancelEnvelope(auth, body, { tasks = [], now = new Date().toISOString() } = {}) {
  boundSize(body);
  exact(body, CANCEL_KEYS, "gateway-cancel");
  const task = ownedTask(auth, body.taskId, tasks);
  boundedToken(body.idempotencyKey, 128, "gateway-idempotency-invalid", TOKEN);
  const reasonCode = boundedToken(body.reasonCode, 64, "gateway-reason-invalid", /^[a-z][a-z0-9.-]*$/);
  if (task.status === "cancelled") return freeze({ changed: false, task: publicTask(task) });
  if (task.status === "succeeded" || task.status === "failed") fail("gateway-task-terminal");
  return freeze({
    changed: true,
    task: publicTask({ ...task, status: "cancelled" }),
    cancelledAt: timestamp(now, "gateway-time-invalid"),
    reasonCode,
  });
}

export function artifactInitiateEnvelope(auth, body, { tasks = [], grants = [], now = new Date().toISOString() } = {}) {
  boundSize(body);
  exact(body, ARTIFACT_KEYS, "gateway-artifact");
  const task = ownedTask(auth, body.taskId, tasks);
  if (task.status === "cancelled" || task.status === "failed") fail("gateway-task-terminal");
  const fileName = safeFileName(body.fileName);
  const mimeType = boundedToken(body.mimeType, 80, "gateway-mime-invalid", /^[a-z]+\/[a-z0-9.+-]+$/);
  if (!Number.isSafeInteger(body.sizeBytes) || body.sizeBytes < 1 || body.sizeBytes > 25 * 1024 * 1024) fail("gateway-artifact-size-invalid");
  const sha256 = boundedToken(body.sha256, 64, "gateway-artifact-hash-invalid", SHA256);
  const idempotencyKey = boundedToken(body.idempotencyKey, 128, "gateway-idempotency-invalid", TOKEN);
  const artifactId = `art-${digest(`${task.taskId}:${idempotencyKey}`).slice(0, 32)}`;
  const grant = validateGrant({
    grantId: `grn-${digest(`${artifactId}:${task.taskId}`).slice(0, 32)}`,
    taskId: task.taskId,
    artifactId,
    userId: auth.userId,
    expiresAt: addSeconds(timestamp(now, "gateway-time-invalid"), 15 * 60),
  });
  if (grants.some((item) => item.grantId === grant.grantId && item.taskId !== task.taskId)) fail("gateway-cross-task-artifact");
  return freeze({
    created: true,
    artifact: { artifactId, taskId: task.taskId, fileName, mimeType, sizeBytes: body.sizeBytes, sha256, status: "initiated" },
    grant: { grantId: grant.grantId, taskId: grant.taskId, artifactId: grant.artifactId, userId: grant.userId, expiresAt: grant.expiresAt },
  });
}

export function eventCursorEnvelope(auth, body, { tasks = [], events = [] } = {}) {
  boundSize(body);
  exact(body, CURSOR_KEYS, "gateway-events");
  const task = ownedTask(auth, body.taskId, tasks);
  const limit = pageSize(body.limit);
  const owned = events.map(validateEvent).filter((item) => item.taskId === task.taskId).sort((left, right) => left.sequence - right.sequence);
  let start = 0;
  if (body.cursor !== null) {
    if (typeof body.cursor !== "string" || !SHA256.test(body.cursor)) fail("gateway-cursor-invalid");
    const index = owned.findIndex((item) => eventCursor(item) === body.cursor);
    if (index < 0) fail("gateway-cursor-stale");
    start = index + 1;
  }
  const page = owned.slice(start, start + limit).map((item) => freeze({
    eventId: item.eventId,
    sequence: item.sequence,
    kind: item.kind,
    createdAt: item.createdAt,
  }));
  const last = page.at(-1);
  return freeze({
    taskId: task.taskId,
    events: page,
    nextCursor: last ? eventCursor(owned[start + page.length - 1]) : null,
  });
}

export function redeemArtifactGrant(grant, { taskId, userId, now = new Date().toISOString() }) {
  const current = validateGrant(grant);
  if (current.taskId !== taskId) fail("gateway-cross-task-artifact");
  if (current.userId !== userId) fail("gateway-grant-user-mismatch");
  if (Date.parse(current.expiresAt) <= Date.parse(timestamp(now, "gateway-time-invalid"))) fail("gateway-grant-expired");
  return freeze({ artifactId: current.artifactId, taskId: current.taskId });
}

export function validateTask(record) {
  exact(record, TASK_KEYS, "gateway-task");
  return freeze({
    taskId: boundedToken(record.taskId, 40, "gateway-task-id-invalid", TASK_ID),
    userId: boundedToken(record.userId, 64, "gateway-user-id-invalid", TOKEN),
    status: boundedToken(record.status, 16, "gateway-status-invalid", /^(?:queued|running|succeeded|failed|cancelled)$/),
    idempotencyKey: boundedToken(record.idempotencyKey, 128, "gateway-idempotency-invalid", TOKEN),
    taskType: boundedToken(record.taskType, 64, "gateway-task-type-invalid", /^[a-z][a-z0-9.-]*$/),
    createdAt: timestamp(record.createdAt, "gateway-time-invalid"),
  });
}

function publicTask(task) {
  return freeze({ taskId: task.taskId, status: task.status, taskType: task.taskType, createdAt: task.createdAt });
}

function ownedTask(auth, taskId, tasks) {
  const id = boundedToken(taskId, 40, "gateway-task-id-invalid", TASK_ID);
  const matches = tasks.map(validateTask).filter((task) => task.taskId === id);
  if (matches.length !== 1) fail("gateway-task-not-found");
  if (matches[0].userId !== auth.userId) fail("gateway-task-not-owned");
  return matches[0];
}

function validateGrant(record) {
  exact(record, GRANT_KEYS, "gateway-grant");
  return freeze({
    grantId: boundedToken(record.grantId, 40, "gateway-grant-id-invalid", /^grn-[a-f0-9]{32}$/),
    taskId: boundedToken(record.taskId, 40, "gateway-task-id-invalid", TASK_ID),
    artifactId: boundedToken(record.artifactId, 40, "gateway-artifact-id-invalid", /^art-[a-f0-9]{32}$/),
    userId: boundedToken(record.userId, 64, "gateway-user-id-invalid", TOKEN),
    expiresAt: timestamp(record.expiresAt, "gateway-grant-expiry-invalid"),
  });
}

function validateEvent(record) {
  exact(record, EVENT_KEYS, "gateway-event");
  if (!Number.isSafeInteger(record.sequence) || record.sequence < 1) fail("gateway-event-sequence-invalid");
  return freeze({
    eventId: boundedToken(record.eventId, 40, "gateway-event-id-invalid", /^evt-[a-f0-9]{32}$/),
    taskId: boundedToken(record.taskId, 40, "gateway-task-id-invalid", TASK_ID),
    sequence: record.sequence,
    kind: boundedToken(record.kind, 32, "gateway-event-kind-invalid", /^[a-z][a-z0-9.-]*$/),
    createdAt: timestamp(record.createdAt, "gateway-time-invalid"),
  });
}

function eventCursor(event) {
  return digest(`${event.taskId}:${event.sequence}:${event.eventId}`);
}

function pageSize(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_SIZE) fail("gateway-page-size-invalid");
  return value;
}

function safeFileName(value) {
  if (typeof value !== "string" || !SAFE_FILE.test(value) || value.includes("..") || WINDOWS_RESERVED.test(value) || SECRET.test(value)) {
    fail("gateway-filename-unsafe");
  }
  return value;
}

function safeText(value, max, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\0\r\n]/.test(value) || SECRET.test(value) || PRIVATE_ECHO.test(value)) fail(code);
  return value.trim();
}

function boundSize(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  if (bytes > MAX_ENVELOPE_BYTES) fail("gateway-envelope-too-large");
}

function boundedToken(value, max, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !pattern.test(value) || SECRET.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function addSeconds(value, seconds) {
  return new Date(Date.parse(value) + seconds * 1000).toISOString();
}

function rejectSecrets(values) {
  if (values.some((value) => SECRET.test(String(value ?? "")))) fail("gateway-credential-rejected");
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}-invalid`);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(`${label}-field-not-allowed`);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function freeze(value) {
  return Object.freeze(value);
}

function fail(code) {
  throw new CloudGatewayContractError(code);
}

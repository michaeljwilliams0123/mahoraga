import { createHash } from "node:crypto";
import { pathAllowed } from "./coordination-records.mjs";

export const DESTINY_DISPATCH_PROTOCOL = "1.0.0";
export const DESTINY_DISPATCH_DIRECTORY = "coordination/destiny-dispatches";
export const DESTINY_DISPATCH_TITLE_PREFIX = "[DESTINY-CODEX]";
export const DESTINY_DISPATCH_REPOSITORY = "michaeljwilliams0123/mahoraga";
export const DESTINY_VERIFICATION = Object.freeze({
  manifest: "node src/cli.mjs validate",
  coordination: "node scripts/coordination.mjs validate",
  "github-audit": "node scripts/github-audit.mjs",
  tests: "node --test --test-isolation=none",
});

const DISPATCH_KEYS = new Set([
  "schemaVersion", "protocolVersion", "dispatchId", "idempotencyKey", "repository",
  "baseCommit", "target", "sourceController", "targetController", "title", "task",
  "allowedPaths", "verification", "maximumAttempts", "createdAt", "privacy", "requestHash",
]);
const REQUEST_KEYS = Object.freeze([
  "schemaVersion", "protocolVersion", "dispatchId", "idempotencyKey", "repository",
  "baseCommit", "target", "sourceController", "targetController", "title", "task",
  "allowedPaths", "verification", "maximumAttempts", "privacy",
]);
const PRIVACY_KEYS = new Set([
  "chatAccess", "conversationTranscriptIncluded", "credentialsIncluded",
  "personalContextIncluded", "contentBoundary",
]);
const SECRET_PATTERN = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;
const PROTECTED_PATHS = Object.freeze([
  DESTINY_DISPATCH_DIRECTORY,
  ".github/workflows/destiny-codex-relay.yml",
  "src/destiny-codex-dispatch.mjs",
  "scripts/destiny-codex-dispatch.mjs",
]);

export const DESTINY_DISPATCH_PRIVACY = Object.freeze({
  chatAccess: false,
  conversationTranscriptIncluded: false,
  credentialsIncluded: false,
  personalContextIncluded: false,
  contentBoundary: "task-metadata-and-repository-context-only",
});

export function createDestinyCodexDispatch(input, { now = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("destiny-dispatch-input-invalid");
  const idempotencyKey = token(input.idempotencyKey, 120, "destiny-idempotency-key-invalid");
  const dispatchId = `dcx-${digest(`destiny-dispatch:${idempotencyKey}`).slice(0, 24)}`;
  const draft = {
    schemaVersion: 1,
    protocolVersion: DESTINY_DISPATCH_PROTOCOL,
    dispatchId,
    idempotencyKey,
    repository: input.repository ?? DESTINY_DISPATCH_REPOSITORY,
    baseCommit: String(input.baseCommit ?? "").toLowerCase(),
    target: "destiny-codex",
    sourceController: "primary-local-codex",
    targetController: "primary-cloud-codex",
    title: input.title,
    task: input.task,
    allowedPaths: normalizePaths(input.allowedPaths, "destiny-allowed-paths-invalid"),
    verification: normalizeVerification(input.verification ?? Object.keys(DESTINY_VERIFICATION)),
    maximumAttempts: input.maximumAttempts ?? 1,
    createdAt: normalizedTime(now, "destiny-created-at-invalid"),
    privacy: { ...DESTINY_DISPATCH_PRIVACY },
  };
  return validateDestinyCodexDispatch({ ...draft, requestHash: requestHash(draft) });
}

export function validateDestinyCodexDispatch(record) {
  exact(record, DISPATCH_KEYS, "destiny-dispatch-record-invalid");
  if (record.schemaVersion !== 1 || record.protocolVersion !== DESTINY_DISPATCH_PROTOCOL) fail("destiny-protocol-invalid");
  const idempotencyKey = token(record.idempotencyKey, 120, "destiny-idempotency-key-invalid");
  const expectedId = `dcx-${digest(`destiny-dispatch:${idempotencyKey}`).slice(0, 24)}`;
  if (record.dispatchId !== expectedId) fail("destiny-dispatch-id-invalid");
  if (record.repository !== DESTINY_DISPATCH_REPOSITORY) fail("destiny-repository-invalid");
  commit(record.baseCommit, "destiny-base-commit-invalid");
  if (record.target !== "destiny-codex" || record.sourceController !== "primary-local-codex" || record.targetController !== "primary-cloud-codex") {
    fail("destiny-controller-boundary-invalid");
  }
  bounded(record.title, 160, "destiny-title-invalid");
  bounded(record.task, 4000, "destiny-task-invalid", true);
  const allowedPaths = normalizePaths(record.allowedPaths, "destiny-allowed-paths-invalid");
  for (const allowed of allowedPaths) {
    if (PROTECTED_PATHS.some((protectedPath) => pathAllowed(allowed, [protectedPath]))) {
      fail("destiny-protocol-path-protected");
    }
  }
  const verification = normalizeVerification(record.verification);
  if (!Number.isSafeInteger(record.maximumAttempts) || record.maximumAttempts < 1 || record.maximumAttempts > 3) fail("destiny-maximum-attempts-invalid");
  const createdAt = normalizedTime(record.createdAt, "destiny-created-at-invalid");
  validatePrivacy(record.privacy);
  rejectSecrets([record.idempotencyKey, record.title, record.task]);
  const normalized = {
    ...structuredClone(record), idempotencyKey, baseCommit: record.baseCommit.toLowerCase(),
    allowedPaths, verification, createdAt, privacy: { ...DESTINY_DISPATCH_PRIVACY },
  };
  const expectedHash = requestHash(normalized);
  if (record.requestHash !== expectedHash) fail("destiny-request-hash-mismatch");
  return deepFreeze({ ...normalized, requestHash: expectedHash });
}

export function validateDestinyDispatchRegistry(records) {
  if (!Array.isArray(records) || records.length > 10_000) fail("destiny-registry-invalid");
  const ids = new Set();
  const keys = new Map();
  const validated = records.map((record) => {
    const dispatch = validateDestinyCodexDispatch(record);
    const prior = keys.get(dispatch.idempotencyKey);
    if (prior && prior !== dispatch.requestHash) fail("destiny-idempotency-conflict");
    if (prior) fail("destiny-duplicate-idempotency-key");
    if (ids.has(dispatch.dispatchId)) fail("destiny-duplicate-dispatch-id");
    ids.add(dispatch.dispatchId);
    keys.set(dispatch.idempotencyKey, dispatch.requestHash);
    return dispatch;
  });
  return deepFreeze(validated);
}

export function validateDestinyDispatchPullRequest(input) {
  const required = new Set(["title", "author", "owner", "baseBranch", "baseSha", "mergeBase", "changedFiles", "dispatchPath", "dispatchStatus", "dispatch"]);
  exact(input, required, "destiny-pull-request-invalid");
  const dispatch = validateDestinyCodexDispatch(input.dispatch);
  if (input.author !== input.owner || input.owner !== "michaeljwilliams0123") fail("destiny-owner-required");
  if (input.baseBranch !== "main") fail("destiny-main-base-required");
  if (input.title !== `${DESTINY_DISPATCH_TITLE_PREFIX} ${dispatch.title}`) fail("destiny-title-mismatch");
  commit(input.baseSha, "destiny-base-sha-invalid");
  commit(input.mergeBase, "destiny-merge-base-invalid");
  if (input.mergeBase.toLowerCase() !== input.baseSha.toLowerCase() || input.mergeBase.toLowerCase() !== dispatch.baseCommit) fail("destiny-stale-base");
  if (input.dispatchStatus !== "A") fail("destiny-envelope-must-be-added");
  const changedFiles = normalizePaths(input.changedFiles, "destiny-changed-paths-invalid", 256);
  const dispatchFiles = changedFiles.filter((file) => file.startsWith(`${DESTINY_DISPATCH_DIRECTORY}/`));
  if (dispatchFiles.length !== 1 || dispatchFiles[0] !== input.dispatchPath) fail("destiny-single-envelope-required");
  if (input.dispatchPath !== `${DESTINY_DISPATCH_DIRECTORY}/${dispatch.dispatchId}.json`) fail("destiny-envelope-path-invalid");
  const implementationFiles = changedFiles.filter((file) => file !== input.dispatchPath);
  for (const file of implementationFiles) {
    if (!pathAllowed(file, dispatch.allowedPaths)) fail("destiny-changed-path-outside-scope");
    if (PROTECTED_PATHS.some((protectedPath) => pathAllowed(file, [protectedPath]))) fail("destiny-protocol-path-protected");
  }
  return deepFreeze({
    dispatchId: dispatch.dispatchId,
    requestHash: dispatch.requestHash,
    implementationFileCount: implementationFiles.length,
    verification: dispatch.verification,
  });
}

export function destinyVerificationCommands(record) {
  const dispatch = validateDestinyCodexDispatch(record);
  return Object.freeze(dispatch.verification.map((id) => DESTINY_VERIFICATION[id]));
}

function requestHash(record) {
  const request = Object.fromEntries(REQUEST_KEYS.map((key) => [key, record[key]]));
  return digest(canonicalJson(request));
}
function normalizeVerification(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > Object.keys(DESTINY_VERIFICATION).length || new Set(value).size !== value.length) {
    fail("destiny-verification-invalid");
  }
  const normalized = [...value].sort();
  if (normalized.some((item) => typeof item !== "string" || !Object.hasOwn(DESTINY_VERIFICATION, item))) fail("destiny-verification-invalid");
  return normalized;
}
function normalizePaths(value, code, maximum = 64) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum || new Set(value).size !== value.length) fail(code);
  return [...value].map((item) => safePath(item, code)).sort();
}
function safePath(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.startsWith("/") || value.startsWith("\\") || value.includes("\\") || /[\0\r\n]/.test(value) || !/^[A-Za-z0-9._/-]+$/.test(value)) fail(code);
  const segments = value.split("/");
  if (segments.some((item) => !item || item === "." || item === "..") || segments[0].toLowerCase() === ".git") fail(code);
  return value;
}
function validatePrivacy(value) {
  exact(value, PRIVACY_KEYS, "destiny-privacy-invalid");
  for (const [key, expected] of Object.entries(DESTINY_DISPATCH_PRIVACY)) if (value[key] !== expected) fail("destiny-privacy-invalid");
}
function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}
function token(value, maximum, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) fail(code);
  return value;
}
function bounded(value, maximum, code, multiline = false) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\0/.test(value) || (!multiline && /[\r\n]/.test(value))) fail(code);
}
function commit(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{40}$/i.test(value)) fail(code); }
function normalizedTime(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}
function rejectSecrets(values) { if (values.some((value) => SECRET_PATTERN.test(value))) fail("destiny-secret-pattern-rejected"); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

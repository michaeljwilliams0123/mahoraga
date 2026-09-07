import { createHash } from "node:crypto";

const SHA64 = /^[a-f0-9]{64}$/;
const CODEX_TASK_REFERENCE = /^cd_[a-f0-9]{32}$/i;
const CODEX_TASK_LINK = /https:\/\/chatgpt\.com\/s\/(cd_[a-f0-9]{32})(?=$|[?#\s)\]}>,.;:])/i;
const KEY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const PROBE_ID = /^[a-z0-9][a-z0-9-]{15,95}$/;

function normalizeOpaqueId(value, code) {
  if (typeof value !== "string") throw new TypeError(code);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 512 || /[\0\r\n]/.test(normalized)) throw new TypeError(code);
  return normalized;
}

function fingerprint(value, code) {
  return createHash("sha256").update(normalizeOpaqueId(value, code)).digest("hex");
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireSha64(value, code) {
  if (typeof value !== "string" || !SHA64.test(value)) throw new TypeError(code);
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsExactProbeToken(value, probeId) {
  if (typeof value !== "string") return false;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(probeId)}(?=$|[^A-Za-z0-9_-])`);
  return pattern.test(value);
}

export function fingerprintCodexAccountId(accountId) {
  return fingerprint(accountId, "codex-account-id-invalid");
}

export function fingerprintCodexInstallationId(installationId) {
  return fingerprint(installationId, "codex-installation-id-invalid");
}

export function fingerprintCodexEnvironmentId(environmentId) {
  return fingerprint(environmentId, "codex-environment-id-invalid");
}

export function extractCodexTaskReference(value) {
  if (typeof value !== "string") throw new TypeError("codex-task-reference-invalid");
  const normalized = value.trim();
  if (CODEX_TASK_REFERENCE.test(normalized)) return normalized.toLowerCase();
  const match = CODEX_TASK_LINK.exec(normalized);
  if (!match) throw new TypeError("codex-task-reference-invalid");
  return match[1].toLowerCase();
}

function normalizeCloudTask(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("codex-cloud-task-invalid");
  const id = normalizeOpaqueId(raw.id, "codex-cloud-task-invalid");
  const title = normalizeOpaqueId(raw.title, "codex-cloud-task-invalid");
  const environmentId = normalizeOpaqueId(raw.environment_id ?? raw.environmentId, "codex-cloud-task-invalid");
  const summary = typeof raw.summary === "string" && raw.summary.trim().length > 0 ? raw.summary.trim() : null;
  let url = null;
  let codexTaskReference = null;
  if (raw.url != null) {
    url = normalizeOpaqueId(raw.url, "codex-cloud-task-invalid");
    try {
      codexTaskReference = extractCodexTaskReference(url);
    } catch {
      codexTaskReference = null;
    }
  }
  return Object.freeze({ id, title, summary, url, environmentId, codexTaskReference });
}

export function findCodexCloudTaskByTitle(payload, expectedTitle) {
  const title = normalizeOpaqueId(expectedTitle, "codex-cloud-task-title-invalid");
  const tasks = Array.isArray(payload) ? payload : payload?.tasks;
  if (!Array.isArray(tasks)) throw new TypeError("codex-cloud-task-list-invalid");
  const matches = tasks
    .filter((task) => task && typeof task === "object" && task.title === title)
    .map(normalizeCloudTask);
  if (matches.length === 0) throw new TypeError("codex-cloud-task-not-visible");
  if (matches.length !== 1) throw new TypeError("codex-cloud-task-ambiguous");
  return matches[0];
}

export function findCodexCloudTaskByProbeId(payload, probeIdInput) {
  const probeId = normalizeOpaqueId(probeIdInput, "codex-probe-id-invalid");
  if (!PROBE_ID.test(probeId)) throw new TypeError("codex-probe-id-invalid");
  const tasks = Array.isArray(payload) ? payload : payload?.tasks;
  if (!Array.isArray(tasks)) throw new TypeError("codex-cloud-task-list-invalid");
  const matches = tasks
    .filter((task) => task && typeof task === "object" && (
      containsExactProbeToken(task.title, probeId) || containsExactProbeToken(task.summary, probeId)
    ))
    .map(normalizeCloudTask);
  if (matches.length === 0) throw new TypeError("codex-cloud-task-not-visible");
  if (matches.length !== 1) throw new TypeError("codex-cloud-task-ambiguous");
  return matches[0];
}

export function buildDestinyCodexBinding({
  accountId,
  installationId,
  task,
  receiptKeyFingerprint,
  observedAt = new Date().toISOString(),
}) {
  const normalizedTask = normalizeCloudTask({
    id: task?.id,
    title: task?.title,
    summary: task?.summary,
    url: task?.url,
    environment_id: task?.environmentId ?? task?.environment_id,
  });
  if (!validTimestamp(observedAt)) throw new TypeError("destiny-codex-binding-time-invalid");
  const binding = {
    schemaVersion: 1,
    kind: "destiny-codex-binding",
    routeVerified: true,
    codexAccountFingerprint: fingerprintCodexAccountId(accountId),
    codexInstallationFingerprint: fingerprintCodexInstallationId(installationId),
    codexEnvironmentFingerprint: fingerprintCodexEnvironmentId(normalizedTask.environmentId),
    codexCloudTaskId: normalizedTask.id,
    codexTaskReference: normalizedTask.codexTaskReference,
    receiptKeyFingerprint: requireSha64(receiptKeyFingerprint, "destiny-codex-receipt-key-invalid"),
    observedAt,
  };
  return Object.freeze(binding);
}

export function createSignedReceiptTrustFromBinding(binding, { keyId = "destiny-event-dispatch-v1" } = {}) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new TypeError("destiny-codex-binding-invalid");
  if (binding.routeVerified !== true) throw new TypeError("destiny-codex-route-unverified");
  requireSha64(binding.codexAccountFingerprint, "destiny-codex-binding-invalid");
  requireSha64(binding.codexInstallationFingerprint, "destiny-codex-binding-invalid");
  requireSha64(binding.codexEnvironmentFingerprint, "destiny-codex-binding-invalid");
  requireSha64(binding.receiptKeyFingerprint, "destiny-codex-binding-invalid");
  if (!validTimestamp(binding.observedAt)) throw new TypeError("destiny-codex-binding-invalid");
  if (typeof keyId !== "string" || !KEY_ID.test(keyId)) throw new TypeError("destiny-codex-key-id-invalid");
  return Object.freeze({
    mode: "signed-receipt",
    algorithm: "ed25519",
    publicKeyFingerprint: binding.receiptKeyFingerprint,
    keyId,
  });
}

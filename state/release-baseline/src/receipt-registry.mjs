import { createHash } from "node:crypto";

const ENVELOPE_KEYS = new Set(["schemaVersion", "capability", "outcome", "summary", "evidence", "metrics", "details"]);
const DETAIL_KEYS = new Set(["family", "verified", "providerEvidence", "outputEvidence"]);
const OUTCOMES = new Set(["succeeded", "failed", "waiting"]);
const BANNED_KEYS = /^(?:prompt|response|content|preview|token|secret|documentText|finalText|stdout|stderr)$/i;
const FAMILY_PREFIXES = new Map([
  ["system", "system"], ["manifest", "system"], ["assistant", "system"], ["provider", "system"], ["artifact", "system"],
  ["repository", "repository"], ["browser", "browser"], ["desktop", "desktop"], ["m365", "m365"],
  ["codex", "codex"], ["repair", "repair"], ["queue", "queue"], ["copilot", "copilot"], ["workspace-agent", "workspace-agent"],
]);

export function createCapabilityReceipt(capability, result, {
  observedAt = new Date().toISOString(),
  durationMs = 0,
} = {}) {
  validateCapability(capability);
  if (!isRecord(result)) throw receiptError("worker-result-invalid");
  const family = capabilityFamily(capability);
  if (typeof result.verified !== "boolean") throw receiptError("worker-verification-required");
  const verified = result.verified === true;
  const outcome = result.waitingForUser === true ? "waiting" : verified ? "succeeded" : "failed";
  const providerEvidence = sanitizeRecord(result.providerReceipt ?? result.receiptMetadata ?? result.providerHealth ?? {});
  const outputEvidence = sanitizeRecord(Object.fromEntries(Object.entries(result).filter(([key]) => ![
    "answer", "summary", "verified", "waitingForUser", "prompt", "providerReceipt", "receiptMetadata", "providerHealth",
  ].includes(key))));
  const details = Object.freeze({ family, verified, providerEvidence, outputEvidence });
  const detailsDigest = digest(canonical(details));
  return validateCapabilityReceipt(capability, {
    schemaVersion: 1,
    capability,
    outcome,
    summary: normalizeSummary(result.summary ?? `${capability} ${outcome}.`),
    evidence: [{ type: "worker-result", ref: `capability:${capability}`, sha256: detailsDigest, observedAt: normalizeTimestamp(observedAt) }],
    metrics: { durationMs: normalizeDuration(durationMs) },
    details,
  });
}

export function validateCapabilityReceipt(capability, value) {
  validateCapability(capability);
  exactKeys(value, ENVELOPE_KEYS, "receipt-envelope-field-unknown");
  if (value.schemaVersion !== 1 || value.capability !== capability || !OUTCOMES.has(value.outcome)) throw receiptError("receipt-envelope-invalid");
  const summary = normalizeSummary(value.summary);
  if (!Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 32) throw receiptError("receipt-evidence-invalid");
  const evidence = value.evidence.map(normalizeEvidence);
  exactKeys(value.metrics, new Set(["durationMs"]), "receipt-metrics-field-unknown");
  const metrics = Object.freeze({ durationMs: normalizeDuration(value.metrics.durationMs) });
  exactKeys(value.details, DETAIL_KEYS, "receipt-details-field-unknown");
  const family = capabilityFamily(capability);
  if (value.details.family !== family || typeof value.details.verified !== "boolean") throw receiptError(`${family}-receipt-details-invalid`);
  if ((value.outcome === "succeeded") !== value.details.verified && value.outcome !== "waiting") throw receiptError("receipt-outcome-mismatch");
  const providerEvidence = sanitizeRecord(value.details.providerEvidence);
  if (capability === "codex.execute") validateCodexExecutionEvidence(value.outcome, providerEvidence);
  const details = Object.freeze({
    family,
    verified: value.details.verified,
    providerEvidence,
    outputEvidence: sanitizeRecord(value.details.outputEvidence),
  });
  return Object.freeze({ schemaVersion: 1, capability, outcome: value.outcome, summary, evidence, metrics, details });
}

export function receiptDigest(receipt) {
  return digest(canonical(receipt));
}

export function receiptFailure(error) {
  const errorCode = /^receipt-|^[a-z0-9-]+-receipt-/.test(error?.code ?? error?.message ?? "")
    ? String(error.code ?? error.message).slice(0, 80)
    : "receipt-invalid";
  return Object.freeze({ errorCode, boundedSummary: `Worker completion rejected: ${errorCode}.` });
}

export function capabilityFamily(capability) {
  validateCapability(capability);
  const prefix = capability.split(".", 1)[0];
  const family = FAMILY_PREFIXES.get(prefix);
  if (!family) throw receiptError("receipt-capability-family-unsupported");
  return family;
}

function validateCodexExecutionEvidence(outcome, evidence) {
  const allowed = new Set([
    "executionMode", "cellId", "executionSessionId", "sandbox", "approvalPolicy", "networkAccess", "ephemeral", "baseCommit", "headCommit",
    "branch", "worktreeIdentitySha256", "allowedPaths", "changedPaths", "validationState", "quarantineState",
    "failureCode", "threadId", "outputSha256", "usage", "finalResponseStored",
  ]);
  for (const key of Object.keys(evidence)) if (!allowed.has(key)) throw receiptError("codex-receipt-evidence-field-unknown");
  if (evidence.executionMode !== "candidate-worktree" || evidence.sandbox !== "workspace-write" || evidence.approvalPolicy !== "never" || evidence.networkAccess !== false || evidence.ephemeral !== true || evidence.finalResponseStored !== false) throw receiptError("codex-receipt-containment-invalid");
  if (!new Set(["passed", "failed"]).has(evidence.validationState) || !new Set(["clear", "quarantined", "not-created"]).has(evidence.quarantineState)) throw receiptError("codex-receipt-state-invalid");
  if (outcome === "succeeded") {
    if (evidence.validationState !== "passed" || evidence.quarantineState !== "clear") throw receiptError("codex-receipt-success-state-invalid");
    if (!/^cell-[a-f0-9]{20}$/.test(evidence.cellId ?? "") || typeof evidence.executionSessionId !== "string" || evidence.executionSessionId.length < 1 || evidence.executionSessionId.length > 120) throw receiptError("codex-receipt-session-invalid");
    if (!/^[a-f0-9]{40,64}$/.test(evidence.baseCommit ?? "") || !/^[a-f0-9]{40,64}$/.test(evidence.headCommit ?? "") || !/^[a-f0-9]{64}$/.test(evidence.worktreeIdentitySha256 ?? "")) throw receiptError("codex-receipt-commit-invalid");
    if (typeof evidence.branch !== "string" || !/^mahoraga\/task-[a-z0-9-]{1,80}$/.test(evidence.branch)) throw receiptError("codex-receipt-branch-invalid");
    validateReceiptPaths(evidence.allowedPaths, false);
    validateReceiptPaths(evidence.changedPaths, true);
    for (const changed of evidence.changedPaths) if (!evidence.allowedPaths.some((allowedPath) => changed === allowedPath || changed.startsWith(`${allowedPath}/`))) throw receiptError("codex-receipt-path-outside-allowlist");
  } else if (evidence.quarantineState === "clear") {
    throw receiptError("codex-receipt-failure-state-invalid");
  }
}

function validateReceiptPaths(value, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 64) throw receiptError("codex-receipt-paths-invalid");
  for (const item of value) {
    if (typeof item !== "string") throw receiptError("codex-receipt-path-invalid");
    const segments = item.split("/");
    if (item.length < 1 || item.length > 240 || item.startsWith("/") || item.includes("\\") || /[\u0000-\u001f\u007f:*?]/.test(item) || segments.some((segment) => !segment || segment === "." || segment === "..") || item === ".git" || item.startsWith(".git/")) throw receiptError("codex-receipt-path-invalid");
  }
}

function normalizeEvidence(value) {
  exactKeys(value, new Set(["type", "ref", "sha256", "observedAt"]), "receipt-evidence-field-unknown");
  if (typeof value.type !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(value.type)) throw receiptError("receipt-evidence-type-invalid");
  if (typeof value.ref !== "string" || value.ref.length < 3 || value.ref.length > 240 || /[\r\n\u0000]/.test(value.ref)) throw receiptError("receipt-evidence-ref-invalid");
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) throw receiptError("receipt-evidence-digest-invalid");
  return Object.freeze({ type: value.type, ref: value.ref, sha256: value.sha256, observedAt: normalizeTimestamp(value.observedAt) });
}

function sanitizeRecord(value, depth = 0) {
  if (!isRecord(value) || depth > 3) throw receiptError("receipt-evidence-record-invalid");
  const entries = Object.entries(value);
  if (entries.length > 64) throw receiptError("receipt-evidence-record-too-large");
  const result = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) || BANNED_KEYS.test(key)) throw receiptError("receipt-evidence-key-forbidden");
    if (item === undefined) continue;
    result[key] = sanitizeValue(item, depth + 1);
  }
  return Object.freeze(result);
}

function sanitizeValue(value, depth) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) return value;
  if (typeof value === "string" && value.length <= 512 && !/[\u0000]/.test(value)) return value;
  if (Array.isArray(value) && value.length <= 128) return Object.freeze(value.map((item) => sanitizeValue(item, depth)));
  if (isRecord(value)) return sanitizeRecord(value, depth);
  throw receiptError("receipt-evidence-value-invalid");
}

function exactKeys(value, allowed, code) {
  if (!isRecord(value)) throw receiptError(code);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw receiptError(code);
  for (const key of allowed) if (!(key in value)) throw receiptError("receipt-field-missing");
}

function normalizeSummary(value) {
  if (typeof value !== "string") throw receiptError("receipt-summary-invalid");
  const summary = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (summary.length < 1 || summary.length > 512) throw receiptError("receipt-summary-invalid");
  return summary;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw receiptError("receipt-timestamp-invalid");
  return new Date(value).toISOString();
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 0 || duration > 86_400_000) throw receiptError("receipt-duration-invalid");
  return duration;
}

function validateCapability(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(value)) throw receiptError("receipt-capability-invalid");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function receiptError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

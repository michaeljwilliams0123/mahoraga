import { createHash } from "node:crypto";

export function buildTrustedStateLedger({ observations = [], policy, now = new Date().toISOString() } = {}) {
  if (!policy || typeof policy !== "object") fail("trusted-state-policy-required");
  if (!Array.isArray(observations) || observations.length > 4096) fail("trusted-state-observations-invalid");
  const currentTime = timestamp(now, "trusted-state-clock-invalid");
  const facts = observations.map((observation) => normalizeObservation(observation, policy, currentTime));
  facts.sort((left, right) => left.id.localeCompare(right.id));
  const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
  return deepFreeze({
    schemaVersion: 1,
    generatedAt: currentTime,
    mode: "trusted-state-ledger",
    facts,
    fingerprint,
    zeroCredit: true,
    providerRequired: false,
  });
}

function normalizeObservation(value, policy, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("trusted-state-observation-invalid");
  const id = slug(value.id, "trusted-state-id-invalid");
  const surface = slug(value.surface, "trusted-state-surface-invalid");
  const source = slug(value.source, "trusted-state-source-invalid");
  const authority = slug(value.authority, "trusted-state-authority-invalid");
  const observedAt = timestamp(value.observedAt, "trusted-state-observed-at-invalid");
  const ttlMs = policy.sourceTtlMs?.[source] ?? policy.sourceTtlMs?.default;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) fail("trusted-state-source-ttl-missing");
  const sourceAuthority = Number(policy.sourceAuthority?.[source] ?? 0);
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(observedAt));
  const freshness = ageMs <= ttlMs ? "current" : ageMs <= ttlMs * 2 ? "aging" : "stale";
  const trusted = sourceAuthority >= Number(policy.minimumTrustedAuthority ?? 1) && freshness === "current";
  return deepFreeze({
    id,
    surface,
    source,
    authority,
    value: normalizeValue(value.value),
    observedAt,
    ageMs,
    ttlMs,
    freshness,
    sourceAuthority,
    trusted,
    evidenceRef: value.evidenceRef == null ? null : text(value.evidenceRef, 240, "trusted-state-evidence-invalid"),
  });
}
function normalizeValue(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return text(value, 512, "trusted-state-value-invalid");
  if (Array.isArray(value)) {
    if (value.length > 64) fail("trusted-state-value-invalid");
    return Object.freeze(value.map(normalizeValue));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 64) fail("trusted-state-value-invalid");
    return deepFreeze(Object.fromEntries(entries.map(([key, item]) => [slug(key, "trusted-state-value-key-invalid"), normalizeValue(item)])));
  }
  fail("trusted-state-value-invalid");
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function text(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}

function timestamp(value, code) {
  const candidate = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (!Number.isFinite(Date.parse(candidate)) || new Date(candidate).toISOString() !== candidate) fail(code);
  return candidate;
}

function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

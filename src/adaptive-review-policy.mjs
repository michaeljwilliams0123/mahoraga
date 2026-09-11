import { readFile } from "node:fs/promises";

const DEFAULT_POLICY_URL = new URL("../config/adaptive-review-policy.json", import.meta.url);
const REQUIRED_CLASSIFICATIONS = new Set(["NEW", "ALREADY_BUILT", "EXTEND", "SUPERSEDED", "CONFLICTS", "BLOCKED"]);

export async function loadAdaptiveReviewPolicy({ file = DEFAULT_POLICY_URL } = {}) {
  const raw = JSON.parse(await readFile(file, "utf8"));
  return validateAdaptiveReviewPolicy(raw);
}

export function validateAdaptiveReviewPolicy(value) {
  if (!record(value) || value.schemaVersion !== 1 || value.mode !== "delta-first-adaptive-review") fail("adaptive-review-policy-invalid");
  const defaultSurfaces = stringList(value.defaultSurfaces, 32, "adaptive-review-default-surfaces-invalid");
  const evidenceLadder = stringList(value.evidenceLadder, 32, "adaptive-review-evidence-ladder-invalid");
  const classifications = stringList(value.classifications, 16, "adaptive-review-classifications-invalid");
  if (new Set(classifications).size !== REQUIRED_CLASSIFICATIONS.size || classifications.some((item) => !REQUIRED_CLASSIFICATIONS.has(item))) fail("adaptive-review-classifications-invalid");
  if (typeof value.stopConfidence !== "number" || value.stopConfidence <= 0 || value.stopConfidence > 1) fail("adaptive-review-stop-confidence-invalid");
  if (typeof value.minimumTrustedAuthority !== "number" || value.minimumTrustedAuthority < 0 || value.minimumTrustedAuthority > 1) fail("adaptive-review-authority-floor-invalid");
  const surfaceSignals = signalMap(value.surfaceSignals, "adaptive-review-surface-signals-invalid");
  const constraintSignals = signalMap(value.constraintSignals, "adaptive-review-constraint-signals-invalid");
  const impactChains = signalMap(value.impactChains, "adaptive-review-impact-chains-invalid");
  for (const surface of defaultSurfaces) if (!(surface in surfaceSignals)) fail("adaptive-review-default-surface-unknown");
  for (const surface of Object.keys(surfaceSignals)) if (!(surface in impactChains)) fail("adaptive-review-impact-chain-missing");
  return deepFreeze({
    schemaVersion: 1,
    mode: value.mode,
    defaultSurfaces,
    evidenceLadder,
    classifications,
    stopConfidence: value.stopConfidence,
    minimumTrustedAuthority: value.minimumTrustedAuthority,
    surfaceSignals,
    constraintSignals,
    impactChains,
    sourceTtlMs: numericMap(value.sourceTtlMs, { minimum: 1, maximum: 31_536_000_000 }, "adaptive-review-source-ttl-invalid"),
    sourceAuthority: numericMap(value.sourceAuthority, { minimum: 0, maximum: 1 }, "adaptive-review-source-authority-invalid"),
    lessonClasses: stringList(value.lessonClasses, 32, "adaptive-review-lesson-classes-invalid"),
  });
}
function signalMap(value, code) {
  if (!record(value) || Object.keys(value).length < 1 || Object.keys(value).length > 64) fail(code);
  const result = {};
  for (const [key, items] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) fail(code);
    result[key] = stringList(items, 64, code);
  }
  return Object.freeze(result);
}

function numericMap(value, { minimum, maximum }, code) {
  if (!record(value) || Object.keys(value).length < 1 || Object.keys(value).length > 64) fail(code);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(key) || typeof item !== "number" || !Number.isFinite(item) || item < minimum || item > maximum) fail(code);
    result[key] = item;
  }
  return Object.freeze(result);
}

function stringList(value, maximumItems, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  const result = value.map((item) => {
    if (typeof item !== "string") fail(code);
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length > 120 || /\0/.test(item)) fail(code);
    return normalized;
  });
  return Object.freeze(result);
}

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

import { createHash } from "node:crypto";

const TRANSFORM_KINDS = new Set(["translation","transcription","ocr","summarization","resize","format-conversion"]);
const INPUT_KEYS = new Set([
  "sourceReference","sourceFingerprint","transformKind","transformVersion","workerReceiptReference",
  "outputReference","outputFingerprint","confidence","qualityMetadata",
]);
const RECEIPT_KEYS = new Set([
  "schemaVersion","kind","sourceReference","sourceFingerprint","transformKind","transformVersion","workerReceiptReference",
  "outputReference","outputFingerprint","transformedAt","confidence","qualityMetadata","fingerprint",
]);
const REQUIRED_RECEIPT_KEYS = [
  "schemaVersion","kind","sourceReference","sourceFingerprint","transformKind","transformVersion","workerReceiptReference",
  "outputReference","outputFingerprint","transformedAt","fingerprint",
];
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const META_KEY = /^[a-z][a-z0-9-]{0,47}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const SECRET_KEY = /(token|secret|password|credential|authorization|cookie|api-key|apikey)/i;
const SECRET_VALUE = /(?:bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export function createTransformationReceipt(input, { now = new Date().toISOString() } = {}) {
  exactSubset(input, INPUT_KEYS, "interaction-transformation-input-invalid");
  const normalized = normalizeCore({ ...input, transformedAt:now });
  if (normalized.sourceReference === normalized.outputReference || normalized.sourceFingerprint === normalized.outputFingerprint) {
    fail("interaction-transformation-derivative-invalid");
  }
  return validateTransformationReceipt({ ...normalized, fingerprint:digest(canonicalJson(normalized)) }, { now });
}

export function validateTransformationReceipt(value, { now = new Date().toISOString(), maxFutureSkewMs = 60_000, maximumAgeMs = null } = {}) {
  exactOptional(value, RECEIPT_KEYS, ["confidence","qualityMetadata"], "interaction-transformation-receipt-invalid", REQUIRED_RECEIPT_KEYS);
  if (value.schemaVersion !== 1 || value.kind !== "interaction-transformation-receipt") fail("interaction-transformation-receipt-invalid");
  const normalized = normalizeCore(value);
  if (normalized.sourceReference === normalized.outputReference || normalized.sourceFingerprint === normalized.outputFingerprint) {
    fail("interaction-transformation-derivative-invalid");
  }
  const fingerprint = bounded(value.fingerprint, 64, "interaction-transformation-receipt-fingerprint-invalid", HEX64);
  if (fingerprint !== digest(canonicalJson(normalized))) fail("interaction-transformation-receipt-fingerprint-invalid");
  if (!Number.isSafeInteger(maxFutureSkewMs) || maxFutureSkewMs < 0 || (maximumAgeMs !== null && (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 0))) fail("interaction-transformation-time-policy-invalid");
  const nowMs = Date.parse(timestamp(now, "interaction-transformation-time-invalid"));
  const transformedMs = Date.parse(normalized.transformedAt);
  if (transformedMs > nowMs + maxFutureSkewMs) fail("interaction-transformation-time-future");
  if (maximumAgeMs !== null && transformedMs < nowMs - maximumAgeMs) fail("interaction-transformation-time-stale");
  return deepFreeze({ ...normalized, fingerprint });
}

export function sourceEvidenceReference(receipt) {
  return validateTransformationReceipt(receipt).sourceReference;
}

function normalizeCore(value) {
  const confidence = Object.hasOwn(value, "confidence") && value.confidence !== undefined
    ? probability(value.confidence)
    : undefined;
  const qualityMetadata = Object.hasOwn(value, "qualityMetadata") && value.qualityMetadata !== undefined
    ? normalizeQualityMetadata(value.qualityMetadata)
    : undefined;
  return {
    schemaVersion:1,
    kind:"interaction-transformation-receipt",
    sourceReference:reference(value.sourceReference, "interaction-transformation-source-reference-invalid"),
    sourceFingerprint:bounded(value.sourceFingerprint, 64, "interaction-transformation-fingerprint-invalid", HEX64),
    transformKind:allowed(value.transformKind, TRANSFORM_KINDS, "interaction-transformation-kind-invalid"),
    transformVersion:bounded(value.transformVersion, 64, "interaction-transformation-version-invalid", VERSION),
    workerReceiptReference:reference(value.workerReceiptReference, "interaction-transformation-worker-receipt-invalid"),
    outputReference:reference(value.outputReference, "interaction-transformation-output-reference-invalid"),
    outputFingerprint:bounded(value.outputFingerprint, 64, "interaction-transformation-fingerprint-invalid", HEX64),
    transformedAt:timestamp(value.transformedAt, "interaction-transformation-time-invalid"),
    ...(confidence === undefined ? {} : { confidence }),
    ...(qualityMetadata === undefined ? {} : { qualityMetadata }),
  };
}

function normalizeQualityMetadata(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) fail("interaction-transformation-metadata-invalid");
  const normalized = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "key") || !Object.hasOwn(entry, "value")) {
      fail("interaction-transformation-metadata-invalid");
    }
    const key = bounded(entry.key, 48, "interaction-transformation-metadata-invalid", META_KEY);
    if (SECRET_KEY.test(key)) fail("interaction-transformation-metadata-secret");
    let item = entry.value;
    if (typeof item === "string") {
      if (item.length < 1 || item.length > 160) fail("interaction-transformation-metadata-invalid");
      if (SECRET_VALUE.test(item)) fail("interaction-transformation-metadata-secret");
    } else if (typeof item === "number") {
      if (!Number.isFinite(item) || item < 0 || item > 1) fail("interaction-transformation-metadata-invalid");
    } else if (typeof item !== "boolean") {
      fail("interaction-transformation-metadata-invalid");
    }
    return { key, value:item };
  }).sort((a, b) => a.key.localeCompare(b.key));
  if (new Set(normalized.map((entry) => entry.key)).size !== normalized.length) fail("interaction-transformation-metadata-invalid");
  return normalized;
}

function probability(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail("interaction-transformation-confidence-invalid");
  return value;
}

function reference(value, code) {
  const result = bounded(value, 160, code, TOKEN);
  if (result.includes("://")) fail(code);
  return result;
}

function exactSubset(value, allowedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) fail(code);
}

function exactOptional(value, allowedKeys, optionalKeys, code, requiredKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedKeys.has(key)) || requiredKeys.some((key) => !Object.hasOwn(value, key))) fail(code);
  for (const key of optionalKeys) if (Object.hasOwn(value, key) && value[key] === undefined) fail(code);
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(code);
  return value;
}

function allowed(value, values, code) {
  if (!values.has(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) fail(code);
  return new Date(ms).toISOString();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code) {
  throw new Error(code);
}

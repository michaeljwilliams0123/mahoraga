import crypto from "node:crypto";
import defaultPolicy from "../config/model-supply-chain.json" with { type: "json" };

export const DEFAULT_MODEL_SUPPLY_CHAIN = Object.freeze(defaultPolicy);

const POLICY_KEYS = Object.freeze(["admissions", "allowedFormats", "policyId", "runtimeProviders", "schemaVersion", "upstream"]);
const UPSTREAM_KEYS = Object.freeze(["immutableRevisionRequired", "origin", "provider", "trustRemoteCode"]);
const ENTRY_KEYS = Object.freeze(["artifact", "id", "inspection", "runtimeBindings", "source", "state"]);
const SOURCE_KEYS = Object.freeze(["artifactPath", "provider", "repository", "revision", "trustRemoteCode"]);
const ARTIFACT_KEYS = Object.freeze(["format", "sha256", "sizeBytes"]);
const INSPECTION_METADATA_KEYS = Object.freeze(["artifactSha256", "artifactSizeBytes", "executableCodeDetected", "expiresAt", "inspectedAt", "pickleDetected", "scannerId", "trustRemoteCode"]);
const INSPECTION_KEYS = Object.freeze([...INSPECTION_METADATA_KEYS, "receiptSha256"]);
const RUNTIME_BINDING_KEYS = Object.freeze(["digest", "provider", "sizeBytes"]);
const STATES = Object.freeze(["quarantined", "admitted", "revoked"]);
const FORMATS = Object.freeze(["safetensors", "gguf"]);
const RUNTIMES = Object.freeze(["ollama", "lm-studio"]);
const FORBIDDEN_EXTENSION = /\.(?:bin|ckpt|pt|pth|pkl|pickle|py|js|mjs|cjs|exe|dll|so|dylib|sh|bat|cmd|ps1)$/i;
const MAX_INSPECTION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function modelInspectionReceiptSha256(metadata) {
  exactKeys(metadata, INSPECTION_METADATA_KEYS, "model-supply-chain-inspection-invalid");
  return crypto.createHash("sha256").update(JSON.stringify(canonicalInspectionMetadata(metadata))).digest("hex");
}

export function validateModelSupplyChain(policy, { now = new Date() } = {}) {
  const nowMs = parseNow(now);
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) fail("model-supply-chain-invalid");
  exactKeys(policy, POLICY_KEYS);
  if (policy.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(policy.policyId ?? "")) fail("model-supply-chain-invalid");
  exactKeys(policy.upstream, UPSTREAM_KEYS);
  if (policy.upstream.provider !== "huggingface"
    || policy.upstream.origin !== "https://huggingface.co"
    || policy.upstream.immutableRevisionRequired !== true
    || policy.upstream.trustRemoteCode !== false) fail("model-supply-chain-invalid");
  if (!sameMembers(policy.allowedFormats, FORMATS) || !sameMembers(policy.runtimeProviders, RUNTIMES)) fail("model-supply-chain-invalid");
  if (!Array.isArray(policy.admissions) || policy.admissions.length > 256) fail("model-supply-chain-invalid");
  const ids = new Set();
  const digests = new Set();
  const runtimeBindings = new Set();
  for (const entry of policy.admissions) {
    validateEntry(entry, policy.allowedFormats, { nowMs, requireFreshInspection: entry?.state === "admitted" });
    if (ids.has(entry.id) || digests.has(entry.artifact.sha256)) fail("model-supply-chain-invalid");
    ids.add(entry.id);
    digests.add(entry.artifact.sha256);
    for (const binding of entry.runtimeBindings) {
      const bindingId = `${binding.provider}:${binding.digest}`;
      if (runtimeBindings.has(bindingId)) fail("model-supply-chain-invalid");
      runtimeBindings.add(bindingId);
    }
  }
  return policy;
}

export function transitionModelAdmission(entry, nextState, { now = new Date() } = {}) {
  if (nextState === "admitted" && (!entry?.inspection || !Array.isArray(entry?.runtimeBindings) || entry.runtimeBindings.length < 1)) {
    fail("model-supply-chain-inspection-invalid");
  }
  validateEntry(entry, FORMATS, { nowMs: parseNow(now), requireFreshInspection: nextState === "admitted" });
  const allowed = entry.state === "quarantined"
    ? ["admitted", "revoked"]
    : entry.state === "admitted"
      ? ["revoked"]
      : [];
  if (!allowed.includes(nextState)) fail("model-supply-chain-transition-invalid");
  return Object.freeze({ ...entry, state: nextState });
}

export function evaluateRuntimeModelAdmission({ provider, digest, sizeBytes } = {}, policy = DEFAULT_MODEL_SUPPLY_CHAIN, { now = new Date() } = {}) {
  try { validateModelSupplyChain(policy, { now }); }
  catch (error) {
    const reason = error?.code === "model-supply-chain-inspection-expired"
      ? error.code
      : error?.code === "model-supply-chain-inspection-invalid"
        ? error.code
        : "model-supply-chain-invalid";
    return Object.freeze({ admitted: false, state: "quarantined", reason });
  }
  const normalizedDigest = normalizeDigest(digest);
  if (!normalizedDigest) return Object.freeze({ admitted: false, state: "quarantined", reason: "model-supply-chain-digest-missing" });
  const entry = policy.admissions.find((item) => item.runtimeBindings.some((binding) => (
    binding.provider === provider && binding.digest === normalizedDigest && binding.sizeBytes === sizeBytes
  )));
  if (entry?.state === "revoked") {
    return Object.freeze({ admitted: false, state: "revoked", reason: "model-supply-chain-revoked" });
  }
  if (!entry || entry.state !== "admitted" || !policy.runtimeProviders.includes(provider)) {
    return Object.freeze({ admitted: false, state: "quarantined", reason: "model-supply-chain-unadmitted" });
  }
  return Object.freeze({ admitted: true, state: "admitted", reason: "model-supply-chain-admitted" });
}

function validateEntry(entry, allowedFormats, { nowMs, requireFreshInspection = false } = {}) {
  exactKeys(entry, ENTRY_KEYS);
  if (!/^[a-z0-9][a-z0-9._-]{2,95}$/.test(entry.id ?? "") || !STATES.includes(entry.state)) fail("model-supply-chain-invalid");
  exactKeys(entry.source, SOURCE_KEYS);
  if (entry.source.provider !== "huggingface"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(entry.source.repository ?? "")
    || !/^[a-f0-9]{40}$/.test(entry.source.revision ?? "")
    || entry.source.trustRemoteCode !== false
    || !safeArtifactPath(entry.source.artifactPath)) fail("model-supply-chain-invalid");
  exactKeys(entry.artifact, ARTIFACT_KEYS);
  if (!allowedFormats.includes(entry.artifact.format)
    || !/^[a-f0-9]{64}$/.test(entry.artifact.sha256 ?? "")
    || !Number.isSafeInteger(entry.artifact.sizeBytes)
    || entry.artifact.sizeBytes < 1
    || entry.artifact.sizeBytes > 1_099_511_627_776) fail("model-supply-chain-invalid");
  const extension = entry.source.artifactPath.toLowerCase().split(".").pop();
  if (FORBIDDEN_EXTENSION.test(entry.source.artifactPath) || extension !== entry.artifact.format) fail("model-supply-chain-invalid");
  validateInspection(entry.inspection, entry.artifact, { nowMs, requireFresh: requireFreshInspection });
  if (!Array.isArray(entry.runtimeBindings) || entry.runtimeBindings.length > 16) fail("model-supply-chain-invalid");
  const bindings = new Set();
  for (const binding of entry.runtimeBindings) {
    exactKeys(binding, RUNTIME_BINDING_KEYS);
    if (!RUNTIMES.includes(binding.provider)
      || !/^[a-f0-9]{64}$/.test(binding.digest ?? "")
      || !Number.isSafeInteger(binding.sizeBytes)
      || binding.sizeBytes < 1
      || binding.sizeBytes > 1_099_511_627_776) fail("model-supply-chain-invalid");
    const bindingId = `${binding.provider}:${binding.digest}`;
    if (bindings.has(bindingId)) fail("model-supply-chain-invalid");
    bindings.add(bindingId);
  }
}

function validateInspection(inspection, artifact, { nowMs, requireFresh }) {
  exactKeys(inspection, INSPECTION_KEYS, "model-supply-chain-inspection-invalid");
  const metadata = canonicalInspectionMetadata(inspection);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(metadata.scannerId ?? "")
    || metadata.artifactSha256 !== artifact.sha256
    || metadata.artifactSizeBytes !== artifact.sizeBytes
    || metadata.trustRemoteCode !== false
    || metadata.pickleDetected !== false
    || metadata.executableCodeDetected !== false
    || !/^[a-f0-9]{64}$/.test(inspection.receiptSha256 ?? "")
    || modelInspectionReceiptSha256(metadata) !== inspection.receiptSha256) {
    fail("model-supply-chain-inspection-invalid");
  }
  const inspectedAtMs = parseCanonicalTimestamp(metadata.inspectedAt);
  const expiresAtMs = parseCanonicalTimestamp(metadata.expiresAt);
  if (inspectedAtMs === null || expiresAtMs === null || expiresAtMs <= inspectedAtMs) fail("model-supply-chain-inspection-invalid");
  if (requireFresh && (expiresAtMs <= nowMs || inspectedAtMs > nowMs || expiresAtMs - inspectedAtMs > MAX_INSPECTION_LIFETIME_MS)) {
    fail("model-supply-chain-inspection-expired");
  }
}

function canonicalInspectionMetadata(value) {
  return {
    scannerId: value.scannerId,
    artifactSha256: value.artifactSha256,
    artifactSizeBytes: value.artifactSizeBytes,
    trustRemoteCode: value.trustRemoteCode,
    pickleDetected: value.pickleDetected,
    executableCodeDetected: value.executableCodeDetected,
    inspectedAt: value.inspectedAt,
    expiresAt: value.expiresAt,
  };
}

function parseCanonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function parseNow(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) fail("model-supply-chain-invalid");
  return parsed;
}

function safeArtifactPath(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 240) return false;
  if (value.includes("\\") || value.startsWith("/") || value.includes(":") || value.includes("?") || value.includes("#")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment));
}

function exactKeys(value, expected, code = "model-supply-chain-invalid") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) fail(code);
}

function sameMembers(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && [...value].sort().every((item, index) => item === [...expected].sort()[index]);
}

function normalizeDigest(value) {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("sha256:") ? value.slice(7) : value;
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

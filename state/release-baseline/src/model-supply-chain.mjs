import defaultPolicy from "../config/model-supply-chain.json" with { type: "json" };

export const DEFAULT_MODEL_SUPPLY_CHAIN = Object.freeze(defaultPolicy);

const POLICY_KEYS = Object.freeze(["admissions", "allowedFormats", "policyId", "runtimeProviders", "schemaVersion", "upstream"]);
const UPSTREAM_KEYS = Object.freeze(["immutableRevisionRequired", "origin", "provider", "trustRemoteCode"]);
const ENTRY_KEYS = Object.freeze(["artifact", "id", "source", "state"]);
const SOURCE_KEYS = Object.freeze(["artifactPath", "provider", "repository", "revision", "trustRemoteCode"]);
const ARTIFACT_KEYS = Object.freeze(["format", "sha256", "sizeBytes"]);
const STATES = Object.freeze(["quarantined", "admitted", "revoked"]);
const FORMATS = Object.freeze(["safetensors", "gguf"]);
const RUNTIMES = Object.freeze(["ollama", "lm-studio"]);
const FORBIDDEN_EXTENSION = /\.(?:bin|ckpt|pt|pth|pkl|pickle|py|js|mjs|cjs|exe|dll|so|dylib|sh|bat|cmd|ps1)$/i;

export function validateModelSupplyChain(policy) {
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
  for (const entry of policy.admissions) {
    validateEntry(entry, policy.allowedFormats);
    if (ids.has(entry.id) || digests.has(entry.artifact.sha256)) fail("model-supply-chain-invalid");
    ids.add(entry.id);
    digests.add(entry.artifact.sha256);
  }
  return policy;
}

export function transitionModelAdmission(entry, nextState) {
  validateEntry(entry, FORMATS);
  const allowed = entry.state === "quarantined"
    ? ["admitted", "revoked"]
    : entry.state === "admitted"
      ? ["revoked"]
      : [];
  if (!allowed.includes(nextState)) fail("model-supply-chain-transition-invalid");
  return Object.freeze({ ...entry, state: nextState });
}

export function evaluateRuntimeModelAdmission({ provider, digest, sizeBytes } = {}, policy = DEFAULT_MODEL_SUPPLY_CHAIN) {
  try { validateModelSupplyChain(policy); }
  catch { return Object.freeze({ admitted: false, state: "quarantined", reason: "model-supply-chain-invalid" }); }
  const normalizedDigest = normalizeDigest(digest);
  if (!normalizedDigest) return Object.freeze({ admitted: false, state: "quarantined", reason: "model-supply-chain-digest-missing" });
  const entry = policy.admissions.find((item) => item.artifact.sha256 === normalizedDigest && item.artifact.sizeBytes === sizeBytes);
  if (entry?.state === "revoked") {
    return Object.freeze({ admitted: false, state: "revoked", reason: "model-supply-chain-revoked" });
  }
  if (!entry || entry.state !== "admitted" || !policy.runtimeProviders.includes(provider)) {
    return Object.freeze({ admitted: false, state: "quarantined", reason: "model-supply-chain-unadmitted" });
  }
  return Object.freeze({ admitted: true, state: "admitted", reason: "model-supply-chain-admitted" });
}

function validateEntry(entry, allowedFormats) {
  exactKeys(entry, ENTRY_KEYS);
  if (!/^[a-z0-9][a-z0-9._-]{2,95}$/.test(entry.id ?? "") || !STATES.includes(entry.state)) fail("model-supply-chain-invalid");
  exactKeys(entry.source, SOURCE_KEYS);
  if (entry.source.provider !== "huggingface"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(entry.source.repository ?? "")
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.source.revision ?? "")
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
}

function safeArtifactPath(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 240) return false;
  if (value.includes("\\") || value.startsWith("/") || value.includes(":") || value.includes("?") || value.includes("#")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment));
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("model-supply-chain-invalid");
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) fail("model-supply-chain-invalid");
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

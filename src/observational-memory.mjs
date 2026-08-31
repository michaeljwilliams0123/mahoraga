const TURN_KEYS = new Set(["id", "role", "content", "createdAt"]);
const OBSERVATION_KEYS = new Set(["id", "summarySha256", "sizeBytes", "createdAt"]);
const EVIDENCE_KEYS = new Set(["type", "id", "sha256", "state"]);
const EVIDENCE_TYPES = new Set(["authority", "approval", "tool-result", "receipt", "deployment"]);

export function buildMemoryWindow({ recentTurns, observations, immutableEvidence, limits }) {
  if (!Array.isArray(recentTurns) || !Array.isArray(observations) || !Array.isArray(immutableEvidence)) fail("memory-input-invalid");
  const bounded = validateLimits(limits);
  const turns = recentTurns.map(validateTurn).slice(-bounded.rawTurnLimit);
  const summaries = observations.map(validateObservation).slice(-bounded.observationLimit);
  const evidence = immutableEvidence.map(validateEvidence);
  const result = { schemaVersion: 1, recentTurns: turns, observations: summaries, immutableEvidence: evidence };
  while (byteLength(result) > bounded.maximumBytes && result.recentTurns.length > 0) result.recentTurns.shift();
  while (byteLength(result) > bounded.maximumBytes && result.observations.length > 0) result.observations.shift();
  if (byteLength(result) > bounded.maximumBytes) fail("memory-evidence-too-large");
  return deepFreeze(structuredClone(result));
}

function validateTurn(value) {
  exact(value, TURN_KEYS, "memory-turn-invalid");
  text(value.id, 120, "memory-turn-invalid");
  if (!new Set(["user", "assistant", "tool"]).has(value.role)) fail("memory-turn-invalid");
  if (typeof value.content !== "string" || Buffer.byteLength(value.content, "utf8") > 65_536) fail("memory-turn-invalid");
  timestamp(value.createdAt, "memory-turn-invalid");
  return structuredClone(value);
}
function validateObservation(value) {
  exact(value, OBSERVATION_KEYS, "observation-invalid");
  text(value.id, 120, "observation-invalid"); hash(value.summarySha256, "observation-invalid");
  if (!Number.isInteger(value.sizeBytes) || value.sizeBytes < 0 || value.sizeBytes > 1_048_576) fail("observation-invalid");
  timestamp(value.createdAt, "observation-invalid");
  return structuredClone(value);
}
function validateEvidence(value) {
  exact(value, EVIDENCE_KEYS, "immutable-evidence-invalid");
  if (!EVIDENCE_TYPES.has(value.type)) fail("immutable-evidence-type-invalid");
  text(value.id, 120, "immutable-evidence-invalid"); hash(value.sha256, "immutable-evidence-invalid"); text(value.state, 80, "immutable-evidence-invalid");
  return structuredClone(value);
}
function validateLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("memory-limits-invalid");
  for (const [key, min, max] of [["rawTurnLimit", 0, 1_000], ["observationLimit", 0, 10_000], ["maximumBytes", 512, 16_777_216]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) fail("memory-limits-invalid");
  }
  return value;
}
function exact(value, keys, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function text(value, max, code) { if (typeof value !== "string" || value.length < 1 || value.length > max || /[\0\r\n]/.test(value)) fail(code); }
function hash(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(code); }
function timestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); }
function byteLength(value) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

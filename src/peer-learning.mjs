import { createHash } from "node:crypto";
import { createInstitutionalMemoryRecord } from "./institutional-memory.mjs";

export const PEER_LEARNING_SCHEMA_VERSION = 1;
export const PEER_LEARNING_MARKER = "MAHORAGA-PEER-EVENT-V1";

const SOURCES = new Set(["github-mahoraga", "copilot-studio-mahoraga"]);
const EVENT_MEMORY_CLASS = new Map([
  ["capability-observed", "learned-capability"],
  ["outcome-succeeded", "outcome"],
  ["outcome-failed", "failure"],
  ["routing-learned", "strategy"],
  ["regression-observed", "system-pattern"],
]);
const EVENT_KEYS = new Set([
  "schemaVersion", "eventId", "source", "eventType", "capability", "statement",
  "confidence", "objectiveIds", "evidenceRefs", "observedAt", "dataClass",
  "zeroCredit", "providerRequired",
]);
const SENSITIVE = [
  /authorization\s*:\s*bearer\s+[a-z0-9._~+\/-]{12,}/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bsk-(?:proj-)?[a-z0-9_-]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:password|client_secret|connection_string)\s*[:=]\s*[^\s,;]{8,}/i,
];

function fail(code) {
  throw new TypeError(code);
}

function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("peer-learning-invalid");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("peer-learning-invalid");
}

function slug(value, maximum, code) {
  if (typeof value !== "string" || value.length > maximum || !/^[a-z0-9][a-z0-9-]*$/.test(value)) fail(code);
  return value;
}

function text(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\0]/.test(normalized)) fail(code);
  return normalized;
}

function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("peer-learning-observed-at-invalid");
  }
  return value;
}

function stringList(value, { maximumItems, maximumLength, slugOnly = false, code }) {
  if (!Array.isArray(value) || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  const normalized = value.map((item) => slugOnly ? slug(item, maximumLength, code) : text(item, maximumLength, code));
  return normalized.sort();
}

function assertMetadataSafe(values) {
  const body = values.join("\n");
  if (SENSITIVE.some((pattern) => pattern.test(body))) fail("peer-learning-sensitive-content");
}

function identityCore(value) {
  return {
    schemaVersion: PEER_LEARNING_SCHEMA_VERSION,
    source: value.source,
    eventType: value.eventType,
    capability: value.capability,
    statement: value.statement,
    confidence: value.confidence,
    objectiveIds: [...value.objectiveIds],
    evidenceRefs: [...value.evidenceRefs],
    observedAt: value.observedAt,
    dataClass: "metadata",
    zeroCredit: true,
    providerRequired: false,
  };
}

function eventId(core) {
  const digest = createHash("sha256").update(JSON.stringify(core), "utf8").digest("hex");
  return `ple-${digest.slice(0, 32)}`;
}

function normalizeCore(input) {
  if (!SOURCES.has(input?.source)) fail("peer-learning-source-invalid");
  if (!EVENT_MEMORY_CLASS.has(input?.eventType)) fail("peer-learning-event-type-invalid");
  const capability = slug(input.capability, 64, "peer-learning-capability-invalid");
  const statement = text(input.statement, 500, "peer-learning-statement-invalid");
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    fail("peer-learning-confidence-invalid");
  }
  const objectiveIds = stringList(input.objectiveIds ?? [], {
    maximumItems: 32, maximumLength: 96, slugOnly: true, code: "peer-learning-objectives-invalid",
  });
  const evidenceRefs = stringList(input.evidenceRefs ?? [], {
    maximumItems: 32, maximumLength: 240, code: "peer-learning-evidence-invalid",
  });
  const observedAt = timestamp(input.observedAt ?? new Date().toISOString());
  assertMetadataSafe([statement, ...evidenceRefs]);
  return {
    schemaVersion: PEER_LEARNING_SCHEMA_VERSION,
    source: input.source,
    eventType: input.eventType,
    capability,
    statement,
    confidence: input.confidence,
    objectiveIds,
    evidenceRefs,
    observedAt,
    dataClass: "metadata",
    zeroCredit: true,
    providerRequired: false,
  };
}

export function createPeerLearningEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("peer-learning-invalid");
  const core = normalizeCore(input);
  return Object.freeze({ ...core, eventId: eventId(core) });
}

export function validatePeerLearningEvent(value) {
  exact(value, EVENT_KEYS);
  if (value.schemaVersion !== PEER_LEARNING_SCHEMA_VERSION) fail("peer-learning-schema-invalid");
  if (value.dataClass !== "metadata" || value.zeroCredit !== true || value.providerRequired !== false) {
    fail("peer-learning-provider-boundary-invalid");
  }
  const core = normalizeCore(value);
  if (typeof value.eventId !== "string" || value.eventId !== eventId(core)) fail("peer-learning-id-mismatch");
  return Object.freeze({ ...core, eventId: value.eventId });
}

export function parsePeerLearningComment(comment) {
  if (typeof comment !== "string" || !comment.includes(PEER_LEARNING_MARKER)) return null;
  const markers = comment.split(PEER_LEARNING_MARKER).length - 1;
  if (markers !== 1) fail("peer-learning-comment-ambiguous");
  const after = comment.slice(comment.indexOf(PEER_LEARNING_MARKER) + PEER_LEARNING_MARKER.length);
  const matches = [...after.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (matches.length !== 1) fail("peer-learning-comment-invalid");
  let parsed;
  try { parsed = JSON.parse(matches[0][1]); } catch { fail("peer-learning-comment-json-invalid"); }
  return validatePeerLearningEvent(parsed);
}

export function peerEventToInstitutionalMemory(value) {
  const event = validatePeerLearningEvent(value);
  return createInstitutionalMemoryRecord({
    memoryClass: EVENT_MEMORY_CLASS.get(event.eventType),
    subject: `peer-${event.source}-${event.capability}`,
    statement: event.statement,
    provenance: "connected-evidence",
    confidence: event.confidence,
    freshness: "current",
    objectiveIds: event.objectiveIds,
    evidenceRefs: [...event.evidenceRefs, `peer-event:${event.eventId}`, `peer-source:${event.source}`],
    capability: event.capability,
    supersedes: [],
  }, { observedAt: event.observedAt });
}

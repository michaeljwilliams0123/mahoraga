import crypto from 'node:crypto';

export const LEVEL8_MEMORY_SCHEMA_VERSION = 1;

const MEMORY_CLASSES = new Set(['fact', 'knowledge', 'procedure', 'negative-memory']);
const PROVENANCE = new Set(['owner-explicit', 'verified-outcome', 'synthesized']);
const FRESHNESS = new Set(['current', 'stale', 'historical']);
const RECORD_KEYS = new Set([
  'schemaVersion', 'memoryId', 'memoryClass', 'subject', 'statement', 'provenance',
  'confidence', 'freshness', 'objectiveIds', 'evidenceRefs', 'capability',
  'supersedes', 'observedAt', 'zeroCredit', 'providerRequired',
]);

export function createInstitutionalMemoryRecord(input, { observedAt = new Date().toISOString() } = {}) {
  const core = {
    memoryClass: checkedEnum(input.memoryClass, MEMORY_CLASSES, 'institutional-memory-class-invalid'),
    subject: checkedSlug(input.subject, 'institutional-memory-subject-invalid'),
    statement: checkedText(input.statement, 4000, 'institutional-memory-statement-invalid'),
    provenance: checkedEnum(input.provenance, PROVENANCE, 'institutional-memory-provenance-invalid'),
    confidence: checkedConfidence(input.confidence),
    freshness: checkedEnum(input.freshness, FRESHNESS, 'institutional-memory-freshness-invalid'),
    objectiveIds: normalizeRefs(input.objectiveIds ?? [], 'institutional-memory-objectives-invalid'),
    evidenceRefs: normalizeRefs(input.evidenceRefs ?? [], 'institutional-memory-evidence-invalid'),
    capability: checkedSlug(input.capability, 'institutional-memory-capability-invalid'),
    supersedes: normalizeMemoryIds(input.supersedes ?? []),
    observedAt: checkedTimestamp(observedAt, 'institutional-memory-observed-at-invalid'),
  };
  const memoryId = `mem-${sha256(stable(core)).slice(0, 32)}`;
  return validateInstitutionalMemoryRecord({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    memoryId,
    ...core,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateInstitutionalMemoryRecord(value) {
  exact(value, RECORD_KEYS, 'institutional-memory-record-invalid');
  if (value.schemaVersion !== LEVEL8_MEMORY_SCHEMA_VERSION) fail('institutional-memory-schema-invalid');
  if (typeof value.memoryId !== 'string' || !/^mem-[a-f0-9]{32}$/.test(value.memoryId)) fail('institutional-memory-id-invalid');
  checkedEnum(value.memoryClass, MEMORY_CLASSES, 'institutional-memory-class-invalid');
  checkedSlug(value.subject, 'institutional-memory-subject-invalid');
  checkedText(value.statement, 4000, 'institutional-memory-statement-invalid');
  checkedEnum(value.provenance, PROVENANCE, 'institutional-memory-provenance-invalid');
  checkedConfidence(value.confidence);
  checkedEnum(value.freshness, FRESHNESS, 'institutional-memory-freshness-invalid');
  normalizeRefs(value.objectiveIds, 'institutional-memory-objectives-invalid');
  normalizeRefs(value.evidenceRefs, 'institutional-memory-evidence-invalid');
  checkedSlug(value.capability, 'institutional-memory-capability-invalid');
  normalizeMemoryIds(value.supersedes);
  checkedTimestamp(value.observedAt, 'institutional-memory-observed-at-invalid');
  if (value.zeroCredit !== true) fail('institutional-memory-zero-credit-required');
  if (value.providerRequired !== false) fail('institutional-memory-provider-required-invalid');
  return deepFreeze(structuredClone(value));
}

export function reconcileInstitutionalMemory({ records = [], incoming = [], now = new Date().toISOString() } = {}) {
  checkedTimestamp(now, 'institutional-memory-reconcile-time-invalid');
  if (!Array.isArray(records) || !Array.isArray(incoming) || records.length + incoming.length > 10_000) {
    fail('institutional-memory-list-invalid');
  }
  const byId = new Map();
  for (const raw of [...records, ...incoming]) {
    const record = validateInstitutionalMemoryRecord(raw);
    const prior = byId.get(record.memoryId);
    if (prior && stable(prior) !== stable(record)) fail('institutional-memory-id-conflict');
    byId.set(record.memoryId, record);
  }
  for (const record of byId.values()) {
    for (const target of record.supersedes) {
      if (target === record.memoryId || !byId.has(target)) fail('institutional-memory-supersession-target-missing');
    }
  }
  const ordered = [...byId.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.memoryId.localeCompare(b.memoryId));
  const superseded = [...new Set(ordered.flatMap((record) => record.supersedes))].sort();
  return deepFreeze({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    reconciledAt: now,
    records: ordered,
    supersededMemoryIds: superseded,
    fingerprint: sha256(stable(ordered)),
    zeroCredit: true,
    providerRequired: false,
  });
}

export function queryInstitutionalMemory({ records = [], capability = null, includeSuperseded = false } = {}) {
  if (!Array.isArray(records)) fail('institutional-memory-list-invalid');
  if (capability !== null) checkedSlug(capability, 'institutional-memory-capability-invalid');
  const validated = records.map(validateInstitutionalMemoryRecord);
  const superseded = new Set(validated.flatMap((record) => record.supersedes));
  return deepFreeze(validated
    .filter((record) => (capability === null || record.capability === capability) && (includeSuperseded || !superseded.has(record.memoryId)))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.memoryId.localeCompare(b.memoryId)));
}

function normalizeRefs(value, code) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, code)).sort();
}

function normalizeMemoryIds(value) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail('institutional-memory-supersedes-invalid');
  for (const item of value) if (typeof item !== 'string' || !/^mem-[a-f0-9]{32}$/.test(item)) fail('institutional-memory-supersedes-invalid');
  return [...value].sort();
}

function checkedConfidence(value) { if (!Number.isFinite(value) || value < 0 || value > 1) fail('institutional-memory-confidence-invalid'); return value; }
function checkedEnum(value, allowed, code) { if (!allowed.has(value)) fail(code); return value; }
function checkedSlug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)) fail(code); return value; }
function checkedText(value, max, code) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(code); return value; }
function checkedTimestamp(value, code) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

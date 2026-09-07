import crypto from 'node:crypto';

export const LEVEL8_MEMORY_SCHEMA_VERSION = 1;

const MEMORY_CLASSES = new Set([
  'fact',
  'knowledge',
  'procedure',
  'negative-memory',
  'strategy',
  'pattern',
  'hypothesis',
]);
const PROVENANCE = new Set(['owner-explicit', 'verified-outcome', 'synthesized', 'external-evidence']);
const FRESHNESS = new Set(['current', 'historical', 'stale', 'unknown']);
const MEMORY_KEYS = new Set([
  'schemaVersion',
  'memoryId',
  'memoryClass',
  'subject',
  'statement',
  'provenance',
  'confidence',
  'freshness',
  'objectiveIds',
  'evidenceRefs',
  'capability',
  'supersedes',
  'observedAt',
  'zeroCredit',
  'providerRequired',
]);

export function createInstitutionalMemoryRecord(input, { observedAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('institutional-memory-input-invalid');
  const core = {
    memoryClass: checkedEnum(input.memoryClass, MEMORY_CLASSES, 'institutional-memory-class-invalid'),
    subject: checkedSlug(input.subject, 'institutional-memory-subject-invalid'),
    statement: checkedText(input.statement, 4000, 'institutional-memory-statement-invalid'),
    provenance: checkedEnum(input.provenance, PROVENANCE, 'institutional-memory-provenance-invalid'),
    confidence: checkedConfidence(input.confidence),
    freshness: checkedEnum(input.freshness, FRESHNESS, 'institutional-memory-freshness-invalid'),
    objectiveIds: normalizeSlugs(input.objectiveIds ?? [], 128, 'institutional-memory-objectives-invalid'),
    evidenceRefs: normalizeEvidence(input.evidenceRefs ?? []),
    capability: checkedSlug(input.capability, 'institutional-memory-capability-invalid'),
    supersedes: normalizeMemoryIds(input.supersedes ?? []),
    observedAt: checkedTimestamp(observedAt, 'institutional-memory-observed-at-invalid'),
  };
  const memoryId = `mem-${digest(core).slice(0, 32)}`;
  return validateInstitutionalMemoryRecord({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    memoryId,
    ...core,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateInstitutionalMemoryRecord(value) {
  exact(value, MEMORY_KEYS, 'institutional-memory-record-invalid');
  if (value.schemaVersion !== LEVEL8_MEMORY_SCHEMA_VERSION) fail('institutional-memory-schema-invalid');
  checkedMemoryId(value.memoryId);
  checkedEnum(value.memoryClass, MEMORY_CLASSES, 'institutional-memory-class-invalid');
  checkedSlug(value.subject, 'institutional-memory-subject-invalid');
  checkedText(value.statement, 4000, 'institutional-memory-statement-invalid');
  checkedEnum(value.provenance, PROVENANCE, 'institutional-memory-provenance-invalid');
  checkedConfidence(value.confidence);
  checkedEnum(value.freshness, FRESHNESS, 'institutional-memory-freshness-invalid');
  normalizeSlugs(value.objectiveIds, 128, 'institutional-memory-objectives-invalid');
  normalizeEvidence(value.evidenceRefs);
  checkedSlug(value.capability, 'institutional-memory-capability-invalid');
  const supersedes = normalizeMemoryIds(value.supersedes);
  if (supersedes.includes(value.memoryId)) fail('institutional-memory-self-supersession-invalid');
  checkedTimestamp(value.observedAt, 'institutional-memory-observed-at-invalid');
  if (value.zeroCredit !== true || value.providerRequired !== false) fail('institutional-memory-credit-boundary-invalid');
  return deepFreeze(structuredClone(value));
}

export function reconcileInstitutionalMemory({ records = [], incoming = [], now = new Date().toISOString() } = {}) {
  checkedTimestamp(now, 'institutional-memory-reconcile-time-invalid');
  if (!Array.isArray(records) || !Array.isArray(incoming) || records.length > 50_000 || incoming.length > 10_000) {
    fail('institutional-memory-ledger-invalid');
  }

  const validatedExisting = records.map(validateInstitutionalMemoryRecord);
  const knownIds = new Set(validatedExisting.map((record) => record.memoryId));
  const incomingRawIds = new Set(incoming.map((record) => record?.memoryId).filter((id) => typeof id === 'string'));
  const admissibleTargets = new Set([...knownIds, ...incomingRawIds]);

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.supersedes)) continue;
    for (const target of raw.supersedes) {
      if (!admissibleTargets.has(target)) fail('institutional-memory-supersession-target-missing');
    }
  }

  const all = [...validatedExisting, ...incoming.map(validateInstitutionalMemoryRecord)];
  const byId = new Map();
  for (const record of all) {
    for (const target of record.supersedes) {
      if (!all.some((candidate) => candidate.memoryId === target)) fail('institutional-memory-supersession-target-missing');
    }
    const current = byId.get(record.memoryId);
    if (current && canonical(current) !== canonical(record)) fail('institutional-memory-id-conflict');
    if (!current) byId.set(record.memoryId, record);
  }

  assertAcyclicSupersession([...byId.values()]);
  const ordered = [...byId.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.memoryId.localeCompare(b.memoryId));
  const supersededIds = [...new Set(ordered.flatMap((record) => record.supersedes))].sort();
  const fingerprint = digest(ordered);
  return deepFreeze({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    records: ordered,
    supersededIds,
    fingerprint,
    reconciledAt: now,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function queryInstitutionalMemory({ records = [], capability = null, subject = null, memoryClass = null, includeSuperseded = false } = {}) {
  if (!Array.isArray(records) || records.length > 50_000) fail('institutional-memory-query-invalid');
  if (capability !== null) checkedSlug(capability, 'institutional-memory-capability-invalid');
  if (subject !== null) checkedSlug(subject, 'institutional-memory-subject-invalid');
  if (memoryClass !== null) checkedEnum(memoryClass, MEMORY_CLASSES, 'institutional-memory-class-invalid');
  if (typeof includeSuperseded !== 'boolean') fail('institutional-memory-query-invalid');

  const validated = records.map(validateInstitutionalMemoryRecord);
  const superseded = new Set(validated.flatMap((record) => record.supersedes));
  return deepFreeze(validated
    .filter((record) => includeSuperseded || !superseded.has(record.memoryId))
    .filter((record) => capability === null || record.capability === capability)
    .filter((record) => subject === null || record.subject === subject)
    .filter((record) => memoryClass === null || record.memoryClass === memoryClass)
    .sort((a, b) => b.confidence - a.confidence || b.observedAt.localeCompare(a.observedAt) || a.memoryId.localeCompare(b.memoryId)));
}

function assertAcyclicSupersession(records) {
  const edges = new Map(records.map((record) => [record.memoryId, record.supersedes]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail('institutional-memory-supersession-cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of edges.keys()) visit(id);
}

function normalizeEvidence(value) {
  if (!Array.isArray(value) || value.length > 256 || new Set(value).size !== value.length) fail('institutional-memory-evidence-invalid');
  return value.map((item) => checkedText(item, 320, 'institutional-memory-evidence-invalid')).sort();
}
function normalizeMemoryIds(value) {
  if (!Array.isArray(value) || value.length > 128 || new Set(value).size !== value.length) fail('institutional-memory-supersedes-invalid');
  return value.map(checkedMemoryId).sort();
}
function normalizeSlugs(value, max, code) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, code)).sort();
}
function checkedMemoryId(value) { if (typeof value !== 'string' || !/^mem-[a-f0-9]{32}$/.test(value)) fail('institutional-memory-id-invalid'); return value; }
function checkedConfidence(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('institutional-memory-confidence-invalid'); return value; }
function checkedSlug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code); return value; }
function checkedText(value, max, code) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(code); return value; }
function checkedTimestamp(value, code) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function checkedEnum(value, allowed, code) { if (!allowed.has(value)) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function canonical(value) { return JSON.stringify(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

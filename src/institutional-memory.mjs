import { createHash } from 'node:crypto';

export const LEVEL8_MEMORY_SCHEMA_VERSION = 1;

const MEMORY_CLASSES = new Set([
  'fact', 'observation', 'knowledge', 'strategy', 'outcome', 'failure',
  'source-reliability', 'procedure', 'learned-capability', 'stakeholder-pattern',
  'system-pattern', 'negative-memory',
]);
const PROVENANCE = new Set(['owner-explicit', 'connected-evidence', 'verified-outcome', 'synthesized', 'entity-inference']);
const FRESHNESS = new Set(['current', 'aging', 'stale', 'historical']);
const RECORD_KEYS = new Set([
  'schemaVersion', 'memoryId', 'memoryClass', 'subject', 'statement', 'provenance',
  'confidence', 'freshness', 'objectiveIds', 'evidenceRefs', 'capability', 'supersedes',
  'observedAt', 'zeroCredit', 'providerRequired',
]);

export function createInstitutionalMemoryRecord(input, { observedAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('institutional-memory-invalid');
  const core = normalizeCore(input, observedAt);
  const memoryId = `mem-${digest(identityCore(core)).slice(0, 32)}`;
  return validateInstitutionalMemoryRecord({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    memoryId,
    ...core,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateInstitutionalMemoryRecord(value) {
  exact(value, RECORD_KEYS, 'institutional-memory-invalid');
  if (value.schemaVersion !== LEVEL8_MEMORY_SCHEMA_VERSION) fail('institutional-memory-schema-invalid');
  if (typeof value.memoryId !== 'string' || !/^mem-[a-f0-9]{32}$/.test(value.memoryId)) fail('institutional-memory-id-invalid');
  const core = normalizeCore(value, value.observedAt);
  if (value.zeroCredit !== true || value.providerRequired !== false) fail('institutional-memory-provider-boundary-invalid');
  return deepFreeze({ schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION, memoryId: value.memoryId, ...core, zeroCredit: true, providerRequired: false });
}

export function reconcileInstitutionalMemory({ records = [], incoming = [], now = new Date().toISOString() } = {}) {
  canonicalTimestamp(now, 'institutional-memory-clock-invalid');
  if (!Array.isArray(records) || !Array.isArray(incoming) || records.length > 20_000 || incoming.length > 4_096) {
    fail('institutional-memory-list-invalid');
  }
  const byId = new Map();
  for (const raw of [...records, ...incoming]) {
    const record = validateInstitutionalMemoryRecord(raw);
    const current = byId.get(record.memoryId);
    if (current) {
      if (JSON.stringify(identityCore(current)) !== JSON.stringify(identityCore(record))) fail('institutional-memory-id-conflict');
      if (record.observedAt < current.observedAt) byId.set(record.memoryId, record);
      continue;
    }
    byId.set(record.memoryId, record);
  }
  const ordered = [...byId.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.memoryId.localeCompare(b.memoryId));
  const ids = new Set(ordered.map((record) => record.memoryId));
  for (const record of ordered) {
    if (record.supersedes.includes(record.memoryId)) fail('institutional-memory-self-supersession');
    for (const target of record.supersedes) if (!ids.has(target)) fail('institutional-memory-supersession-target-missing');
  }
  assertAcyclic(ordered);
  const superseded = new Set(ordered.flatMap((record) => record.supersedes));
  const activeMemoryIds = ordered.filter((record) => !superseded.has(record.memoryId)).map((record) => record.memoryId).sort();
  const supersededMemoryIds = [...superseded].sort();
  const fingerprint = digest(ordered.map((record) => ({ ...identityCore(record), memoryId: record.memoryId })));
  return deepFreeze({
    schemaVersion: LEVEL8_MEMORY_SCHEMA_VERSION,
    records: ordered,
    activeMemoryIds,
    supersededMemoryIds,
    fingerprint,
    zeroCredit: true,
    providerRequired: false,
  });
}

export function queryInstitutionalMemory({
  records = [],
  classes = null,
  objectiveId = null,
  capability = null,
  includeSuperseded = false,
  limit = 100,
} = {}) {
  if (!Array.isArray(records) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) fail('institutional-memory-query-invalid');
  const normalized = records.map(validateInstitutionalMemoryRecord);
  const classSet = classes == null ? null : new Set(normalizeClasses(classes));
  const superseded = new Set(normalized.flatMap((record) => record.supersedes));
  const result = normalized.filter((record) => {
    if (!includeSuperseded && superseded.has(record.memoryId)) return false;
    if (classSet && !classSet.has(record.memoryClass)) return false;
    if (objectiveId != null && !record.objectiveIds.includes(checkedSlug(objectiveId, 96, 'institutional-memory-objective-invalid'))) return false;
    if (capability != null && record.capability !== checkedSlug(capability, 64, 'institutional-memory-capability-invalid')) return false;
    return true;
  });
  return deepFreeze(result.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.memoryId.localeCompare(b.memoryId)).slice(0, limit));
}

function normalizeCore(input, observedAt) {
  const memoryClass = String(input.memoryClass ?? '');
  if (!MEMORY_CLASSES.has(memoryClass)) fail('institutional-memory-class-invalid');
  const provenance = String(input.provenance ?? '');
  if (!PROVENANCE.has(provenance)) fail('institutional-memory-provenance-invalid');
  const freshness = String(input.freshness ?? '');
  if (!FRESHNESS.has(freshness)) fail('institutional-memory-freshness-invalid');
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    fail('institutional-memory-confidence-invalid');
  }
  return {
    memoryClass,
    subject: checkedSlug(input.subject, 96, 'institutional-memory-subject-invalid'),
    statement: checkedText(input.statement, 4_000, 'institutional-memory-statement-invalid'),
    provenance,
    confidence: input.confidence,
    freshness,
    objectiveIds: normalizeSlugs(input.objectiveIds ?? [], 64, 96, 'institutional-memory-objectives-invalid'),
    evidenceRefs: normalizeTextList(input.evidenceRefs ?? [], 64, 240, 'institutional-memory-evidence-invalid'),
    capability: checkedSlug(input.capability, 64, 'institutional-memory-capability-invalid'),
    supersedes: normalizeMemoryIds(input.supersedes ?? []),
    observedAt: canonicalTimestamp(observedAt, 'institutional-memory-observed-at-invalid'),
  };
}

function identityCore(value) {
  return {
    memoryClass: value.memoryClass,
    subject: value.subject,
    statement: value.statement,
    provenance: value.provenance,
    confidence: value.confidence,
    freshness: value.freshness,
    objectiveIds: [...value.objectiveIds],
    evidenceRefs: [...value.evidenceRefs],
    capability: value.capability,
    supersedes: [...value.supersedes],
  };
}

function normalizeClasses(value) {
  if (!Array.isArray(value) || value.length > MEMORY_CLASSES.size || new Set(value).size !== value.length) fail('institutional-memory-query-invalid');
  for (const item of value) if (!MEMORY_CLASSES.has(item)) fail('institutional-memory-class-invalid');
  return [...value].sort();
}

function normalizeMemoryIds(value) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail('institutional-memory-supersedes-invalid');
  for (const item of value) if (typeof item !== 'string' || !/^mem-[a-f0-9]{32}$/.test(item)) fail('institutional-memory-supersedes-invalid');
  return [...value].sort();
}

function normalizeSlugs(value, maximumItems, maximumLength, code) {
  if (!Array.isArray(value) || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, maximumLength, code)).sort();
}

function normalizeTextList(value, maximumItems, maximumLength, code) {
  if (!Array.isArray(value) || value.length > maximumItems || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedText(item, maximumLength, code)).sort();
}

function assertAcyclic(records) {
  const graph = new Map(records.map((record) => [record.memoryId, record.supersedes]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) fail('institutional-memory-supersession-cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const target of graph.get(id) ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

function checkedSlug(value, maximumLength, code) {
  if (typeof value !== 'string' || value.length > maximumLength || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value)) fail(code);
  return value;
}

function checkedText(value, maximumLength, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximumLength || /\0/.test(value)) fail(code);
  return normalized;
}

function canonicalTimestamp(value, code) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) fail(code);
  return text;
}

function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

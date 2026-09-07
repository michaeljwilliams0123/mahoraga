const COLLECTIONS = Object.freeze([
  'roles',
  'responsibilities',
  'obligations',
  'recurringObligations',
  'stakeholders',
  'workProducts',
  'systems',
  'decisionPatterns',
  'successStates',
  'riskIndicators',
  'opportunityIndicators',
  'escalationPreferences',
]);

const KEYS = new Set(['schemaVersion', 'twinId', 'ownerId', ...COLLECTIONS, 'createdAt', 'updatedAt']);
const ITEM_KEYS = new Set(['id', 'summary', 'source', 'confidence', 'state']);
const SOURCES = new Set(['owner-explicit', 'connected-evidence', 'entity-inference']);
const STATES = new Set(['active', 'inactive', 'completed', 'retired']);
const SOURCE_RANK = Object.freeze({ 'entity-inference': 1, 'connected-evidence': 2, 'owner-explicit': 3 });

export function createWorkforceTwin(input, { now = () => new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof now !== 'function') fail('workforce-twin-invalid');
  const timestamp = canonicalTimestamp(now());
  const value = {
    schemaVersion: 1,
    twinId: checkedId(input.twinId),
    ownerId: checkedId(input.ownerId),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  for (const key of COLLECTIONS) value[key] = normalizeCollection(input[key] ?? []);
  return validateWorkforceTwin(value);
}

export function validateWorkforceTwin(value) {
  exactObject(value, KEYS);
  if (value.schemaVersion !== 1) fail('workforce-twin-invalid');
  const createdAt = canonicalTimestamp(value.createdAt);
  const updatedAt = canonicalTimestamp(value.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail('workforce-twin-invalid');
  const normalized = {
    schemaVersion: 1,
    twinId: checkedId(value.twinId),
    ownerId: checkedId(value.ownerId),
    createdAt,
    updatedAt,
  };
  for (const key of COLLECTIONS) normalized[key] = normalizeCollection(value[key]);
  return deepFreeze(normalized);
}

export function mergeWorkforceTwin(baseInput, patch, { now = () => new Date() } = {}) {
  const base = validateWorkforceTwin(baseInput);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || typeof now !== 'function') fail('workforce-twin-patch-invalid');
  const patchKeys = Object.keys(patch);
  if (patchKeys.some((key) => !COLLECTIONS.includes(key))) fail('workforce-twin-patch-invalid');
  const merged = structuredClone(base);
  for (const key of patchKeys) {
    const incoming = normalizeCollection(patch[key]);
    const byId = new Map(merged[key].map((item) => [item.id, item]));
    for (const next of incoming) {
      const current = byId.get(next.id);
      if (!current || SOURCE_RANK[next.source] >= SOURCE_RANK[current.source]) byId.set(next.id, next);
    }
    merged[key] = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  merged.updatedAt = canonicalTimestamp(now());
  return validateWorkforceTwin(merged);
}

function normalizeCollection(value) {
  if (!Array.isArray(value) || value.length > 512) fail('workforce-twin-invalid');
  const seen = new Set();
  const records = value.map((item) => {
    exactObject(item, ITEM_KEYS);
    const id = checkedId(item.id);
    if (seen.has(id)) fail('workforce-twin-invalid');
    seen.add(id);
    if (!SOURCES.has(item.source) || !STATES.has(item.state)) fail('workforce-twin-invalid');
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) fail('workforce-twin-invalid');
    return {
      id,
      summary: checkedText(item.summary, 1000),
      source: item.source,
      confidence: item.confidence,
      state: item.state,
    };
  });
  return deepFreeze(records.sort((a, b) => a.id.localeCompare(b.id)));
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('workforce-twin-invalid');
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail('workforce-twin-invalid');
}

function checkedId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail('workforce-twin-invalid');
  return value;
}

function checkedText(value, maximum) {
  if (typeof value !== 'string') fail('workforce-twin-invalid');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\0]/.test(value)) fail('workforce-twin-invalid');
  return normalized;
}

function canonicalTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('workforce-twin-invalid');
  const timestamp = date.toISOString();
  if (typeof value === 'string' && value !== timestamp) fail('workforce-twin-invalid');
  return timestamp;
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

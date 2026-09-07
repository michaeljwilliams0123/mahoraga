import { createHash } from 'node:crypto';

const ORIGINS = new Set([
  'owner-command',
  'workforce-obligation',
  'world-state-delta',
  'unresolved-work',
  'failure',
  'capability-gap',
  'research-discovery',
  'improvement-opportunity',
  'system-health',
  'child-agent-finding',
  'historical-pattern',
  'entity-evolution',
]);

const STATES = new Set(['candidate', 'active', 'deferred', 'completed', 'retired']);
const TERMINAL = new Set(['completed', 'retired']);
const KEYS = new Set([
  'schemaVersion',
  'objectiveId',
  'title',
  'origin',
  'missionAlignment',
  'impact',
  'urgency',
  'confidence',
  'dependencyReadiness',
  'reversibility',
  'costEfficiency',
  'capabilityReadiness',
  'evidenceQuality',
  'state',
  'fingerprint',
  'createdAt',
  'updatedAt',
]);

const SCORE_FIELDS = Object.freeze({
  missionAlignment: 20,
  impact: 20,
  urgency: 15,
  confidence: 10,
  dependencyReadiness: 5,
  reversibility: 5,
  costEfficiency: 10,
  capabilityReadiness: 10,
  evidenceQuality: 5,
});

export function createObjectiveCandidate(input, { now = () => new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof now !== 'function') fail('objective-candidate-invalid');
  const title = checkedText(input.title, 240);
  const origin = checkedOrigin(input.origin);
  const timestamp = canonicalTimestamp(now());
  const fingerprint = input.fingerprint == null ? digest(`${origin}\n${title.toLowerCase()}`) : checkedFingerprint(input.fingerprint);
  const value = {
    schemaVersion: 1,
    objectiveId: checkedId(input.objectiveId),
    title,
    origin,
    state: checkedState(input.state ?? 'candidate'),
    fingerprint,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  for (const field of Object.keys(SCORE_FIELDS)) value[field] = checkedScore(input[field]);
  return validateObjectiveCandidate(value);
}

export function validateObjectiveCandidate(value) {
  exactObject(value, KEYS);
  if (value.schemaVersion !== 1) fail('objective-candidate-invalid');
  const normalized = {
    schemaVersion: 1,
    objectiveId: checkedId(value.objectiveId),
    title: checkedText(value.title, 240),
    origin: checkedOrigin(value.origin),
    state: checkedState(value.state),
    fingerprint: checkedFingerprint(value.fingerprint),
    createdAt: canonicalTimestamp(value.createdAt),
    updatedAt: canonicalTimestamp(value.updatedAt),
  };
  if (Date.parse(normalized.updatedAt) < Date.parse(normalized.createdAt)) fail('objective-candidate-invalid');
  for (const field of Object.keys(SCORE_FIELDS)) normalized[field] = checkedScore(value[field]);
  return deepFreeze(normalized);
}

export function scoreObjective(value) {
  const objective = validateObjectiveCandidate(value);
  let weighted = 0;
  for (const [field, weight] of Object.entries(SCORE_FIELDS)) weighted += objective[field] * weight;
  return Math.round(weighted / 100);
}

export function reconcileObjectiveEconomy(candidates = [], existing = []) {
  if (!Array.isArray(candidates) || !Array.isArray(existing) || candidates.length > 4096 || existing.length > 4096) fail('objective-economy-invalid');
  const byFingerprint = new Map();
  for (const value of existing) {
    const objective = validateObjectiveCandidate(value);
    const current = byFingerprint.get(objective.fingerprint);
    byFingerprint.set(objective.fingerprint, current ? chooseEquivalent(current, objective, true) : objective);
  }
  for (const value of candidates) {
    const objective = validateObjectiveCandidate(value);
    const current = byFingerprint.get(objective.fingerprint);
    byFingerprint.set(objective.fingerprint, current ? chooseEquivalent(current, objective, false) : objective);
  }
  const result = [...byFingerprint.values()].sort((left, right) => {
    const scoreDelta = scoreObjective(right) - scoreObjective(left);
    return scoreDelta || left.objectiveId.localeCompare(right.objectiveId);
  });
  return deepFreeze(result);
}

function chooseEquivalent(current, incoming, bothExisting) {
  if (TERMINAL.has(current.state)) return current;
  if (TERMINAL.has(incoming.state) && bothExisting) return stronger(current, incoming);
  if (current.state === 'deferred') {
    const materiallyImproved = incoming.dependencyReadiness > current.dependencyReadiness || incoming.urgency > current.urgency;
    return materiallyImproved ? incoming : current;
  }
  if (incoming.state === 'deferred' && current.state !== 'deferred') return current;
  return stronger(current, incoming);
}

function stronger(left, right) {
  const leftScore = scoreObjective(left);
  const rightScore = scoreObjective(right);
  if (rightScore > leftScore) return right;
  if (rightScore < leftScore) return left;
  if (Date.parse(right.updatedAt) > Date.parse(left.updatedAt)) return right;
  if (Date.parse(right.updatedAt) < Date.parse(left.updatedAt)) return left;
  return left.objectiveId.localeCompare(right.objectiveId) <= 0 ? left : right;
}

function checkedScore(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) fail('objective-candidate-invalid');
  return value;
}

function checkedId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail('objective-candidate-invalid');
  return value;
}

function checkedText(value, maximum) {
  if (typeof value !== 'string') fail('objective-candidate-invalid');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 1 || normalized.length > maximum || /[\0]/.test(value)) fail('objective-candidate-invalid');
  return normalized;
}

function checkedOrigin(value) {
  if (!ORIGINS.has(value)) fail('objective-candidate-invalid');
  return value;
}

function checkedState(value) {
  if (!STATES.has(value)) fail('objective-candidate-invalid');
  return value;
}

function checkedFingerprint(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('objective-candidate-invalid');
  return value;
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('objective-candidate-invalid');
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail('objective-candidate-invalid');
}

function canonicalTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('objective-candidate-invalid');
  const timestamp = date.toISOString();
  if (typeof value === 'string' && value !== timestamp) fail('objective-candidate-invalid');
  return timestamp;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
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

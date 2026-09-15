import { createHash } from 'node:crypto';
import { validateEntityConstitution } from './entity-constitution.mjs';
import { validateObjectiveCandidate } from './objective-economy.mjs';
import { validateWorkforceTwin } from './workforce-twin.mjs';

export const ENTITY_HEARTBEAT_SCHEMA_VERSION = 1;

const INPUT_KEYS = new Set([
  'observedAt', 'worldDigest', 'previousReceipt', 'constitution', 'workforceTwin',
  'objectives', 'dispatchIds', 'research', 'capabilityGaps', 'learning', 'memory',
  'evolutionEvaluations',
]);
const RECEIPT_KEYS = new Set([
  'schemaVersion', 'kind', 'observedAt', 'worldDigest', 'previousWorldDigest', 'materialDelta',
  'missionDigest', 'responsibilityDigest', 'responsibilityCount', 'obligationCount',
  'objectiveDigest', 'objectiveCount', 'dispatchDigest', 'dispatchCount',
  'researchDigest', 'researchCount', 'capabilityGapDigest', 'capabilityGapCount',
  'learningDigest', 'memoryFingerprint', 'activeMemoryCount', 'evolutionDigest',
  'evolutionExperimentCount', 'evolutionGraduationReadyCount', 'zeroCredit',
  'providerRequired', 'creditCost', 'paidFallback', 'fingerprint',
]);

export function createEntityHeartbeatReceipt(input) {
  exact(input, INPUT_KEYS, 'entity-heartbeat-invalid');
  const observedAt = timestamp(input.observedAt, 'entity-heartbeat-clock-invalid');
  const worldDigest = sha256(input.worldDigest, 'entity-heartbeat-world-invalid');
  const previous = input.previousReceipt == null ? null : validateEntityHeartbeatReceipt(input.previousReceipt);
  const constitution = input.constitution == null ? null : validateEntityConstitution(input.constitution);
  const workforceTwin = input.workforceTwin == null ? null : validateWorkforceTwin(input.workforceTwin);
  const objectives = objectiveProjection(input.objectives);
  const dispatchIds = identifiers(input.dispatchIds, 4_096, 'entity-heartbeat-dispatch-invalid');
  const research = researchProjection(input.research);
  const gaps = gapProjection(input.capabilityGaps);
  const learningDigest = boundedDigest(input.learning, 128 * 1024, 'entity-heartbeat-learning-invalid');
  const memory = memoryProjection(input.memory);
  const evolution = evolutionProjection(input.evolutionEvaluations);
  const core = {
    schemaVersion: ENTITY_HEARTBEAT_SCHEMA_VERSION,
    kind: 'entity-heartbeat-receipt',
    observedAt,
    worldDigest,
    previousWorldDigest: previous?.worldDigest ?? null,
    materialDelta: previous == null || previous.worldDigest !== worldDigest,
    missionDigest: constitution == null ? null : digest(constitution),
    responsibilityDigest: workforceTwin == null ? null : digest(workforceTwin),
    responsibilityCount: workforceTwin?.responsibilities?.length ?? 0,
    obligationCount: (workforceTwin?.obligations?.length ?? 0) + (workforceTwin?.recurringObligations?.length ?? 0),
    objectiveDigest: digest(objectives),
    objectiveCount: objectives.length,
    dispatchDigest: digest(dispatchIds),
    dispatchCount: dispatchIds.length,
    researchDigest: digest(research.items),
    researchCount: research.count,
    capabilityGapDigest: digest(gaps),
    capabilityGapCount: gaps.length,
    learningDigest,
    memoryFingerprint: memory.fingerprint,
    activeMemoryCount: memory.activeMemoryCount,
    evolutionDigest: digest(evolution.items),
    evolutionExperimentCount: evolution.items.length,
    evolutionGraduationReadyCount: evolution.graduationReadyCount,
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

export function validateEntityHeartbeatReceipt(value) {
  exact(value, RECEIPT_KEYS, 'entity-heartbeat-invalid');
  const core = receiptCore(value);
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) {
    fail('entity-heartbeat-fingerprint-invalid');
  }
  const expected = digest(core);
  if (value.fingerprint !== expected) fail('entity-heartbeat-fingerprint-invalid');
  return deepFreeze({ ...core, fingerprint: expected });
}
function receiptCore(value) {
  if (value.schemaVersion !== ENTITY_HEARTBEAT_SCHEMA_VERSION || value.kind !== 'entity-heartbeat-receipt') {
    fail('entity-heartbeat-invalid');
  }
  if (value.zeroCredit !== true || value.providerRequired !== false || value.creditCost !== 0 || value.paidFallback !== false) {
    fail('entity-heartbeat-paid-contamination');
  }
  const worldDigest = sha256(value.worldDigest, 'entity-heartbeat-world-invalid');
  const previousWorldDigest = nullableSha256(value.previousWorldDigest, 'entity-heartbeat-world-invalid');
  const expectedDelta = previousWorldDigest == null || previousWorldDigest !== worldDigest;
  if (value.materialDelta !== expectedDelta) fail('entity-heartbeat-delta-invalid');
  return {
    schemaVersion: ENTITY_HEARTBEAT_SCHEMA_VERSION,
    kind: 'entity-heartbeat-receipt',
    observedAt: timestamp(value.observedAt, 'entity-heartbeat-clock-invalid'),
    worldDigest,
    previousWorldDigest,
    materialDelta: expectedDelta,
    missionDigest: nullableSha256(value.missionDigest, 'entity-heartbeat-mission-invalid'),
    responsibilityDigest: nullableSha256(value.responsibilityDigest, 'entity-heartbeat-responsibility-invalid'),
    responsibilityCount: count(value.responsibilityCount, 'entity-heartbeat-responsibility-invalid'),
    obligationCount: count(value.obligationCount, 'entity-heartbeat-responsibility-invalid'),
    objectiveDigest: sha256(value.objectiveDigest, 'entity-heartbeat-objective-invalid'),
    objectiveCount: count(value.objectiveCount, 'entity-heartbeat-objective-invalid'),
    dispatchDigest: sha256(value.dispatchDigest, 'entity-heartbeat-dispatch-invalid'),
    dispatchCount: count(value.dispatchCount, 'entity-heartbeat-dispatch-invalid'),
    researchDigest: sha256(value.researchDigest, 'entity-heartbeat-research-invalid'),
    researchCount: count(value.researchCount, 'entity-heartbeat-research-invalid'),
    capabilityGapDigest: sha256(value.capabilityGapDigest, 'entity-heartbeat-gap-invalid'),
    capabilityGapCount: count(value.capabilityGapCount, 'entity-heartbeat-gap-invalid'),
    learningDigest: sha256(value.learningDigest, 'entity-heartbeat-learning-invalid'),
    memoryFingerprint: sha256(value.memoryFingerprint, 'entity-heartbeat-memory-invalid'),
    activeMemoryCount: count(value.activeMemoryCount, 'entity-heartbeat-memory-invalid'),
    evolutionDigest: sha256(value.evolutionDigest, 'entity-heartbeat-evolution-invalid'),
    evolutionExperimentCount: count(value.evolutionExperimentCount, 'entity-heartbeat-evolution-invalid'),
    evolutionGraduationReadyCount: count(value.evolutionGraduationReadyCount, 'entity-heartbeat-evolution-invalid'),
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  };
}
function objectiveProjection(values) {
  if (!Array.isArray(values) || values.length > 4_096) fail('entity-heartbeat-objective-invalid');
  const projected = values.map((value) => {
    const objective = validateObjectiveCandidate(value);
    return { objectiveId: objective.objectiveId, state: objective.state, fingerprint: objective.fingerprint };
  }).sort((a, b) => a.objectiveId.localeCompare(b.objectiveId));
  if (new Set(projected.map((item) => item.objectiveId)).size !== projected.length) fail('entity-heartbeat-objective-invalid');
  return projected;
}

function identifiers(values, maximum, code) {
  if (!Array.isArray(values) || values.length > maximum) fail(code);
  const normalized = values.map((value) => identifier(value, code)).sort();
  if (new Set(normalized).size !== normalized.length) fail(code);
  return normalized;
}

function researchProjection(value) {
  if (value == null) return { items: [], count: 0 };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('entity-heartbeat-research-invalid');
  if (value.zeroCredit !== true || value.providerRequired !== false || value.creditCost !== 0 || value.paidFallback !== false) {
    fail('entity-heartbeat-paid-contamination');
  }
  const evidenceIds = identifiers(value.evidenceIds ?? [], 4_096, 'entity-heartbeat-research-invalid');
  const newMemoryIds = identifiers(value.newMemoryIds ?? [], 4_096, 'entity-heartbeat-research-invalid');
  return {
    items: [...evidenceIds.map((id) => ({ kind: 'evidence', id })), ...newMemoryIds.map((id) => ({ kind: 'memory', id }))],
    count: evidenceIds.length,
  };
}

function gapProjection(values) {
  if (!Array.isArray(values) || values.length > 4_096) fail('entity-heartbeat-gap-invalid');
  const projected = values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('entity-heartbeat-gap-invalid');
    return {
      id: identifier(value.id, 'entity-heartbeat-gap-invalid'),
      state: boundedString(value.state, 64, 'entity-heartbeat-gap-invalid'),
      priority: boundedString(value.priority, 32, 'entity-heartbeat-gap-invalid'),
      workloadClass: boundedString(value.workloadClass, 64, 'entity-heartbeat-gap-invalid'),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(projected.map((item) => item.id)).size !== projected.length) fail('entity-heartbeat-gap-invalid');
  return projected;
}
function memoryProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('entity-heartbeat-memory-invalid');
  if (value.zeroCredit !== true || value.providerRequired !== false) fail('entity-heartbeat-paid-contamination');
  const fingerprint = sha256(value.fingerprint, 'entity-heartbeat-memory-invalid');
  const activeMemoryIds = identifiers(value.activeMemoryIds ?? [], 20_000, 'entity-heartbeat-memory-invalid');
  return { fingerprint, activeMemoryCount: activeMemoryIds.length };
}

function evolutionProjection(values) {
  if (!Array.isArray(values) || values.length > 256) fail('entity-heartbeat-evolution-invalid');
  const items = values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('entity-heartbeat-evolution-invalid');
    if (value.kind !== 'evolution-experiment-evaluation' || value.zeroCredit !== true || value.providerRequired !== false || value.creditCost !== 0 || value.paidFallback !== false) {
      fail('entity-heartbeat-paid-contamination');
    }
    const decision = boundedString(value.decision, 32, 'entity-heartbeat-evolution-invalid');
    if (!['reject', 'hold', 'graduation-ready'].includes(decision)) fail('entity-heartbeat-evolution-invalid');
    if (typeof value.controllerEligible !== 'boolean' || value.controllerEligible !== (decision === 'graduation-ready')) {
      fail('entity-heartbeat-evolution-invalid');
    }
    return {
      experimentId: identifier(value.experimentId, 'entity-heartbeat-evolution-invalid'),
      objectiveId: identifier(value.objectiveId, 'entity-heartbeat-evolution-invalid'),
      decision,
      controllerEligible: value.controllerEligible,
      fingerprint: sha256(value.fingerprint, 'entity-heartbeat-evolution-invalid'),
    };
  }).sort((a, b) => a.experimentId.localeCompare(b.experimentId));
  if (new Set(items.map((item) => item.experimentId)).size !== items.length) fail('entity-heartbeat-evolution-invalid');
  return { items, graduationReadyCount: items.filter((item) => item.controllerEligible).length };
}

function boundedDigest(value, maximumBytes, code) {
  const serialized = stable(value);
  if (Buffer.byteLength(serialized, 'utf8') > maximumBytes) fail(code);
  return createHash('sha256').update(serialized).digest('hex');
}

function digest(value) {
  return createHash('sha256').update(stable(value)).digest('hex');
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function identifier(value, code) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)) fail(code);
  return value;
}

function boundedString(value, maximum, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}

function sha256(value, code) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function nullableSha256(value, code) {
  if (value == null) return null;
  return sha256(value, code);
}

function count(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) fail(code);
  return value;
}

function timestamp(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(code);
  const canonical = date.toISOString();
  if (typeof value === 'string' && value !== canonical) fail(code);
  return canonical;
}
function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
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
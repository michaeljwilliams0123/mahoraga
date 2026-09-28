import { createInstitutionalMemoryRecord } from './institutional-memory.mjs';

export function promoteVerifiedCognitiveLearning({ cycle, verification, observedAt = new Date().toISOString() } = {}) {
  assertCycle(cycle);
  assertVerification(verification);
  if (verification.sourceFingerprint !== cycle.fingerprint) fail('cognitive-learning-verification-mismatch');
  if (verification.verified !== true) return held('verification-required', cycle);
  if (cycle.storedLesson?.promotable !== true || cycle.decision === 'hold' || cycle.decisionGate !== 'admitted') return held('cycle-not-promotable', cycle);
  const evidenceRefs = [...new Set([...(cycle.evidenceRefs ?? []), ...verification.evidenceRefs])].sort();
  const record = createInstitutionalMemoryRecord({
    memoryClass: 'outcome',
    subject: `cognitive-${slug(cycle.decision)}`,
    statement: `Verified cognitive outcome: ${cycle.decision}.`,
    provenance: 'verified-outcome',
    confidence: cycle.metacognition.calibratedConfidence,
    freshness: 'current',
    objectiveIds: [],
    evidenceRefs,
    capability: 'cognitive-cycle',
    supersedes: [],
  }, { observedAt });
  return deepFreeze({ schemaVersion: 1, kind: 'cognitive-learning-promotion', promotable: true, reason: 'verified-admitted-outcome', sourceFingerprint: cycle.fingerprint, verificationEvidenceRefs: [...verification.evidenceRefs].sort(), record });
}

export function promoteVerifiedPredictionLearning({ outcome, verification, objectiveIds = [], observedAt = new Date().toISOString() } = {}) {
  const predictionOutcome = assertPredictionOutcome(outcome);
  assertVerification(verification, 'prediction-learning-verification-invalid');
  if (verification.sourceFingerprint !== predictionOutcome.fingerprint) fail('prediction-learning-verification-mismatch');
  if (verification.verified !== true) return heldPrediction('verification-required', predictionOutcome, verification);
  if (!Array.isArray(objectiveIds) || objectiveIds.length > 64) fail('prediction-learning-objectives-invalid');

  const memoryClass = predictionMemoryClass(predictionOutcome);
  const evidenceRefs = [...new Set([
    predictionOutcome.predictionReceiptFingerprint,
    predictionOutcome.fingerprint,
    ...verification.evidenceRefs,
  ])].sort();
  const statement = memoryClass === 'outcome'
    ? 'Verified prediction outcome met calibration thresholds.'
    : memoryClass === 'negative-memory'
      ? 'Verified prediction outcome exposed material calibration error.'
      : 'Verified prediction outcome established a calibration pattern.';
  const record = createInstitutionalMemoryRecord({
    memoryClass,
    subject: `prediction-${slug(predictionOutcome.actionId)}`,
    statement,
    provenance: 'verified-outcome',
    confidence: predictionOutcome.observedAccuracy,
    freshness: 'current',
    objectiveIds,
    evidenceRefs,
    capability: 'prediction-calibration',
    supersedes: [],
  }, { observedAt });
  return deepFreeze({
    schemaVersion: 1,
    kind: 'prediction-learning-promotion',
    promotable: true,
    reason: 'verified-prediction-outcome',
    sourceFingerprint: predictionOutcome.fingerprint,
    verificationEvidenceRefs: [...verification.evidenceRefs].sort(),
    record,
  });
}

function predictionMemoryClass(outcome) {
  if (outcome.observedAccuracy >= 0.8 && outcome.calibrationGap <= 0.2) return 'outcome';
  if (outcome.observedAccuracy < 0.5 || outcome.calibrationGap > 0.35) return 'negative-memory';
  return 'system-pattern';
}

function held(reason, cycle) { return deepFreeze({ schemaVersion: 1, kind: 'cognitive-learning-promotion', promotable: false, reason, sourceFingerprint: cycle.fingerprint, verificationEvidenceRefs: [], record: null }); }
function heldPrediction(reason, outcome, verification) { return deepFreeze({ schemaVersion: 1, kind: 'prediction-learning-promotion', promotable: false, reason, sourceFingerprint: outcome.fingerprint, verificationEvidenceRefs: [...verification.evidenceRefs].sort(), record: null }); }
function assertCycle(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'cognitive-loop-receipt' || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) fail('cognitive-learning-cycle-invalid');
}
function assertPredictionOutcome(value) {
  const code = 'prediction-learning-outcome-invalid';
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'prediction-outcome-receipt' || value.schemaVersion !== 1) fail(code);
  for (const key of ['fingerprint', 'predictionReceiptFingerprint', 'predictionFingerprint']) {
    if (typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key])) fail(code);
  }
  if (typeof value.actionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.actionId)) fail(code);
  for (const key of ['predictedConfidence', 'observedAccuracy', 'calibrationGap', 'normalizedMeanAbsoluteError']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1) fail(code);
  }
  canonicalTimestamp(value.predictedAt, code);
  canonicalTimestamp(value.observedAt, code);
  if (Date.parse(value.observedAt) < Date.parse(value.predictedAt)) fail(code);
  return value;
}
function assertVerification(value, code = 'cognitive-learning-verification-invalid') {
  if (!value || typeof value !== 'object' || typeof value.verified !== 'boolean' || typeof value.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 64 || new Set(value.evidenceRefs).size !== value.evidenceRefs.length || value.evidenceRefs.some((item) => typeof item !== 'string' || !item.trim() || item.length > 240)) fail(code);
}
function canonicalTimestamp(value, code) {
  if (typeof value !== 'string') fail(code);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail(code);
  return value;
}
function slug(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  if (!normalized) fail('cognitive-learning-decision-invalid');
  return normalized;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

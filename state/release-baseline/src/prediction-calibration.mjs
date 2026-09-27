import { createHash } from 'node:crypto';

export function createPredictionReceipt(prediction, { now = () => new Date() } = {}) {
  const value = validatePrediction(prediction);
  if (typeof now !== 'function') fail('prediction-receipt-invalid');
  const predictedAt = canonicalTimestamp(now());
  const core = {
    schemaVersion: 1,
    kind: 'prediction-receipt',
    predictionFingerprint: value.fingerprint,
    actionId: value.actionId,
    predictedState: value.predictedState,
    predictedUncertainty: value.predictedUncertainty,
    predictedAt,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

export function scorePredictionOutcome(receipt, observedState, { observedAt = () => new Date() } = {}) {
  const prediction = validateReceipt(receipt);
  const observed = normalizeObservedState(observedState, Object.keys(prediction.predictedState));
  if (typeof observedAt !== 'function') fail('prediction-outcome-invalid');
  const timestamp = canonicalTimestamp(observedAt());
  if (Date.parse(timestamp) < Date.parse(prediction.predictedAt)) fail('prediction-outcome-before-prediction');
  const fieldErrors = {};
  const fieldNormalizedErrors = {};
  let total = 0;
  let normalizedTotal = 0;
  for (const key of Object.keys(prediction.predictedState).sort()) {
    const absoluteError = Number(Math.abs(prediction.predictedState[key] - observed[key]).toFixed(12));
    const scale = Math.max(Math.abs(prediction.predictedState[key]), Math.abs(observed[key]), Number.EPSILON);
    const normalizedError = Number((absoluteError / scale).toFixed(12));
    fieldErrors[key] = absoluteError;
    fieldNormalizedErrors[key] = normalizedError;
    total += absoluteError;
    normalizedTotal += normalizedError;
  }
  const meanAbsoluteError = Number((total / Object.keys(fieldErrors).length).toFixed(12));
  const normalizedMeanAbsoluteError = Number((normalizedTotal / Object.keys(fieldNormalizedErrors).length).toFixed(12));
  const observedAccuracy = Number((1 - normalizedMeanAbsoluteError).toFixed(12));
  const predictedConfidence = Number((1 - prediction.predictedUncertainty).toFixed(12));
  const calibrationGap = Number(Math.abs(predictedConfidence - observedAccuracy).toFixed(12));
  const core = {
    schemaVersion: 1,
    kind: 'prediction-outcome-receipt',
    predictionReceiptFingerprint: prediction.fingerprint,
    predictionFingerprint: prediction.predictionFingerprint,
    actionId: prediction.actionId,
    predictedAt: prediction.predictedAt,
    observedAt: timestamp,
    predictedState: prediction.predictedState,
    observedState: observed,
    fieldAbsoluteErrors: deepFreeze(fieldErrors),
    meanAbsoluteError,
    fieldNormalizedErrors: deepFreeze(fieldNormalizedErrors),
    normalizedMeanAbsoluteError,
    predictedConfidence,
    observedAccuracy,
    calibrationGap,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

function validatePrediction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'counterfactual-transition') fail('prediction-receipt-invalid');
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) fail('prediction-receipt-invalid');
  if (typeof value.actionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.actionId)) fail('prediction-receipt-invalid');
  const predictedState = normalizeState(value.predictedState, 'prediction-receipt-invalid');
  const predictedUncertainty = score(value.predictedUncertainty, 'prediction-receipt-invalid');
  return { fingerprint: value.fingerprint, actionId: value.actionId, predictedState, predictedUncertainty };
}

function validateReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'prediction-receipt' || value.schemaVersion !== 1) fail('prediction-outcome-invalid');
  if (typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) fail('prediction-outcome-invalid');
  if (typeof value.predictionFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.predictionFingerprint)) fail('prediction-outcome-invalid');
  if (typeof value.actionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(value.actionId)) fail('prediction-outcome-invalid');
  return {
    ...value,
    predictedState: normalizeState(value.predictedState, 'prediction-outcome-invalid'),
    predictedUncertainty: score(value.predictedUncertainty, 'prediction-outcome-invalid'),
    predictedAt: canonicalTimestamp(value.predictedAt),
  };
}

function normalizeObservedState(value, expectedKeys) {
  const normalized = normalizeState(value, 'prediction-outcome-invalid');
  const actualKeys = Object.keys(normalized).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index])) fail('prediction-outcome-state-mismatch');
  return normalized;
}

function normalizeState(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length < 1 || entries.length > 64) fail(code);
  const result = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || typeof item !== 'number' || !Number.isFinite(item)) fail(code);
    result[key] = item;
  }
  return deepFreeze(result);
}
function score(value, code) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail(code); return value; }
function canonicalTimestamp(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) fail('prediction-time-invalid'); const timestamp = date.toISOString(); if (typeof value === 'string' && value !== timestamp) fail('prediction-time-invalid'); return timestamp; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

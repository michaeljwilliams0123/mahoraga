import { createHash } from 'node:crypto';
import { summarizePredictionCalibration } from './prediction-calibration.mjs';

export function backtestPredictionCalibration(cases, {
  splitAt,
  minimumSamples = 2,
  maximumSamples = 256,
} = {}) {
  if (!Array.isArray(cases) || cases.length < 2 || cases.length > 256) fail('prediction-backtest-invalid');
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1 || minimumSamples > 256) fail('prediction-backtest-invalid');
  if (!Number.isInteger(maximumSamples) || maximumSamples < 1 || maximumSamples > 256 || minimumSamples > maximumSamples) fail('prediction-backtest-invalid');

  const ordered = cases
    .map(validateCase)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.outcome.fingerprint.localeCompare(right.outcome.fingerprint));
  const fingerprints = ordered.map(({ outcome }) => outcome.fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) fail('prediction-backtest-duplicate-outcome');
  const split = splitAt ?? Math.floor(ordered.length / 2);
  if (!Number.isInteger(split) || split < minimumSamples || ordered.length - split < minimumSamples) fail('prediction-backtest-split-invalid');

  const train = ordered.slice(0, split);
  const heldOut = ordered.slice(split);
  if (train.at(-1).observedAt >= heldOut[0].observedAt) fail('prediction-backtest-leakage');

  const summaryOptions = { minimumSamples, maximumSamples };
  const trainSummary = summarizePredictionCalibration(train.map(({ outcome }) => outcome), summaryOptions);
  const heldOutSummary = summarizePredictionCalibration(heldOut.map(({ outcome }) => outcome), summaryOptions);
  const segmentIds = [...new Set(ordered.map(({ segment }) => segment))].sort();
  const segments = segmentIds.map((segment) => {
    const trainItems = train.filter((item) => item.segment === segment);
    const heldOutItems = heldOut.filter((item) => item.segment === segment);
    const trainSegmentSummary = trainItems.length >= minimumSamples
      ? summarizePredictionCalibration(trainItems.map(({ outcome }) => outcome), summaryOptions)
      : null;
    const heldOutSegmentSummary = heldOutItems.length >= minimumSamples
      ? summarizePredictionCalibration(heldOutItems.map(({ outcome }) => outcome), summaryOptions)
      : null;
    return deepFreeze({
      segment,
      trainSamples: trainItems.length,
      heldOutSamples: heldOutItems.length,
      trainSummary: trainSegmentSummary,
      heldOutSummary: heldOutSegmentSummary,
      evidenceSufficient: trainSegmentSummary !== null && heldOutSegmentSummary !== null,
    });
  });
  const core = {
    schemaVersion: 1,
    kind: 'prediction-calibration-backtest',
    splitAt: split,
    trainRange: deepFreeze({ from: train[0].observedAt, to: train.at(-1).observedAt }),
    heldOutRange: deepFreeze({ from: heldOut[0].observedAt, to: heldOut.at(-1).observedAt }),
    trainSummary,
    heldOutSummary,
    trustDelta: delta(heldOutSummary.plannerTrust, trainSummary.plannerTrust),
    calibrationGapDelta: delta(heldOutSummary.meanCalibrationGap, trainSummary.meanCalibrationGap),
    normalizedErrorDelta: delta(heldOutSummary.meanNormalizedError, trainSummary.meanNormalizedError),
    evidenceSufficient: trainSummary.evidenceSufficient && heldOutSummary.evidenceSufficient,
    segments: deepFreeze(segments),
    sourceFingerprints: deepFreeze(ordered.map(({ outcome }) => outcome.fingerprint)),
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

function validateCase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('prediction-backtest-invalid');
  if (typeof value.segment !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.segment)) fail('prediction-backtest-invalid');
  const outcome = value.outcome;
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome) || outcome.kind !== 'prediction-outcome-receipt' || outcome.schemaVersion !== 1) fail('prediction-backtest-invalid');
  if (typeof outcome.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(outcome.fingerprint)) fail('prediction-backtest-invalid');
  return { segment: value.segment, observedAt: canonicalTimestamp(outcome.observedAt), outcome };
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') fail('prediction-backtest-invalid');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail('prediction-backtest-invalid');
  return value;
}

function delta(later, earlier) {
  return Number((later - earlier).toFixed(12));
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

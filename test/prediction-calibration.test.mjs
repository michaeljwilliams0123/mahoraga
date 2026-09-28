import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateCounterfactual } from '../src/cognitive-world-model.mjs';
import { createPredictionReceipt, scorePredictionOutcome, summarizePredictionCalibration } from '../src/prediction-calibration.mjs';

const prediction = simulateCounterfactual({
  observedState: { failureRate: 0.2, queueDepth: 4 },
  stateUncertainty: 0.1,
  action: { actionId: 'recover-capacity', effects: { failureRate: -0.05, queueDepth: -2 }, uncertainty: 0.1 },
});

function calibrationOutcomes() {
  const receipt = createPredictionReceipt(prediction, { now: () => new Date('2026-09-27T20:00:00.000Z') });
  return [
    scorePredictionOutcome(receipt, { failureRate: 0.15, queueDepth: 2 }, { observedAt: () => new Date('2026-09-27T20:05:00.000Z') }),
    scorePredictionOutcome(receipt, { failureRate: 0.15, queueDepth: 4 }, { observedAt: () => new Date('2026-09-27T20:06:00.000Z') }),
    scorePredictionOutcome(receipt, { failureRate: 0.3, queueDepth: 2 }, { observedAt: () => new Date('2026-09-27T20:07:00.000Z') }),
  ];
}

test('prediction receipt is immutable and binds the counterfactual fingerprint', () => {
  const receipt = createPredictionReceipt(prediction, { now: () => new Date('2026-09-27T20:00:00.000Z') });
  assert.equal(receipt.predictionFingerprint, prediction.fingerprint);
  assert.equal(receipt.predictedUncertainty, 0.2);
  assert.deepEqual(receipt.predictedState, { failureRate: 0.15, queueDepth: 2 });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.predictedState), true);
});

test('later observation produces deterministic error and calibration receipt', () => {
  const receipt = createPredictionReceipt(prediction, { now: () => new Date('2026-09-27T20:00:00.000Z') });
  const options = { observedAt: () => new Date('2026-09-27T20:05:00.000Z') };
  const first = scorePredictionOutcome(receipt, { failureRate: 0.17, queueDepth: 3 }, options);
  const second = scorePredictionOutcome(receipt, { queueDepth: 3, failureRate: 0.17 }, options);
  assert.deepEqual(first, second);
  assert.deepEqual(first.fieldAbsoluteErrors, { failureRate: 0.02, queueDepth: 1 });
  assert.equal(first.meanAbsoluteError, 0.51);
  assert.deepEqual(first.fieldNormalizedErrors, { failureRate: 0.117647058824, queueDepth: 0.333333333333 });
  assert.equal(first.normalizedMeanAbsoluteError, 0.225490196079);
  assert.equal(first.predictedConfidence, 0.8);
  assert.equal(first.observedAccuracy, 0.774509803921);
  assert.equal(first.calibrationGap, 0.025490196079);
  assert.equal(Object.isFrozen(first), true);
});

test('outcome scoring fails closed on mismatched or temporally invalid observations', () => {
  const receipt = createPredictionReceipt(prediction, { now: () => new Date('2026-09-27T20:00:00.000Z') });
  assert.throws(() => scorePredictionOutcome(receipt, { queueDepth: 2 }, { observedAt: () => new Date('2026-09-27T20:05:00.000Z') }), /prediction-outcome-state-mismatch/);
  assert.throws(() => scorePredictionOutcome(receipt, { failureRate: 0.15, queueDepth: 2 }, { observedAt: () => new Date('2026-09-27T19:59:59.000Z') }), /prediction-outcome-before-prediction/);
});

test('calibration error is scale-normalized for equivalent relative misses', () => {
  const smallPrediction = simulateCounterfactual({
    observedState: { load: 2 },
    stateUncertainty: 0.1,
    action: { actionId: 'hold-small', effects: { load: 0 }, uncertainty: 0.1 },
  });
  const largePrediction = simulateCounterfactual({
    observedState: { load: 200 },
    stateUncertainty: 0.1,
    action: { actionId: 'hold-large', effects: { load: 0 }, uncertainty: 0.1 },
  });
  const now = { now: () => new Date('2026-09-27T20:00:00.000Z') };
  const observedAt = { observedAt: () => new Date('2026-09-27T20:05:00.000Z') };
  const small = scorePredictionOutcome(createPredictionReceipt(smallPrediction, now), { load: 2.2 }, observedAt);
  const large = scorePredictionOutcome(createPredictionReceipt(largePrediction, now), { load: 220 }, observedAt);

  assert.equal(small.normalizedMeanAbsoluteError, large.normalizedMeanAbsoluteError);
  assert.equal(small.normalizedMeanAbsoluteError, 0.090909090909);
  assert.equal(small.observedAccuracy, 0.909090909091);
  assert.equal(small.calibrationGap, 0.109090909091);
});

test('calibration summary is deterministic, bounded, and order-independent', () => {
  const outcomes = calibrationOutcomes();
  const first = summarizePredictionCalibration(outcomes);
  const second = summarizePredictionCalibration([...outcomes].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.kind, 'prediction-calibration-summary');
  assert.equal(first.sampleCount, 3);
  assert.equal(first.meanObservedAccuracy, 0.833333333333);
  assert.equal(first.meanPredictedConfidence, 0.8);
  assert.equal(first.meanCalibrationGap, 0.1);
  assert.equal(first.meanNormalizedError, 0.166666666667);
  assert.equal(first.plannerTrust, 0.75);
  assert.equal(first.evidenceSufficient, true);
  assert.deepEqual(first.sourceFingerprints, outcomes.map((item) => item.fingerprint).sort());
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.sourceFingerprints), true);
});

test('calibration summary rejects duplicate outcomes and invalid sample bounds', () => {
  const outcomes = calibrationOutcomes();

  assert.throws(() => summarizePredictionCalibration([outcomes[0], outcomes[0], outcomes[1]]), /prediction-calibration-duplicate-outcome/);
  assert.throws(() => summarizePredictionCalibration(outcomes, { maximumSamples: 2 }), /prediction-calibration-sample-limit/);
  assert.throws(() => summarizePredictionCalibration(outcomes, { minimumSamples: 0 }), /prediction-calibration-summary-invalid/);
  assert.throws(() => summarizePredictionCalibration(outcomes, { maximumSamples: 257 }), /prediction-calibration-summary-invalid/);
  assert.throws(() => summarizePredictionCalibration(outcomes, { minimumSamples: 4, maximumSamples: 3 }), /prediction-calibration-summary-invalid/);
});

test('calibration summary marks sparse evidence insufficient without discarding empirical trust', () => {
  const outcomes = calibrationOutcomes().slice(0, 2);
  const summary = summarizePredictionCalibration(outcomes, { minimumSamples: 3 });

  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.evidenceSufficient, false);
  assert.equal(summary.plannerTrust, 0.765625);
  assert.deepEqual(summary.sourceFingerprints, outcomes.map((item) => item.fingerprint).sort());
});

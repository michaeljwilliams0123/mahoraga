import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateCounterfactual } from '../src/cognitive-world-model.mjs';
import { createPredictionReceipt, scorePredictionOutcome, summarizePredictionCalibration } from '../src/prediction-calibration.mjs';

async function loadBacktest() {
  try {
    const module = await import('../src/prediction-backtest.mjs');
    return module.backtestPredictionCalibration;
  } catch (error) {
    assert.fail(`backtestPredictionCalibration missing: ${error?.code ?? error}`);
  }
}

const prediction = simulateCounterfactual({
  observedState: { load: 10 },
  stateUncertainty: 0.1,
  action: { actionId: 'hold-load', effects: { load: 0 }, uncertainty: 0.1 },
});
const sharedReceipt = createPredictionReceipt(prediction, {
  now: () => new Date('2026-09-28T00:00:00.000Z'),
});

function calibrationCase(minute, load, segment, receiptOverride = null) {
  const observedAt = `2026-09-28T00:${String(minute).padStart(2, '0')}:00.000Z`;
  const receipt = receiptOverride ?? createPredictionReceipt(prediction, { now: () => new Date(`2026-09-28T00:00:${String(minute).padStart(2, '0')}.000Z`) });
  return { segment, outcome: scorePredictionOutcome(receipt, { load }, { observedAt: () => new Date(observedAt) }) };
}

function calibrationCases() {
  return [
    calibrationCase(1, 10, 'api'),
    calibrationCase(2, 11, 'queue'),
    calibrationCase(3, 10.5, 'api'),
    calibrationCase(4, 12, 'queue'),
    calibrationCase(5, 10.2, 'api'),
    calibrationCase(6, 10.8, 'queue'),
    calibrationCase(7, 10.4, 'api'),
    calibrationCase(8, 11.2, 'queue'),
  ];
}

test('held-out calibration backtest is chronological, deterministic, and uses canonical summaries', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const cases = calibrationCases();
  const ordered = [...cases].sort((a, b) => a.outcome.observedAt.localeCompare(b.outcome.observedAt));
  const train = ordered.slice(0, 4);
  const heldOut = ordered.slice(4);
  const result = backtestPredictionCalibration([...cases].reverse(), { splitAt: 4, minimumSamples: 2 });
  const repeat = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });

  assert.deepEqual(result, repeat);
  assert.equal(result.kind, 'prediction-calibration-backtest');
  assert.equal(result.splitAt, 4);
  assert.deepEqual(result.trainRange, { from: train[0].outcome.observedAt, to: train.at(-1).outcome.observedAt });
  assert.deepEqual(result.heldOutRange, { from: heldOut[0].outcome.observedAt, to: heldOut.at(-1).outcome.observedAt });
  const trainSummary = summarizePredictionCalibration(train.map(({ outcome }) => outcome), { minimumSamples: 2 });
  const heldOutSummary = summarizePredictionCalibration(heldOut.map(({ outcome }) => outcome), { minimumSamples: 2 });
  assert.deepEqual(result.trainSummary, trainSummary);
  assert.deepEqual(result.heldOutSummary, heldOutSummary);
  assert.equal(result.trustDelta, Number((heldOutSummary.plannerTrust - trainSummary.plannerTrust).toFixed(12)));
  assert.equal(result.calibrationGapDelta, Number((heldOutSummary.meanCalibrationGap - trainSummary.meanCalibrationGap).toFixed(12)));
  assert.equal(result.normalizedErrorDelta, Number((heldOutSummary.meanNormalizedError - trainSummary.meanNormalizedError).toFixed(12)));
  assert.equal(result.evidenceSufficient, true);
  assert.deepEqual(result.sourceFingerprints, ordered.map(({ outcome }) => outcome.fingerprint));
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('held-out backtest reports segment evidence without promoting sparse segments', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const cases = calibrationCases();
  const result = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });

  assert.deepEqual(result.segments.map(({ segment, trainSamples, heldOutSamples, evidenceSufficient }) => ({
    segment, trainSamples, heldOutSamples, evidenceSufficient,
  })), [
    { segment: 'api', trainSamples: 2, heldOutSamples: 2, evidenceSufficient: true },
    { segment: 'queue', trainSamples: 2, heldOutSamples: 2, evidenceSufficient: true },
  ]);
  for (const segment of result.segments) {
    assert.equal(segment.trainSummary.sampleCount, 2);
    assert.equal(segment.heldOutSummary.sampleCount, 2);
  }

  const sparse = [...cases];
  sparse[7] = calibrationCase(8, 11.2, 'rare');
  const sparseResult = backtestPredictionCalibration(sparse, { splitAt: 4, minimumSamples: 2 });
  const rare = sparseResult.segments.find((segment) => segment.segment === 'rare');
  assert.deepEqual(rare, {
    segment: 'rare', trainSamples: 0, heldOutSamples: 1,
    trainSummary: null, heldOutSummary: null, regimeShiftDetected: false, evidenceSufficient: false,
  });
});

test('held-out backtest rejects duplicate outcomes before split summaries', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const cases = calibrationCases();
  cases[1] = { segment: 'queue', outcome: cases[0].outcome };
  assert.throws(
    () => backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 }),
    /prediction-backtest-duplicate-outcome/,
  );
});

test('held-out backtest fails closed when train and held-out timestamps overlap', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const first = calibrationCase(1, 10, 'api');
  const boundaryA = calibrationCase(2, 10.5, 'api');
  const boundaryB = calibrationCase(2, 11, 'queue');
  const last = calibrationCase(3, 11.5, 'queue');
  assert.throws(
    () => backtestPredictionCalibration([last, boundaryB, first, boundaryA], { splitAt: 2, minimumSamples: 2 }),
    /prediction-backtest-leakage/,
  );
});


test('held-out backtest rejects prediction lineage shared across train and held-out', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  assert.throws(
    () => backtestPredictionCalibration([
      calibrationCase(1,10,'api',sharedReceipt), calibrationCase(2,11,'queue',sharedReceipt), calibrationCase(3,10.5,'api',sharedReceipt), calibrationCase(4,12,'queue',sharedReceipt),
      calibrationCase(5,10.2,'api',sharedReceipt), calibrationCase(6,10.8,'queue',sharedReceipt), calibrationCase(7,10.4,'api',sharedReceipt), calibrationCase(8,11.2,'queue',sharedReceipt),
    ], { splitAt: 4, minimumSamples: 2 }),
    /prediction-backtest-lineage-leakage/,
  );
});

test('held-out backtest withholds global evidence when an observed segment lacks train and held-out support', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const cases = calibrationCases();
  cases[7] = calibrationCase(8, 11.2, 'rare');
  const result = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });
  assert.equal(result.evidenceSufficient, false);
});


test('held-out backtest detects a regime reversal and withholds applicability', async () => {
  const backtestPredictionCalibration = await loadBacktest();
  const cases = [
    calibrationCase(1, 10.0, 'api'),
    calibrationCase(2, 10.1, 'queue'),
    calibrationCase(3, 9.9, 'api'),
    calibrationCase(4, 10.0, 'queue'),
    calibrationCase(5, 0.0, 'api'),
    calibrationCase(6, 0.5, 'queue'),
    calibrationCase(7, 1.0, 'api'),
    calibrationCase(8, 0.0, 'queue'),
  ];
  const result = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });

  assert.equal(result.trainSummary.evidenceSufficient, true);
  assert.equal(result.heldOutSummary.evidenceSufficient, true);
  assert.equal(result.regimeShiftDetected, true);
  assert.equal(result.evidenceSufficient, false);
  assert.equal(result.segments.every((segment) => segment.regimeShiftDetected === true), true);
  assert.ok(result.trustDelta < 0);
  assert.ok(result.normalizedErrorDelta > 0);
  assert.ok(result.calibrationGapDelta > 0);
});

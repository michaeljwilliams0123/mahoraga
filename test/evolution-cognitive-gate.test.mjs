import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCognitiveRegressionGate } from '../src/evolution-laboratory.mjs';

test('cognitive evolution gate admits only improvements that preserve authority and collective properties', () => {
  const result = evaluateCognitiveRegressionGate({
    baseline: { diversity: 0.7, dissentRetention: 0.8, calibration: 0.75, transfer: 0.6 },
    candidate: { diversity: 0.76, dissentRetention: 0.86, calibration: 0.8, transfer: 0.72 },
    authorityPreserved: true,
    privateMemoryBoundaryPreserved: true,
  });
  assert.equal(result.decision, 'graduation-ready');
  assert.equal(result.regressions.length, 0);
});

test('authority or memory-boundary regression blocks cognitive graduation regardless of scores', () => {
  const result = evaluateCognitiveRegressionGate({
    baseline: { diversity: 0.7, dissentRetention: 0.8, calibration: 0.75, transfer: 0.6 },
    candidate: { diversity: 0.9, dissentRetention: 0.9, calibration: 0.9, transfer: 0.9 },
    authorityPreserved: false,
    privateMemoryBoundaryPreserved: true,
  });
  assert.equal(result.decision, 'reject');
  assert.equal(result.regressions.includes('authority-preservation'), true);
});
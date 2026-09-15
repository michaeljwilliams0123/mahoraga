import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvolutionExperiment,
  evaluateEvolutionExperiment,
  validateEvolutionExperiment,
} from '../src/evolution-laboratory.mjs';

const NOW = '2026-09-15T05:30:00.000Z';

function experiment(overrides = {}) {
  return createEvolutionExperiment({
    experimentId: 'exp-level8-closure',
    objectiveId: 'obj-level8-closure',
    hypothesis: 'A bounded entity heartbeat closes the Level 8 loop without creating a second control plane.',
    baselineMetric: 0.55,
    candidateMetric: 0.72,
    verification: 'contract-suite',
    isolated: true,
    ...overrides,
  }, { observedAt: NOW });
}

test('Evolution Laboratory creates a canonical zero-credit isolated experiment', () => {
  const value = experiment();
  assert.equal(value.kind, 'evolution-experiment');
  assert.equal(value.zeroCredit, true);
  assert.equal(value.providerRequired, false);
  assert.equal(value.isolated, true);
  assert.match(value.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateEvolutionExperiment(value), value);
});
test('Evolution Laboratory rejects fingerprint tampering and unsafe boundaries', () => {
  const value = experiment();
  assert.throws(() => validateEvolutionExperiment({ ...value, candidateMetric: 0.99 }), /evolution-fingerprint-invalid/);
  assert.throws(() => createEvolutionExperiment({
    experimentId: 'exp-not-isolated', objectiveId: 'obj-level8-closure', hypothesis: 'unsafe',
    baselineMetric: 0.5, candidateMetric: 0.7, verification: 'contract-suite', isolated: false,
  }, { observedAt: NOW }), /evolution-isolation-required/);
});

test('Evolution Laboratory records nonpositive deltas as negative results', () => {
  const value = experiment({ baselineMetric: 0.72, candidateMetric: 0.60 });
  const result = evaluateEvolutionExperiment(value, { verificationSatisfied: true });
  assert.equal(result.decision, 'reject');
  assert.equal(result.negativeResult, true);
  assert.equal(result.controllerEligible, false);
  assert.equal(result.creditCost, 0);
  assert.equal(result.paidFallback, false);
  assert.equal(Object.hasOwn(result, 'hypothesis'), false);
});

test('Evolution Laboratory holds positive experiments until verification is satisfied', () => {
  const result = evaluateEvolutionExperiment(experiment(), { verificationSatisfied: false });
  assert.equal(result.decision, 'hold');
  assert.equal(result.negativeResult, false);
  assert.equal(result.controllerEligible, false);
});
test('Evolution Laboratory marks only verified positive experiments graduation-ready', () => {
  const result = evaluateEvolutionExperiment(experiment(), { verificationSatisfied: true });
  assert.equal(result.decision, 'graduation-ready');
  assert.equal(result.negativeResult, false);
  assert.equal(result.controllerEligible, true);
  assert.equal(result.providerRequired, false);
  assert.equal(result.zeroCredit, true);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test('Evolution Laboratory rejects unknown verification and noncanonical timestamps', () => {
  assert.throws(() => experiment({ verification: 'trust-me' }), /evolution-verification-invalid/);
  assert.throws(() => createEvolutionExperiment({
    experimentId: 'exp-time', objectiveId: 'obj-level8-closure', hypothesis: 'time',
    baselineMetric: 0.5, candidateMetric: 0.7, verification: 'exact-head', isolated: true,
  }, { observedAt: '2026-09-15T05:30:00Z' }), /evolution-clock-invalid/);
});
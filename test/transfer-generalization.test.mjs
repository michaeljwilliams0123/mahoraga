import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransferGeneralization } from '../src/transfer-generalization.mjs';

test('transfer promotion requires improvement across at least two held-out domains', () => {
  const result = evaluateTransferGeneralization({
    sourceDomain: 'repository-repair',
    trials: [
      { domain: 'repository-repair', baseline: 0.88, candidate: 0.87, heldOut: false },
      { domain: 'deployment-diagnosis', baseline: 0.54, candidate: 0.71, heldOut: true },
      { domain: 'connector-recovery', baseline: 0.58, candidate: 0.72, heldOut: true },
    ],
    maximumSourceRegression: 0.03,
  });
  assert.equal(result.promotable, true);
  assert.deepEqual(result.improvedHeldOutDomains, ['connector-recovery', 'deployment-diagnosis']);
});

test('source-domain regression blocks transfer even when held-out tasks improve', () => {
  const result = evaluateTransferGeneralization({
    sourceDomain: 'repository-repair',
    trials: [
      { domain: 'repository-repair', baseline: 0.9, candidate: 0.7, heldOut: false },
      { domain: 'deployment-diagnosis', baseline: 0.5, candidate: 0.8, heldOut: true },
      { domain: 'connector-recovery', baseline: 0.5, candidate: 0.8, heldOut: true },
    ],
    maximumSourceRegression: 0.03,
  });
  assert.equal(result.promotable, false);
  assert.equal(result.reason, 'source-regression-exceeded');
});
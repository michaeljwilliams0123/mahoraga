import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/sovereign-evolution.mjs'); } catch {}

function epoch(overrides = {}) {
  return subject.createTrustEpoch({
    epochId: 'epoch-41',
    trustedCommit: 'a'.repeat(40),
    verifierFingerprint: 'b'.repeat(64),
    rollbackCheckpointId: 'checkpoint-41',
    policyGeneration: 41,
    ...overrides,
  }, { activatedAt: '2026-09-05T08:00:00.000Z' });
}

function receipt(overrides = {}) {
  return subject.createSovereignEvolutionReceipt({
    trustedEpoch: epoch(),
    candidateCommit: 'c'.repeat(40),
    candidateEpochId: 'epoch-42',
    validatorAgentId: 'mahoraga-validator',
    validatorPassed: true,
    deterministicVerificationPassed: true,
    rollbackCheckpointCreated: true,
    rollbackRehearsalPassed: true,
    canaryPassed: true,
    stateCompatibilityPassed: true,
    sovereigntyInvariantPassed: true,
    ...overrides,
  }, { evaluatedAt: '2026-09-05T08:30:00.000Z' });
}

test('trusted epoch N can attest exact-head candidate N+1 only with complete rollback and canary evidence', () => {
  assert.equal(typeof subject.createTrustEpoch, 'function');
  const value = receipt();
  assert.deepEqual(subject.validateSovereignEvolutionReceipt(value, { headSha: 'c'.repeat(40), trustedEpoch: epoch() }), { valid: true, reason: 'sovereign-valid' });
  assert.deepEqual(subject.validateSovereignEvolutionReceipt(value, { headSha: 'd'.repeat(40), trustedEpoch: epoch() }), { valid: false, reason: 'sovereign-head-mismatch' });
});

test('candidate cannot use itself as the incumbent trusted generation', () => {
  assert.throws(() => subject.createSovereignEvolutionReceipt({
    trustedEpoch: subject.createTrustEpoch({ epochId: 'epoch-42', trustedCommit: 'c'.repeat(40), verifierFingerprint: 'b'.repeat(64), rollbackCheckpointId: 'checkpoint-42', policyGeneration: 42 }),
    candidateCommit: 'c'.repeat(40), candidateEpochId: 'epoch-42', validatorAgentId: 'mahoraga-validator',
    validatorPassed: true, deterministicVerificationPassed: true, rollbackCheckpointCreated: true, rollbackRehearsalPassed: true, canaryPassed: true, stateCompatibilityPassed: true, sovereigntyInvariantPassed: true,
  }), /sovereign-candidate-epoch-invalid/);
});

test('sovereign receipt fails closed when any required proof is false', () => {
  for (const field of ['validatorPassed', 'deterministicVerificationPassed', 'rollbackCheckpointCreated', 'rollbackRehearsalPassed', 'canaryPassed', 'stateCompatibilityPassed', 'sovereigntyInvariantPassed']) {
    assert.throws(() => receipt({ [field]: false }), new RegExp(`sovereign-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-required`));
  }
});

test('full trusted epoch context must match the receipt incumbent epoch', () => {
  const value = receipt();
  const wrongVerifier = epoch({ verifierFingerprint: 'd'.repeat(64) });
  assert.deepEqual(subject.validateSovereignEvolutionReceipt(value, { headSha: 'c'.repeat(40), trustedEpoch: wrongVerifier }), { valid: false, reason: 'sovereign-trusted-epoch-mismatch' });
});

test('an epoch label alone cannot authorize sovereign evolution', () => {
  const value = receipt();
  assert.deepEqual(subject.validateSovereignEvolutionReceipt(value, { headSha: 'c'.repeat(40), trustedEpochId: 'epoch-41' }), { valid: false, reason: 'sovereign-trust-epoch-invalid' });
});

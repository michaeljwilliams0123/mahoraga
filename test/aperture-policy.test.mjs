import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/aperture-policy.mjs'); } catch {}

function request(overrides = {}) {
  return subject.createApertureRequest({
    objectiveId: 'objective-42',
    requestingAgentId: 'mahoraga-builder-specialist',
    capability: 'service-specialized',
    purpose: 'Expose a temporary local validation server.',
    target: 'worker-2:5173',
    expectedPeer: 'validator-1',
    protocol: 'tcp',
    ttlMs: 1_200_000,
    idleTtlMs: 180_000,
    novel: true,
    ...overrides,
  }, { requestedAt: '2026-09-05T08:00:00.000Z' });
}

test('a novel specialized aperture can be auto-authorized only by an independent validator', () => {
  assert.equal(typeof subject.createApertureRequest, 'function');
  const candidate = request();
  assert.throws(() => subject.issueApertureLease(candidate, {
    validatorAgentId: 'mahoraga-builder-specialist', approved: true, reason: 'self approved',
  }, { issuedAt: '2026-09-05T08:00:01.000Z' }), /aperture-validator-independent-required/);
  const lease = subject.issueApertureLease(candidate, {
    validatorAgentId: 'mahoraga-validator', approved: true, reason: 'bounded specialized purpose',
  }, { issuedAt: '2026-09-05T08:00:01.000Z' });
  assert.equal(lease.lateralRoutingAllowed, false);
  assert.equal(lease.ownerApprovalRequired, false);
  assert.equal(lease.state, 'leased');
});

test('a request must declare purpose target peer and bounded lifetime', () => {
  assert.throws(() => subject.createApertureRequest({
    objectiveId: 'objective-42', requestingAgentId: 'mahoraga-builder-specialist', capability: 'developer-preview', purpose: 'Preview candidate.', target: '', expectedPeer: 'validator-1', protocol: 'tcp', ttlMs: 60_000, idleTtlMs: 10_000, novel: false,
  }), /aperture-target-invalid/);
  assert.throws(() => request({ ttlMs: 0 }), /aperture-ttl-invalid/);
  assert.throws(() => request({ idleTtlMs: 1_300_000 }), /aperture-idle-ttl-invalid/);
});

test('objective completion and seal deterministically close the lease', () => {
  const candidate = request({ capability: 'developer-preview', novel: false, ttlMs: 60_000, idleTtlMs: 10_000 });
  const lease = subject.issueApertureLease(candidate, { validatorAgentId: 'mahoraga-validator', approved: true, reason: 'valid' }, { issuedAt: '2026-09-05T08:00:01.000Z' });
  assert.deepEqual(subject.shouldCloseAperture(lease, { objectiveComplete: true }, { now: '2026-09-05T08:00:02.000Z' }), { close: true, reason: 'objective-complete' });
  assert.deepEqual(subject.shouldCloseAperture(lease, { stewardSeal: true, objectiveComplete: true }, { now: '2026-09-05T08:00:02.000Z' }), { close: true, reason: 'steward-seal' });
});

test('lease expires even when the requesting worker wants to keep it open', () => {
  const candidate = request({ novel: false, ttlMs: 5_000, idleTtlMs: 4_000 });
  const lease = subject.issueApertureLease(candidate, { validatorAgentId: 'mahoraga-validator', approved: true, reason: 'valid' }, { issuedAt: '2026-09-05T08:00:01.000Z' });
  assert.deepEqual(subject.shouldCloseAperture(lease, { requesterWantsOpen: true, lastActivityAt: '2026-09-05T08:00:04.000Z' }, { now: '2026-09-05T08:00:07.000Z' }), { close: true, reason: 'lease-expired' });
});

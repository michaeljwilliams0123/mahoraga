import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/routine-library.mjs'); } catch {}

function demo(overrides = {}) {
  return {
    agentId: 'mahoraga-invoice-specialist',
    capability: 'invoice-collection',
    intent: 'Collect an invoice PDF and verify the account match.',
    parameters: [{ name: 'account-id', secret: false }, { name: 'session-token', secret: true }],
    surfaces: ['browser'],
    steps: [
      { action: 'open-account-record', evidence: ['account-visible'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
    successEvidence: ['invoice-file-present'],
    ...overrides,
  };
}

test('a semantic demonstration compiles without storing secret parameter values', () => {
  assert.equal(typeof subject.compileRoutineDemonstration, 'function');
  const routine = subject.compileRoutineDemonstration(demo(), { learnedAt: '2026-09-05T08:00:00.000Z' });
  assert.equal(routine.version, 1);
  assert.equal(routine.agentId, 'mahoraga-invoice-specialist');
  assert.deepEqual(routine.parameters.map((item) => item.name), ['account-id', 'session-token']);
  assert.equal(routine.parameters[1].secret, true);
  assert.equal(JSON.stringify(routine).includes('secret-value'), false);
  assert.equal(routine.corrections.length, 0);
});

test('a correction creates a new immutable version and does not mutate the prior routine', () => {
  const base = subject.compileRoutineDemonstration(demo({ parameters: [] }), { learnedAt: '2026-09-05T08:00:00.000Z' });
  const corrected = subject.correctRoutine(base, {
    reason: 'Verify account before download.',
    steps: [
      { action: 'verify-account-match', evidence: ['account-match'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
  }, { learnedAt: '2026-09-05T09:00:00.000Z' });
  assert.equal(base.version, 1);
  assert.equal(base.steps[0].action, 'open-account-record');
  assert.equal(corrected.version, 2);
  assert.equal(corrected.parentRoutineId, base.routineId);
  assert.equal(corrected.corrections.length, 1);
});

test('replay verification requires the routine declared success evidence', () => {
  const routine = subject.compileRoutineDemonstration(demo({ parameters: [] }), { learnedAt: '2026-09-05T08:00:00.000Z' });
  assert.deepEqual(subject.verifyRoutineReplay(routine, { evidence: ['account-visible'] }), { verified: false, reason: 'success-evidence-missing' });
  assert.deepEqual(subject.verifyRoutineReplay(routine, { evidence: ['invoice-file-present'] }), { verified: true, reason: 'verified' });
});

test('routine ranking prefers compatible successful evidence and penalizes failures', () => {
  const strong = subject.compileRoutineDemonstration(demo({ parameters: [] }), { learnedAt: '2026-09-05T08:00:00.000Z', confidence: 0.9, successes: 8, failures: 0 });
  const weak = subject.compileRoutineDemonstration(demo({ intent: 'Alternate invoice path.', parameters: [] }), { learnedAt: '2026-09-05T08:01:00.000Z', confidence: 0.9, successes: 8, failures: 4 });
  const ranked = subject.rankRoutines([weak, strong], { capability: 'invoice-collection', surface: 'browser' });
  assert.equal(ranked[0].routineId, strong.routineId);
});

test('demonstrations reject embedded secret values', () => {
  assert.throws(() => subject.compileRoutineDemonstration(demo({ parameters: [{ name: 'session-token', secret: true, value: 'secret-value' }] })), /routine-parameter-invalid/);
});

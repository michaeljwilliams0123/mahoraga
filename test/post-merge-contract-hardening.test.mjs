import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCoworkerState,
  createHandoffEnvelope,
  recordCoworkerOutcome,
  validateHandoffEnvelope,
} from '../src/coworker-fabric.mjs';
import {
  compileRoutineDemonstration,
  correctRoutine,
  validateRoutine,
  verifyRoutineReplay,
} from '../src/routine-library.mjs';
import {
  compoundCreditFreeLearning,
  runCreditFreeHeartbeat,
  validateHeartbeatReceipt,
} from '../src/autonomy-heartbeat.mjs';

const T0 = new Date('2026-09-05T08:00:00.000Z');
const T1 = new Date('2026-09-05T09:00:00.000Z');

function handoff() {
  return createHandoffEnvelope({
    fromAgentId: 'mahoraga-steward',
    toAgentId: 'mahoraga-browser-specialist',
    objectiveId: 'objective-42',
    capability: 'signed-browser-session',
    task: 'Verify the signed browser session.',
    inputs: ['artifact:session'],
    expectedOutputs: ['receipt:browser-verification'],
    urgency: 'normal',
    mayDelegate: true,
  }, { createdAt: '2026-09-05T08:01:00.000Z' });
}

function routine() {
  return compileRoutineDemonstration({
    agentId: 'mahoraga-invoice-specialist',
    capability: 'invoice-collection',
    intent: 'Collect an invoice PDF and verify the account match.',
    parameters: [],
    surfaces: ['browser'],
    steps: [
      { action: 'open-account-record', evidence: ['account-visible'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
    successEvidence: ['invoice-file-present'],
  }, { learnedAt: '2026-09-05T08:00:00.000Z' });
}

test('failed and blocked coworker outcomes never promote reusable feats', () => {
  const initial = createCoworkerState({ agentId: 'mahoraga-browser-specialist' }, { at: '2026-09-05T08:00:00.000Z' });
  const failed = recordCoworkerOutcome(initial, {
    outcome: 'failure', objectiveId: 'objective-42', reusableFeatIds: ['feat-aaaaaaaaaaaaaaaaaaaaaaaa'],
  }, { at: '2026-09-05T08:10:00.000Z' });
  const blocked = recordCoworkerOutcome(failed, {
    outcome: 'blocked', objectiveId: 'objective-43', reusableFeatIds: ['feat-bbbbbbbbbbbbbbbbbbbbbbbb'],
  }, { at: '2026-09-05T08:20:00.000Z' });
  assert.deepEqual(failed.reusableFeatIds, []);
  assert.deepEqual(blocked.reusableFeatIds, []);
});

test('handoff ids are content-bound and reject mutated envelopes', () => {
  const original = handoff();
  const mutated = structuredClone(original);
  mutated.task = 'Perform a different task under the old receipt id.';
  assert.throws(() => validateHandoffEnvelope(mutated), /coworker-handoff-id-invalid/);
});

test('routine ids are content-bound and reject mutated routines', () => {
  const original = routine();
  const mutated = structuredClone(original);
  mutated.intent = 'A different intent under the old routine id.';
  assert.throws(() => validateRoutine(mutated), /routine-id-invalid/);
});

test('routine corrections require evidence introduced by corrected steps', () => {
  const corrected = correctRoutine(routine(), {
    reason: 'Verify account before download.',
    steps: [
      { action: 'verify-account-match', evidence: ['account-match'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
  }, { learnedAt: '2026-09-05T09:00:00.000Z' });
  assert.equal(corrected.successEvidence.includes('account-match'), true);
  assert.deepEqual(verifyRoutineReplay(corrected, { evidence: ['invoice-file-present'] }), {
    verified: false,
    reason: 'success-evidence-missing',
  });
  assert.deepEqual(verifyRoutineReplay(corrected, { evidence: ['invoice-file-present', 'account-match'] }), {
    verified: true,
    reason: 'verified',
  });
});

test('heartbeat receipts require explicit paidFallback false and canonical timestamps', () => {
  const receipt = runCreditFreeHeartbeat({ now: T0 });
  const missingFallback = structuredClone(receipt);
  delete missingFallback.paidFallback;
  assert.throws(() => validateHeartbeatReceipt(missingFallback), /heartbeat-paid-contamination/);
  assert.throws(() => validateHeartbeatReceipt({ ...receipt, paidFallback: null }), /heartbeat-paid-contamination/);
  assert.throws(() => validateHeartbeatReceipt({ ...receipt, observedAt: '2026-09-05 08:00:00Z' }), /heartbeat-observed-at-invalid/);
});

test('compounded heartbeat learning uses actual chronology instead of input order', () => {
  const early = runCreditFreeHeartbeat({ now: T0 });
  const late = runCreditFreeHeartbeat({ now: T1 });
  const learning = compoundCreditFreeLearning([late, early]);
  assert.equal(learning.lastObservedAt, '2026-09-05T09:00:00.000Z');
  assert.equal(learning.lastHealthyAt, '2026-09-05T09:00:00.000Z');
});

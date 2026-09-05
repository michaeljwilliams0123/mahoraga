import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/coworker-fabric.mjs'); } catch {}

test('coworker state starts idle with durable scorecard and timestamps', () => {
  assert.equal(typeof subject.createCoworkerState, 'function');
  const state = subject.createCoworkerState({ agentId: 'mahoraga-browser-specialist' }, { at: '2026-09-05T08:00:00.000Z' });
  assert.equal(state.lifecycle, 'idle');
  assert.deepEqual(state.objectiveIds, []);
  assert.deepEqual(state.routineIds, []);
  assert.deepEqual(state.reusableFeatIds, []);
  assert.deepEqual(state.scorecard, { successes: 0, failures: 0, blocked: 0, handoffsReceived: 0 });
  assert.equal(state.lastHeartbeatAt, '2026-09-05T08:00:00.000Z');
});

test('handoffs are deterministic and idempotent in a coworker inbox', () => {
  const state = subject.createCoworkerState({ agentId: 'mahoraga-browser-specialist' }, { at: '2026-09-05T08:00:00.000Z' });
  const input = {
    fromAgentId: 'mahoraga-steward',
    toAgentId: 'mahoraga-browser-specialist',
    objectiveId: 'objective-42',
    capability: 'signed-browser-session',
    task: 'Verify the signed browser session.',
    inputs: ['artifact:session'],
    expectedOutputs: ['receipt:browser-verification'],
    urgency: 'normal',
    mayDelegate: true,
  };
  const one = subject.createHandoffEnvelope(input, { createdAt: '2026-09-05T08:01:00.000Z' });
  const two = subject.createHandoffEnvelope(input, { createdAt: '2026-09-05T08:01:00.000Z' });
  assert.equal(one.handoffId, two.handoffId);
  const once = subject.enqueueHandoff(state, one);
  const twice = subject.enqueueHandoff(once, two);
  assert.equal(once.inbox.length, 1);
  assert.equal(once.scorecard.handoffsReceived, 1);
  assert.deepEqual(twice, once);
});

test('coworker outcomes update scorecard without changing identity', () => {
  const state = subject.createCoworkerState({ agentId: 'mahoraga-browser-specialist' }, { at: '2026-09-05T08:00:00.000Z' });
  const next = subject.recordCoworkerOutcome(state, { outcome: 'success', objectiveId: 'objective-42', reusableFeatIds: ['feat-aaaaaaaaaaaaaaaaaaaaaaaa'] }, { at: '2026-09-05T08:30:00.000Z' });
  assert.equal(next.agentId, state.agentId);
  assert.equal(next.scorecard.successes, 1);
  assert.deepEqual(next.reusableFeatIds, ['feat-aaaaaaaaaaaaaaaaaaaaaaaa']);
  assert.equal(next.lastSuccessfulActivityAt, '2026-09-05T08:30:00.000Z');
});

test('handoffs cannot be delivered to the wrong coworker', () => {
  const state = subject.createCoworkerState({ agentId: 'mahoraga-browser-specialist' });
  const handoff = subject.createHandoffEnvelope({
    fromAgentId: 'mahoraga-steward', toAgentId: 'mahoraga-code-specialist', objectiveId: 'objective-42', capability: 'code-review', task: 'Review code.', inputs: [], expectedOutputs: ['receipt:review'], urgency: 'normal', mayDelegate: false,
  });
  assert.throws(() => subject.enqueueHandoff(state, handoff), /coworker-handoff-recipient-mismatch/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/agent-feat-ledger.mjs'); } catch {}

test('feat records are deterministic, zero-credit, and success is reusable only with evidence', () => {
  assert.equal(typeof subject.createAgentFeat, 'function');
  const success = subject.createAgentFeat({
    agentId: 'mahoraga-code-guardian',
    capability: 'regression-repair',
    outcome: 'success',
    summary: 'Fixed a bounded regression and verified the focused test.',
    evidence: ['test:test/regression.test.mjs', 'commit:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  }, { learnedAt: '2026-09-05T06:00:00.000Z' });
  assert.equal(success.zeroCredit, true);
  assert.equal(success.reusable, true);
  assert.match(success.featId, /^feat-[a-f0-9]{24}$/);

  const failure = subject.createAgentFeat({
    agentId: 'mahoraga-code-guardian',
    capability: 'regression-repair',
    outcome: 'failure',
    summary: 'Attempt failed verification; retain as negative learning.',
    evidence: ['test:test/regression.test.mjs'],
  }, { learnedAt: '2026-09-05T06:01:00.000Z' });
  assert.equal(failure.reusable, false);
});

test('feat ledger exposes every child outcome but only verified successes as reusable feats', () => {
  assert.equal(typeof subject.buildAgentFeatLedger, 'function');
  const success = subject.createAgentFeat({
    agentId: 'mahoraga-github-operator', capability: 'exact-head-pr', outcome: 'success', summary: 'Exact-head PR verified.', evidence: ['pr:111'],
  }, { learnedAt: '2026-09-05T06:00:00.000Z' });
  const blocked = subject.createAgentFeat({
    agentId: 'mahoraga-state-learner', capability: 'github-dispatch', outcome: 'blocked', summary: 'Credential binding absent.', evidence: ['event:ConnectorNotConnected'],
  }, { learnedAt: '2026-09-05T06:00:00.000Z' });
  let ledger;
  assert.doesNotThrow(() => { ledger = subject.buildAgentFeatLedger({ sourceFingerprint: 'a'.repeat(64), feats: [blocked, success, success] }); });
  assert.equal(ledger.sourceFingerprint, 'a'.repeat(64));
  assert.equal(Object.hasOwn(ledger, 'sourceHead'), false);
  assert.equal(ledger.feats.length, 2);
  assert.deepEqual(ledger.reusableFeatIds, [success.featId]);
  assert.deepEqual(Object.keys(ledger.byAgent), ['mahoraga-github-operator', 'mahoraga-state-learner']);
  assert.equal(ledger.byAgent['mahoraga-state-learner'][0].outcome, 'blocked');
});

test('feat creation rejects any non-zero-credit record', () => {
  assert.equal(typeof subject.validateAgentFeat, 'function');
  assert.throws(() => subject.validateAgentFeat({
    schemaVersion: 1,
    featId: 'feat-aaaaaaaaaaaaaaaaaaaaaaaa',
    agentId: 'mahoraga-code-guardian',
    capability: 'repair',
    outcome: 'success',
    summary: 'bad',
    evidence: ['test:x'],
    learnedAt: '2026-09-05T06:00:00.000Z',
    zeroCredit: false,
    reusable: true,
  }), /zero-credit/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/steward-learning-state.mjs'); } catch {}
const foundry = await import('../src/agent-foundry.mjs');
const feats = await import('../src/agent-feat-ledger.mjs');
const report = await import('../src/steward-foundry-report.mjs');

const child = foundry.createChildAgentManifest({
  agentId: 'mahoraga-code-guardian',
  parentAgentId: 'mahoraga-steward',
  role: 'code-guardian',
  mission: 'Review and repair code.',
  capabilities: ['regression-repair'],
  privileges: ['github-read', 'github-pr-write'],
}, { createdAt: '2026-09-05T06:00:00.000Z' });

const feat = feats.createAgentFeat({
  agentId: 'mahoraga-code-guardian',
  capability: 'regression-repair',
  outcome: 'success',
  summary: 'Verified a regression repair.',
  evidence: ['test:test/regression.test.mjs'],
}, { learnedAt: '2026-09-05T06:10:00.000Z' });

const gaps = [
  { id: 'signed-browser-session', state: 'unverified', priority: 'high', summary: 'Browser session needs proof.', dependency: 'Prove a signed session provider.' },
];

test('learning state gives the parent all child feats and deterministic foundry plans', () => {
  assert.equal(typeof subject.buildStewardLearningState, 'function');
  const state = subject.buildStewardLearningState({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat], gaps });
  assert.equal(state.zeroCredit, true);
  assert.equal(state.parentAccess.allChildFeats, true);
  assert.deepEqual(state.parentAccess.featIds, [feat.featId]);
  assert.equal(state.agentFactory.schemaVersion, 1);
  assert.equal(state.agentFactory.zeroCredit, true);
  assert.equal(state.agentFactory.plannedCount, 1);
  assert.equal(state.agentFactory.plans[0].gapId, 'signed-browser-session');
  assert.match(state.stateFingerprint, /^[a-f0-9]{64}$/);
  const normalized = report.normalizeStewardFoundryReport(state.agentFactory);
  assert.equal(normalized.nextAction, 'apply-foundry');
});

test('empty foundry plans still carry schemaVersion 1 so the two-hour scheduler can hold', () => {
  const state = subject.buildStewardLearningState({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat], gaps: [] });
  assert.equal(state.agentFactory.schemaVersion, 1);
  assert.equal(state.agentFactory.plannedCount, 0);
  assert.equal(report.normalizeStewardFoundryReport(state.agentFactory).nextAction, 'hold-planned');
});

test('learning fingerprint is stable across input ordering and changes only when meaningful state changes', () => {
  assert.equal(typeof subject.buildStewardLearningState, 'function');
  const one = subject.buildStewardLearningState({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat], gaps });
  const two = subject.buildStewardLearningState({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat], gaps: [...gaps].reverse() });
  assert.equal(one.stateFingerprint, two.stateFingerprint);
  const blocked = feats.createAgentFeat({
    agentId: 'mahoraga-code-guardian', capability: 'signed-browser-session', outcome: 'blocked', summary: 'Provider unavailable.', evidence: ['event:provider-unavailable'],
  }, { learnedAt: '2026-09-05T06:20:00.000Z' });
  const three = subject.buildStewardLearningState({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat, blocked], gaps });
  assert.notEqual(one.stateFingerprint, three.stateFingerprint);
});

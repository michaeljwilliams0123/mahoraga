import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvolutionExperiment, evaluateEvolutionExperiment } from '../src/evolution-laboratory.mjs';
import { createEntityHeartbeat } from '../src/entity-heartbeat.mjs';

const NOW = '2026-09-09T06:00:00.000Z';

test('Evolution Laboratory keeps experiments isolated until verified graduation', () => {
  const experiment = createEvolutionExperiment({
    experimentId: 'exp-routing-a',
    objectiveId: 'obj-routing',
    hypothesis: 'Deterministic route A improves completion quality.',
    baselineMetric: 0.72,
    candidateMetric: 0.86,
    verification: 'exact-head',
    isolated: true,
  }, { now: () => new Date(NOW) });
  assert.equal(experiment.state, 'evaluated');
  assert.equal(experiment.zeroCredit, true);
  assert.equal(experiment.providerRequired, false);
  assert.equal(evaluateEvolutionExperiment(experiment, { verified: false }).decision, 'hold');
  const graduated = evaluateEvolutionExperiment(experiment, { verified: true });
  assert.equal(graduated.decision, 'graduate');
  assert.equal(graduated.productionEligible, true);
});

test('Evolution Laboratory records negative results', () => {
  const experiment = createEvolutionExperiment({
    experimentId: 'exp-routing-b',
    objectiveId: 'obj-routing',
    hypothesis: 'Candidate B improves completion quality.',
    baselineMetric: 0.8,
    candidateMetric: 0.7,
    verification: 'contract-suite',
    isolated: true,
  }, { now: () => new Date(NOW) });
  const result = evaluateEvolutionExperiment(experiment, { verified: true });
  assert.equal(result.decision, 'reject');
  assert.equal(result.negativeResult, true);
  assert.equal(result.productionEligible, false);
});

test('Entity Heartbeat executes the mission loop in deterministic order', async () => {
  const calls = [];
  const heartbeat = createEntityHeartbeat({
    observe: async () => (calls.push('observe'), { head: 'abc', deltas: ['issue-opened'] }),
    updateResponsibilities: async ({ world }) => (calls.push('responsibilities'), { affected: world.deltas }),
    deriveObjectives: async () => (calls.push('derive'), [{ objectiveId: 'obj-a' }]),
    reconcileObjectives: async ({ candidates }) => (calls.push('reconcile'), candidates),
    dispatchRoutable: async ({ objectives }) => (calls.push('dispatch'), [{ objectiveId: objectives[0].objectiveId, state: 'dispatched' }]),
    identifyResearch: async () => (calls.push('research'), ['research-gap']),
    identifyCapabilityGaps: async () => (calls.push('gaps'), ['capability-gap']),
    learnFromOutcomes: async () => (calls.push('learn'), [{ memoryClass: 'outcome' }]),
    updateMemory: async ({ learned }) => (calls.push('memory'), { accepted: learned.length }),
  }, { now: () => new Date(NOW) });
  const receipt = await heartbeat.cycle({ entityId: 'mahoraga', missionId: 'level8-runtime' });
  assert.deepEqual(calls, ['observe','responsibilities','derive','reconcile','dispatch','research','gaps','learn','memory']);
  assert.equal(receipt.kind, 'entity-heartbeat-receipt');
  assert.equal(receipt.zeroCredit, true);
  assert.equal(receipt.providerRequired, false);
  assert.equal(receipt.objectiveCount, 1);
  assert.equal(receipt.dispatchCount, 1);
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/);
});

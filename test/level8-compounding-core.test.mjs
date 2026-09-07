import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentFeat } from '../src/agent-feat-ledger.mjs';
import { runGrowthCompoundingLoop } from '../src/growth-compounding-loop.mjs';

const NOW = '2026-09-07T06:55:00.000Z';

function gap(id, priority, workloadClass) {
  return {
    id,
    state: 'open',
    priority,
    workloadClass,
    summary: `Close ${id} capability gap.`,
    dependency: 'repository-main',
  };
}

test('compounding core turns verified feats and gaps into zero-credit durable growth state', () => {
  const feats = [
    createAgentFeat({
      agentId: 'mahoraga-repository-specialist',
      capability: 'repository-verify',
      outcome: 'success',
      summary: 'Verified a candidate at its exact head.',
      evidence: ['receipt-verify-1'],
    }, { learnedAt: '2026-09-07T06:53:00.000Z' }),
    createAgentFeat({
      agentId: 'mahoraga-repository-specialist',
      capability: 'repository-verify',
      outcome: 'success',
      summary: 'Repeated exact-head verification successfully.',
      evidence: ['receipt-verify-2'],
    }, { learnedAt: '2026-09-07T06:54:00.000Z' }),
  ];

  const input = {
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga',
    agents: [],
    feats,
    gaps: [
      gap('repository-verify', 'critical', 'engineering'),
      gap('artifact-analysis', 'high', 'analysis'),
    ],
    memoryRecords: [],
    existingObjectives: [],
    existingUnits: [],
    now: NOW,
  };

  const result = runGrowthCompoundingLoop(input);
  const replay = runGrowthCompoundingLoop(input);

  assert.equal(result.kind, 'level8-growth-compounding-loop');
  assert.equal(result.zeroCredit, true);
  assert.equal(result.providerRequired, false);
  assert.equal(result.creditCost, 0);
  assert.equal(result.paidFallback, false);
  assert.equal(result.objectives.length, 2);
  assert.equal(result.objectives[0].objectiveId, 'obj-repository-verify');
  assert.deepEqual(result.memory.records.map((record) => record.subject).sort(), ['artifact-analysis', 'repository-verify']);
  assert.ok(result.memory.records.every((record) => record.memoryClass === 'knowledge' && record.provenance === 'synthesized'));
  assert.equal(result.organization.singularAuthority, true);
  assert.equal(result.organization.plannedUnits.length, 2);
  assert.deepEqual(result.promotedCapabilities, ['repository-verify']);
  assert.equal(result.fingerprint, replay.fingerprint);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

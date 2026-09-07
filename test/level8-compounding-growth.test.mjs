import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInstitutionalMemoryRecord,
  reconcileInstitutionalMemory,
  queryInstitutionalMemory,
} from '../src/institutional-memory.mjs';
import {
  createOrganizationUnit,
  planOrganizationUnits,
  buildOrganizationalAgentGraph,
} from '../src/organizational-agent-graph.mjs';
import { runGrowthCompoundingLoop } from '../src/growth-compounding-loop.mjs';
import { buildStewardLearningState } from '../src/steward-learning-state.mjs';

const NOW = '2026-09-07T06:34:00.000Z';

function gap(id, priority = 'high', workloadClass = 'engineering') {
  return {
    id,
    state: 'open',
    priority,
    workloadClass,
    summary: `Close ${id} capability gap.`,
    dependency: 'repository-main',
  };
}

function feat({ capability, outcome = 'success', evidence = ['receipt-1'], learnedAt = NOW, suffix = 'a' }) {
  return {
    schemaVersion: 1,
    featId: `feat-${suffix.repeat(24)}`,
    agentId: 'mahoraga-repository-specialist',
    capability,
    outcome,
    summary: `Learned ${capability}.`,
    evidence,
    learnedAt,
    zeroCredit: true,
    reusable: outcome === 'success' && evidence.length > 0,
  };
}

test('institutional memory retains negative memory and preserves superseded history', () => {
  const failed = createInstitutionalMemoryRecord({
    memoryClass: 'negative-memory',
    subject: 'exact-head-verification',
    statement: 'Stale check evidence cannot prove a moved candidate head.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-repository-verify'],
    evidenceRefs: ['receipt-stale-head'],
    capability: 'repository-verify',
    supersedes: [],
  }, { observedAt: NOW });
  const procedure = createInstitutionalMemoryRecord({
    memoryClass: 'procedure',
    subject: 'exact-head-verification',
    statement: 'Re-read candidate SHA after checks and discard evidence if the head moved.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-repository-verify'],
    evidenceRefs: ['receipt-current-head'],
    capability: 'repository-verify',
    supersedes: [failed.memoryId],
  }, { observedAt: NOW });
  const ledger = reconcileInstitutionalMemory({ records: [failed], incoming: [procedure], now: NOW });
  assert.equal(ledger.records.length, 2);
  assert.deepEqual(ledger.supersededMemoryIds, [failed.memoryId]);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify' }).length, 1);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify', includeSuperseded: true }).length, 2);
  assert.equal(ledger.zeroCredit, true);
  assert.equal(ledger.providerRequired, false);
});

test('organizational graph creates only uncovered internal functions and shares feats', () => {
  const existingUnit = createOrganizationUnit({
    unitId: 'research-evidence',
    role: 'research-evidence',
    mission: 'Acquire and classify external evidence.',
    capabilities: ['research-evidence'],
    workloadClasses: ['research'],
    persistent: true,
  }, { createdAt: NOW });
  const gaps = [gap('research-evidence', 'high', 'research'), gap('artifact-analysis', 'high', 'analysis')];
  const plans = planOrganizationUnits({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga',
    existingAgents: [],
    existingUnits: [existingUnit],
    workloadGaps: gaps,
    createdAt: NOW,
  });
  assert.deepEqual(plans.map((plan) => plan.gapId), ['artifact-analysis']);
  const graph = buildOrganizationalAgentGraph({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga',
    existingAgents: [],
    units: [existingUnit],
    workloadGaps: gaps,
    featLedger: {
      schemaVersion: 1,
      sourceFingerprint: 'f'.repeat(64),
      feats: [feat({ capability: 'research-evidence', suffix: 'b' })],
      reusableFeatIds: [`feat-${'b'.repeat(24)}`],
      byAgent: {},
    },
    createdAt: NOW,
  });
  assert.equal(graph.singularAuthority, true);
  assert.equal(graph.zeroCredit, true);
  assert.deepEqual(graph.sharedFeatIds, [`feat-${'b'.repeat(24)}`]);
  assert.deepEqual(graph.plans.map((plan) => plan.gapId), ['artifact-analysis']);
});

test('growth loop turns gaps into ranked objectives, memory, organization, and promoted skills', () => {
  const feats = [
    feat({ capability: 'repository-verify', suffix: 'c' }),
    feat({ capability: 'repository-verify', evidence: ['receipt-2'], suffix: 'd' }),
    feat({ capability: 'artifact-analysis', suffix: 'e' }),
  ];
  const result = runGrowthCompoundingLoop({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga',
    agents: [],
    feats,
    gaps: [gap('repository-verify', 'critical'), gap('artifact-analysis', 'high', 'analysis')],
    memoryRecords: [],
    existingObjectives: [],
    existingUnits: [],
    now: NOW,
  });
  assert.equal(result.zeroCredit, true);
  assert.equal(result.providerRequired, false);
  assert.equal(result.objectives.length, 2);
  assert.equal(result.objectives[0].objectiveId, 'obj-repository-verify');
  assert.ok(result.memory.records.length >= 2);
  assert.deepEqual(result.promotedCapabilities, ['repository-verify']);
  assert.equal(result.organization.singularAuthority, true);
  assert.equal(result.organization.plans.length, 2);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test('steward learning state exposes compounding cognition instead of report-only learning', () => {
  const state = buildStewardLearningState({
    parentAgentId: 'mahoraga',
    agents: [],
    feats: [
      feat({ capability: 'repository-verify', suffix: '1' }),
      feat({ capability: 'repository-verify', evidence: ['receipt-2'], suffix: '2' }),
    ],
    gaps: [gap('repository-verify', 'critical')],
    memoryRecords: [],
    existingObjectives: [],
    existingUnits: [],
    now: NOW,
  });
  assert.equal(state.learningMode, 'deterministic-compounding-growth');
  assert.equal(state.compounding.zeroCredit, true);
  assert.deepEqual(state.compounding.promotedCapabilities, ['repository-verify']);
  assert.equal(state.compounding.objectives.length, 1);
  assert.ok(state.compounding.memory.records.length >= 1);
  assert.equal(state.compounding.organization.singularAuthority, true);
});

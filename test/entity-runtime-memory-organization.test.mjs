import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInstitutionalMemoryRecord,
  validateInstitutionalMemoryRecord,
  reconcileInstitutionalMemory,
  queryInstitutionalMemory,
} from '../src/institutional-memory.mjs';
import {
  createOrganizationUnit,
  validateOrganizationUnit,
  planOrganizationUnits,
  buildOrganizationalAgentGraph,
} from '../src/organizational-agent-graph.mjs';

const NOW = '2026-09-07T06:30:00.000Z';

test('negative memory is retained and linked to evidence without provider calls', () => {
  const failure = createInstitutionalMemoryRecord({
    memoryClass: 'negative-memory',
    subject: 'repository-verification',
    statement: 'Retrying stale exact-head evidence does not prove the current candidate.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-verify-stale'],
    capability: 'repository-verify',
    supersedes: [],
  }, { observedAt: NOW });

  const ledger = reconcileInstitutionalMemory({ records: [], incoming: [failure], now: NOW });
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].memoryClass, 'negative-memory');
  assert.equal(ledger.records[0].zeroCredit, true);
  assert.equal(ledger.records[0].providerRequired, false);
  assert.equal(Object.isFrozen(ledger.records[0]), true);
  assert.match(ledger.fingerprint, /^[a-f0-9]{64}$/);
});

test('validated procedure supersedes synthesized knowledge but history remains queryable', () => {
  const knowledge = createInstitutionalMemoryRecord({
    memoryClass: 'knowledge',
    subject: 'exact-head-verification',
    statement: 'Verify candidate head before integration.',
    provenance: 'synthesized',
    confidence: 0.9,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-a'],
    capability: 'repository-verify',
    supersedes: [],
  }, { observedAt: NOW });
  const procedure = createInstitutionalMemoryRecord({
    memoryClass: 'procedure',
    subject: 'exact-head-verification',
    statement: 'Read candidate SHA, run Ubuntu and Windows Verify for that SHA, discard stale evidence after any head change.',
    provenance: 'verified-outcome',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['receipt-b'],
    capability: 'repository-verify',
    supersedes: [knowledge.memoryId],
  }, { observedAt: NOW });
  const ledger = reconcileInstitutionalMemory({ records: [knowledge], incoming: [procedure], now: NOW });
  assert.equal(ledger.records.length, 2);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify' }).length, 1);
  assert.equal(queryInstitutionalMemory({ records: ledger.records, capability: 'repository-verify', includeSuperseded: true }).length, 2);
});

test('institutional memory validates schemas and rejects invalid supersession', () => {
  const record = createInstitutionalMemoryRecord({
    memoryClass: 'fact',
    subject: 'entity-runtime',
    statement: 'Mahoraga Level 8 uses one singular entity authority.',
    provenance: 'owner-explicit',
    confidence: 1,
    freshness: 'current',
    objectiveIds: ['obj-level8'],
    evidenceRefs: ['spec-level8'],
    capability: 'entity-runtime',
    supersedes: [],
  }, { observedAt: NOW });
  assert.deepEqual(validateInstitutionalMemoryRecord(record), record);
  assert.throws(() => createInstitutionalMemoryRecord({ ...record, memoryClass: 'unknown' }, { observedAt: NOW }), /institutional-memory-class-invalid/);
  assert.throws(() => createInstitutionalMemoryRecord({ ...record, confidence: 1.1 }, { observedAt: NOW }), /institutional-memory-confidence-invalid/);
  assert.throws(() => reconcileInstitutionalMemory({ records: [record], incoming: [{ ...record, memoryId: `mem-${'f'.repeat(32)}`, supersedes: [`mem-${'e'.repeat(32)}`] }], now: NOW }), /institutional-memory-supersession-target-missing/);
});

test('organization planner creates only uncovered workload functions', () => {
  const existingAgents = [];
  const existingUnits = [createOrganizationUnit({
    unitId: 'research-director',
    role: 'research-director',
    mission: 'Coordinate evidence acquisition for unresolved objectives.',
    capabilities: ['research-evidence'],
    workloadClasses: ['research'],
    persistent: true,
  }, { createdAt: NOW })];
  const plans = planOrganizationUnits({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga-core',
    existingAgents,
    existingUnits,
    workloadGaps: [
      { id: 'research-evidence', state: 'open', priority: 'high', workloadClass: 'research', summary: 'Need external evidence.', dependency: 'internet-egress' },
      { id: 'artifact-analysis', state: 'open', priority: 'high', workloadClass: 'analysis', summary: 'Need artifact synthesis.', dependency: 'artifact-store' },
    ],
    createdAt: NOW,
  });
  assert.deepEqual(plans.map((plan) => plan.gapId), ['artifact-analysis']);
});

test('organizational graph keeps Mahoraga singular and returns shared feat IDs', () => {
  const unit = createOrganizationUnit({
    unitId: 'repository-engineering',
    role: 'repository-engineering',
    mission: 'Implement and verify repository improvements.',
    capabilities: ['repository-verify'],
    workloadClasses: ['engineering'],
    persistent: true,
  }, { createdAt: NOW });
  assert.deepEqual(validateOrganizationUnit(unit), unit);
  const graph = buildOrganizationalAgentGraph({
    entityId: 'mahoraga',
    parentAgentId: 'mahoraga-core',
    existingAgents: [],
    units: [unit],
    workloadGaps: [],
    featLedger: {
      schemaVersion: 1,
      sourceFingerprint: 'a'.repeat(64),
      feats: [{ schemaVersion: 1, featId: 'feat-' + 'b'.repeat(24), agentId: 'mahoraga-repository-engineering-specialist', capability: 'repository-verify', outcome: 'success', summary: 'Verified exact-head candidate.', evidence: ['receipt-1'], learnedAt: NOW, zeroCredit: true, reusable: true }],
      reusableFeatIds: ['feat-' + 'b'.repeat(24)],
      byAgent: {},
    },
    createdAt: NOW,
  });
  assert.equal(graph.entityId, 'mahoraga');
  assert.equal(graph.singularAuthority, true);
  assert.deepEqual(graph.sharedFeatIds, ['feat-' + 'b'.repeat(24)]);
  assert.equal(graph.units.length, 1);
  assert.equal(graph.zeroCredit, true);
  assert.equal(graph.providerRequired, false);
});

test('organization graph is deterministic across unit ordering and rejects conflicting stable IDs', () => {
  const a = createOrganizationUnit({ unitId: 'artifact-analysis', role: 'artifact-analysis', mission: 'Analyze artifacts.', capabilities: ['artifact-analysis'], workloadClasses: ['analysis'], persistent: true }, { createdAt: NOW });
  const b = createOrganizationUnit({ unitId: 'world-observer', role: 'world-observer', mission: 'Observe world state.', capabilities: ['world-observe'], workloadClasses: ['observation'], persistent: true }, { createdAt: NOW });
  const base = { entityId: 'mahoraga', parentAgentId: 'mahoraga-core', existingAgents: [], workloadGaps: [], featLedger: null, createdAt: NOW };
  const left = buildOrganizationalAgentGraph({ ...base, units: [a, b] });
  const right = buildOrganizationalAgentGraph({ ...base, units: [b, a] });
  assert.equal(left.fingerprint, right.fingerprint);
  assert.deepEqual(left.units.map((unit) => unit.unitId), ['artifact-analysis', 'world-observer']);
  const conflict = createOrganizationUnit({ unitId: 'artifact-analysis', role: 'artifact-analysis', mission: 'Different mission.', capabilities: ['artifact-analysis'], workloadClasses: ['analysis'], persistent: true }, { createdAt: NOW });
  assert.throws(() => buildOrganizationalAgentGraph({ ...base, units: [a, conflict] }), /organization-unit-conflict/);
});

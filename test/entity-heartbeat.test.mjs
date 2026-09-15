import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityProfile } from '../src/capability-lattice.mjs';
import { createEntityConstitution } from '../src/entity-constitution.mjs';
import { createObjectiveCandidate } from '../src/objective-economy.mjs';
import { createWorkforceTwin } from '../src/workforce-twin.mjs';
import { createEvolutionExperiment, evaluateEvolutionExperiment } from '../src/evolution-laboratory.mjs';
import { createEntityHeartbeatReceipt, validateEntityHeartbeatReceipt } from '../src/entity-heartbeat.mjs';

const NOW = '2026-09-15T05:45:00.000Z';
const now = () => new Date(NOW);

function constitution() {
  const profile = createCapabilityProfile({
    initiative: 'anticipatory', authority: 'act', horizon: 'persistent', representation: 'delegate',
    learning: 'evolve', coordination: 'child-agents', environment: 'repository', reasoning: 'deterministic',
    persistence: 'institutional', autonomy: 'mission-directed',
  });
  return createEntityConstitution({
    entityId: 'mahoraga', displayName: 'Mahoraga', ownerId: 'owner',
    mission: 'Maintain mission continuity without relying on frontier-model credits.',
    principles: ['evidence-before-claim'], successCriteria: ['operate-zero-credit'],
    defaultAuthorityProfile: profile,
  }, { now });
}
function workforceTwin() {
  return createWorkforceTwin({
    twinId: 'owner-workforce', ownerId: 'owner',
    responsibilities: [{ id: 'quality', summary: 'Maintain high-quality deliverables.', source: 'owner-explicit', confidence: 1, state: 'active' }],
    obligations: [{ id: 'follow-up', summary: 'Track open items until closure.', source: 'entity-inference', confidence: 0.8, state: 'active' }],
  }, { now });
}

function objective() {
  return createObjectiveCandidate({
    objectiveId: 'obj-level8-closure', title: 'Close the Level 8 entity loop', origin: 'entity-evolution',
    missionAlignment: 100, impact: 95, urgency: 80, confidence: 95, dependencyReadiness: 90,
    reversibility: 95, costEfficiency: 100, capabilityReadiness: 90, evidenceQuality: 95, state: 'active',
  }, { now });
}

function evolutionEvaluation() {
  const experiment = createEvolutionExperiment({
    experimentId: 'exp-heartbeat', objectiveId: 'obj-level8-closure',
    hypothesis: 'The closure receipt remains bounded and deterministic.', baselineMetric: 0.5,
    candidateMetric: 0.8, verification: 'contract-suite', isolated: true,
  }, { observedAt: NOW });
  return evaluateEvolutionExperiment(experiment, { verificationSatisfied: true });
}
function heartbeatInput(overrides = {}) {
  return {
    observedAt: NOW,
    worldDigest: 'a'.repeat(64),
    previousReceipt: null,
    constitution: constitution(),
    workforceTwin: workforceTwin(),
    objectives: [objective()],
    dispatchIds: ['mahoraga-level8-specialist'],
    research: {
      evidenceIds: [`evidence-${'b'.repeat(32)}`], newMemoryIds: [`mem-${'c'.repeat(32)}`],
      zeroCredit: true, providerRequired: false, creditCost: 0, paidFallback: false,
    },
    capabilityGaps: [{ id: 'repository-verify', state: 'open', priority: 'critical', workloadClass: 'engineering' }],
    learning: { heartbeatCount: 2, nextActions: { 'dispatch-credit-free': 2 }, foundryPlanCount: 1 },
    memory: { fingerprint: 'd'.repeat(64), activeMemoryIds: [`mem-${'e'.repeat(32)}`], zeroCredit: true, providerRequired: false },
    evolutionEvaluations: [evolutionEvaluation()],
    ...overrides,
  };
}

test('Entity Heartbeat creates a content-minimized Level 8 closure receipt', () => {
  const receipt = createEntityHeartbeatReceipt(heartbeatInput());
  assert.equal(receipt.kind, 'entity-heartbeat-receipt');
  assert.equal(receipt.materialDelta, true);
  assert.equal(receipt.responsibilityCount, 1);
  assert.equal(receipt.obligationCount, 1);
  assert.equal(receipt.objectiveCount, 1);
  assert.equal(receipt.dispatchCount, 1);
  assert.equal(receipt.researchCount, 1);
  assert.equal(receipt.capabilityGapCount, 1);
  assert.equal(receipt.activeMemoryCount, 1);
  assert.equal(receipt.evolutionExperimentCount, 1);
  assert.equal(receipt.evolutionGraduationReadyCount, 1);
  assert.equal(receipt.zeroCredit, true);
  assert.equal(receipt.providerRequired, false);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.deepEqual(validateEntityHeartbeatReceipt(receipt), receipt);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('Maintain high-quality deliverables'), false);
  assert.equal(serialized.includes('closure receipt remains bounded'), false);
});
test('Entity Heartbeat distinguishes stable and changed world state', () => {
  const first = createEntityHeartbeatReceipt(heartbeatInput());
  const stable = createEntityHeartbeatReceipt(heartbeatInput({ previousReceipt: first }));
  const changed = createEntityHeartbeatReceipt(heartbeatInput({ previousReceipt: first, worldDigest: 'f'.repeat(64) }));
  assert.equal(stable.previousWorldDigest, first.worldDigest);
  assert.equal(stable.materialDelta, false);
  assert.equal(changed.previousWorldDigest, first.worldDigest);
  assert.equal(changed.materialDelta, true);
});

test('Entity Heartbeat rejects tampering and unknown receipt fields', () => {
  const receipt = createEntityHeartbeatReceipt(heartbeatInput());
  assert.throws(() => validateEntityHeartbeatReceipt({ ...receipt, objectiveCount: 99 }), /entity-heartbeat-fingerprint-invalid/);
  assert.throws(() => validateEntityHeartbeatReceipt({ ...receipt, unexpected: true }), /entity-heartbeat-invalid/);
});

test('Entity Heartbeat fails closed on paid contamination and unbounded inputs', () => {
  assert.throws(() => createEntityHeartbeatReceipt(heartbeatInput({
    research: { evidenceIds: [], newMemoryIds: [], zeroCredit: true, providerRequired: false, creditCost: 1, paidFallback: false },
  })), /entity-heartbeat-paid-contamination/);
  assert.throws(() => createEntityHeartbeatReceipt(heartbeatInput({
    dispatchIds: Array.from({ length: 4097 }, (_, index) => `dispatch-${index}`),
  })), /entity-heartbeat-dispatch-invalid/);
});
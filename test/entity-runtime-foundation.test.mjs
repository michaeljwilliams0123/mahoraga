import test from 'node:test';
import assert from 'node:assert/strict';

import { createEntityConstitution } from '../src/entity-constitution.mjs';
import { createWorkforceTwin, mergeWorkforceTwin } from '../src/workforce-twin.mjs';
import { createCapabilityProfile } from '../src/capability-lattice.mjs';
import { createObjectiveCandidate, scoreObjective, reconcileObjectiveEconomy } from '../src/objective-economy.mjs';

const NOW = '2026-09-07T06:00:00.000Z';
const now = () => new Date(NOW);

const profileInput = {
  initiative: 'anticipatory',
  authority: 'act',
  horizon: 'persistent',
  representation: 'delegate',
  learning: 'evolve',
  coordination: 'child-agents',
  environment: 'repository',
  reasoning: 'deterministic',
  persistence: 'institutional',
  autonomy: 'mission-directed',
};

test('entity constitution and capability profile are deterministic immutable records', () => {
  const profile = createCapabilityProfile(profileInput);
  const constitution = createEntityConstitution({
    entityId: 'mahoraga',
    displayName: 'Mahoraga',
    ownerId: 'owner',
    mission: 'Maintain useful mission continuity and improve work outcomes.',
    principles: ['evidence-before-claim', 'mission-continuity'],
    successCriteria: ['maintain-objective-continuity', 'operate-with-zero-frontier-credits'],
    defaultAuthorityProfile: profile,
  }, { now });

  assert.equal(constitution.schemaVersion, 1);
  assert.equal(constitution.createdAt, NOW);
  assert.deepEqual(constitution.principles, ['evidence-before-claim', 'mission-continuity']);
  assert.equal(Object.isFrozen(constitution), true);
  assert.equal(Object.isFrozen(constitution.defaultAuthorityProfile), true);
});

test('workforce twin preserves stronger provenance during merge', () => {
  const twin = createWorkforceTwin({
    twinId: 'owner-workforce',
    ownerId: 'owner',
    responsibilities: [{ id: 'quality', summary: 'Maintain high-quality deliverables.', source: 'owner-explicit', confidence: 1, state: 'active' }],
    obligations: [{ id: 'follow-up', summary: 'Track open items until closure.', source: 'entity-inference', confidence: 0.8, state: 'active' }],
  }, { now });

  const merged = mergeWorkforceTwin(twin, {
    responsibilities: [{ id: 'quality', summary: 'Weaker inferred replacement.', source: 'entity-inference', confidence: 0.6, state: 'active' }],
    obligations: [{ id: 'follow-up', summary: 'Evidence confirms follow-up.', source: 'connected-evidence', confidence: 0.95, state: 'active' }],
  }, { now: () => new Date('2026-09-07T06:05:00.000Z') });

  assert.equal(merged.responsibilities[0].summary, 'Maintain high-quality deliverables.');
  assert.equal(merged.obligations[0].source, 'connected-evidence');
});

test('objective economy scores and reconciles duplicate work deterministically', () => {
  const base = createObjectiveCandidate({
    objectiveId: 'obj-a',
    title: 'Build the Level 8 entity foundation',
    origin: 'entity-evolution',
    missionAlignment: 100,
    impact: 90,
    urgency: 40,
    confidence: 90,
    dependencyReadiness: 40,
    reversibility: 90,
    costEfficiency: 100,
    capabilityReadiness: 85,
    evidenceQuality: 80,
    state: 'deferred',
  }, { now });
  const improved = createObjectiveCandidate({
    objectiveId: 'obj-b',
    title: 'Build the Level 8 entity foundation',
    origin: 'entity-evolution',
    missionAlignment: 100,
    impact: 90,
    urgency: 70,
    confidence: 90,
    dependencyReadiness: 60,
    reversibility: 90,
    costEfficiency: 100,
    capabilityReadiness: 85,
    evidenceQuality: 80,
    state: 'active',
  }, { now });

  assert.equal(Number.isInteger(scoreObjective(base)), true);
  const reconciled = reconcileObjectiveEconomy([improved], [base]);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].objectiveId, 'obj-b');
  assert.equal(reconciled[0].state, 'active');
});

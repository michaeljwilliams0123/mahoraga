import test from 'node:test';
import assert from 'node:assert/strict';
import { createCognitiveIndividual } from '../src/cognitive-individual.mjs';
import { runCognitiveLoop } from '../src/cognitive-loop.mjs';
import { resolveCollectiveDissent } from '../src/collective-dissent-resolution.mjs';

const NOW = '2026-09-15T09:00:00.000Z';
const member = (id, tags) => createCognitiveIndividual({
  individualId: id,
  parentAgentId: 'mahoraga-core',
  displayName: id,
  archetype: `${id}-mind`,
  perspective: `${id} perspective`,
  communicationStyle: 'evidence-first',
  traits: { curiosity: 0.7 },
  epistemicPosture: { evidenceThreshold: 0.8, uncertaintyTolerance: 0.4, dissentDisposition: 'surface-material-dissent' },
  perspectiveTags: tags,
  privateEpisodicRefs: [],
}, { observedAt: NOW });

function evidence(evidenceRef, lineageRoot, overrides = {}) {
  return { evidenceRef, status: 'valid', freshness: 'current', lineageRoot, supersededBy: null, ...overrides };
}
function scenario({ ids = ['builder-agent', 'research-agent', 'skeptic-agent'], evidenceLedger, dissentHistory = [] } = {}) {
  const [builderId, researchId, skepticId] = ids;
  const members = [
    member(builderId, ['engineering']),
    member(researchId, ['evidence']),
    member(skepticId, ['risk']),
  ];
  return runCognitiveLoop({
    members,
    requiredPerspectiveTags: ['engineering', 'evidence', 'risk'],
    positions: [
      { individualId: builderId, conclusion: 'repair', confidence: 0.84, evidenceRefs: ['ev:builder'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: researchId, conclusion: 'repair', confidence: 0.82, evidenceRefs: ['ev:research'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: skepticId, conclusion: 'hold', confidence: 0.86, evidenceRefs: ['ev:skeptic'], assumptions: [], unknowns: [], dissentTags: ['rollback-risk'] },
    ],
    evidenceLedger,
    dissentHistory,
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.86, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 },
    stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [{ id: 'model-provider', error: 'unavailable' }] },
  });
}
const independentCurrent = [
  evidence('ev:builder', 'lineage:builder'),
  evidence('ev:research', 'lineage:research'),
  evidence('ev:skeptic', 'lineage:skeptic'),
];

test('minority rescue keeps fresh independent dissent blocking', () => {
  const result = scenario({ evidenceLedger: independentCurrent });
  assert.equal(result.decision, 'hold');
  assert.equal(result.decisionGate, 'material-dissent');
  assert.equal(result.dissentResolution?.blockingCount, 1);
  assert.equal(result.dissentResolution?.items[0].reasonCode, 'current-valid-dissent');
  assert.equal(result.dissentResolution?.items[0].observation.nextAction, 'reobserve');
  assert.equal(result.plan.automaticMutationAllowed, false);
  assert.equal(result.metacognition.materialConflictCount, 1);
});

test('stale veto remains visible but cannot hard-veto independently supported current evidence', () => {
  const result = scenario({ evidenceLedger: [
    evidence('ev:builder', 'lineage:builder'),
    evidence('ev:research', 'lineage:research'),
    evidence('ev:skeptic', 'lineage:skeptic', { freshness: 'stale', supersededBy: 'ev:skeptic-new' }),
    evidence('ev:skeptic-new', 'lineage:skeptic-new'),
  ] });
  assert.equal(result.decision, 'repair');
  assert.equal(result.decisionGate, 'admitted');
  assert.equal(result.dissentResolution?.blockingCount, 0);
  assert.equal(result.dissentResolution?.preservedNonBlockingCount, 1);
  assert.equal(result.dissentResolution?.items[0].reasonCode, 'degraded-dissent-with-independent-alternative');
  assert.equal(result.dissentResolution?.items[0].confidenceAfter, null);
  assert.equal(result.plan.automaticMutationAllowed, true);
  assert.equal(result.metacognition.materialConflictCount, 0);
  assert.equal(result.storedLesson.promotable, true);
});

test('correlated majority does not masquerade as independent support', () => {
  const result = scenario({ evidenceLedger: [
    evidence('ev:builder', 'lineage:shared'),
    evidence('ev:research', 'lineage:shared'),
    evidence('ev:skeptic', 'lineage:skeptic'),
  ] });
  assert.equal(result.decision, 'hold');
  assert.equal(result.dissentResolution?.blockingCount, 1);
  assert.equal(result.dissentResolution?.alternativeSupport.currentIndependentLineageCount, 1);
  assert.equal(result.dissentResolution?.alternativeSupport.currentParticipantCount, 2);
  assert.equal(result.plan.automaticMutationAllowed, false);
});

test('repeated unresolved valid dissent escalates instead of silently starving forever', () => {
  const result = scenario({
    evidenceLedger: independentCurrent,
    dissentHistory: [{
      individualId: 'skeptic-agent',
      dissentTags: ['rollback-risk'],
      evidenceRefs: ['ev:skeptic'],
      conclusion: 'hold',
      unresolvedCycles: 3,
      lastObservation: 'performed-supports-alternative',
    }],
  });
  assert.equal(result.decision, 'hold');
  assert.equal(result.decisionGate, 'dissent-escalation');
  assert.equal(result.dissentResolution?.escalationCount, 1);
  assert.equal(result.dissentResolution?.items[0].unresolvedCycles, 3);
  assert.equal(result.dissentResolution?.items[0].observation.nextAction, 'escalate');
  assert.equal(result.plan.automaticMutationAllowed, false);
  assert.equal(result.storedLesson.promotable, false);
});

test('identity continuity keeps evidence-topology outcome unchanged after participant rename', () => {
  const ledger = [
    evidence('ev:builder', 'lineage:builder'),
    evidence('ev:research', 'lineage:research'),
    evidence('ev:skeptic', 'lineage:skeptic', { status: 'refuted' }),
  ];
  const original = scenario({ evidenceLedger: ledger });
  const renamed = scenario({
    ids: ['maker-agent', 'analyst-agent', 'critic-agent'],
    evidenceLedger: ledger,
  });
  const semantic = (value) => ({
    decision: value.decision,
    decisionGate: value.decisionGate,
    blockingCount: value.dissentResolution?.blockingCount,
    preservedNonBlockingCount: value.dissentResolution?.preservedNonBlockingCount,
    alternativeLineages: value.dissentResolution?.alternativeSupport.currentIndependentLineageCount,
    mutationAllowed: value.plan.automaticMutationAllowed,
  });
  assert.deepEqual(semantic(renamed), semantic(original));
  assert.equal(original.decision, 'repair');
  assert.equal(original.dissentResolution?.blockingCount, 0);
});


test('qualified alternative group outranks a larger-lineage unqualified group', () => {
  const result = resolveCollectiveDissent({
    positions: [
      { individualId: 'skeptic-agent', conclusion: 'hold', confidence: 0.86, evidenceRefs: ['ev:skeptic'] },
      { individualId: 'solo-agent', conclusion: 'repair-solo', confidence: 0.91, evidenceRefs: ['ev:solo-1', 'ev:solo-2', 'ev:solo-3'] },
      { individualId: 'builder-agent', conclusion: 'repair-team', confidence: 0.82, evidenceRefs: ['ev:builder'] },
      { individualId: 'research-agent', conclusion: 'repair-team', confidence: 0.81, evidenceRefs: ['ev:research'] },
    ],
    materialDissent: [{ individualId: 'skeptic-agent', conclusion: 'hold', confidence: 0.86, dissentTags: ['rollback-risk'] }],
    evidenceLedger: [
      evidence('ev:skeptic', 'lineage:skeptic', { freshness: 'stale' }),
      evidence('ev:solo-1', 'lineage:solo-1'),
      evidence('ev:solo-2', 'lineage:solo-2'),
      evidence('ev:solo-3', 'lineage:solo-3'),
      evidence('ev:builder', 'lineage:team-1'),
      evidence('ev:research', 'lineage:team-2'),
    ],
  });
  assert.equal(result.alternativeSupport.conclusion, 'repair-team');
  assert.equal(result.alternativeSupport.qualified, true);
  assert.equal(result.blockingCount, 0);
});

test('changed dissent conclusion cannot inherit unresolved cycles from the prior claim', () => {
  const result = resolveCollectiveDissent({
    positions: [
      { individualId: 'skeptic-agent', conclusion: 'abort', confidence: 0.86, evidenceRefs: ['ev:skeptic'] },
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.84, evidenceRefs: ['ev:builder'] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.82, evidenceRefs: ['ev:research'] },
    ],
    materialDissent: [{ individualId: 'skeptic-agent', conclusion: 'abort', confidence: 0.86, dissentTags: ['rollback-risk'] }],
    evidenceLedger: independentCurrent,
    dissentHistory: [{
      individualId: 'skeptic-agent',
      conclusion: 'hold',
      dissentTags: ['rollback-risk'],
      evidenceRefs: ['ev:skeptic'],
      unresolvedCycles: 3,
      lastObservation: 'performed-supports-alternative',
    }],
  });
  assert.equal(result.items[0].unresolvedCycles, 0);
  assert.equal(result.items[0].escalation, false);
  assert.equal(result.items[0].observation.nextAction, 'reobserve');
});

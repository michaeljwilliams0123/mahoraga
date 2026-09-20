import test from 'node:test';
import assert from 'node:assert/strict';
import { createCognitiveIndividual } from '../src/cognitive-individual.mjs';
import { runCognitiveLoop } from '../src/cognitive-loop.mjs';

const now = '2026-09-15T09:00:00.000Z';
const member = (id, tags) => createCognitiveIndividual({
  individualId: id, parentAgentId: 'mahoraga-core', displayName: id, archetype: `${id}-mind`,
  perspective: `${id} perspective`, communicationStyle: 'evidence-first', traits: { curiosity: 0.7 },
  epistemicPosture: { evidenceThreshold: 0.8, uncertaintyTolerance: 0.4, dissentDisposition: 'surface-material-dissent' },
  perspectiveTags: tags, privateEpisodicRefs: [],
}, { observedAt: now });

const members = [member('builder-agent', ['engineering']), member('skeptic-agent', ['risk']), member('research-agent', ['evidence'])];

test('unified cognitive loop emits bounded phase receipts without private reasoning or authority widening', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.8, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.78, evidenceRefs: ['ev:b'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'repair', confidence: 0.75, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: [] },
    ],
    metacognition: { evidenceCoverage: 0.9, calibratedConfidence: 0.82, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.deepEqual(result.phases, ['perceive', 'remember', 'deliberate', 'assess', 'plan', 'predict', 'decide', 'store']);
  assert.equal(result.decision, 'repair');
  assert.equal(JSON.stringify(result).includes('privateEpisodicRefs'), false);
  assert.equal(result.authoritySource, 'existing-router-and-owner-authority');
});

test('cognitive loop holds when predicted uncertainty is materially high', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.9, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'repair', confidence: 0.85, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: [] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.55,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.3 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.equal(result.prediction.predictedUncertainty, 0.85);
  assert.equal(result.decision, 'hold');
  assert.equal(result.decisionGate, 'prediction-uncertain');
  assert.equal(result.storedLesson.promotable, false);
});


test('collective dissent and unknowns raise metacognitive risk even when caller reports none', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.9, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: ['capacity estimate incomplete'], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'hold', confidence: 0.86, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: ['rollback-risk'] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.equal(result.metacognition.proceed, false);
  assert.equal(result.metacognition.materialConflictCount, 1);
  assert.deepEqual(result.metacognition.knownUnknowns, ['capacity estimate incomplete']);
  assert.equal(result.decisionGate, 'material-dissent');
});

test('metacognitive hold suppresses planner automatic mutation without dropping diagnostics', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.9, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'hold', confidence: 0.86, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: ['provider-risk'] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [{ id: 'model-provider', error: 'unavailable' }] },
  });
  assert.equal(result.plan.actions.some((item) => item.reasonCode === 'provider-errors-present'), true);
  assert.equal(result.plan.automaticMutationAllowed, false);
  assert.equal(result.decisionGate, 'material-dissent');
});

test('collective aggregation preserves more than 32 valid unknowns without widening caller input', () => {
  const unknowns = (prefix) => Array.from({ length: 12 }, (_, index) => `${prefix}-unknown-${index}`);
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'repair', confidence: 0.9, evidenceRefs: ['ev:a'], assumptions: [], unknowns: unknowns('builder'), dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: unknowns('research'), dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'repair', confidence: 0.85, evidenceRefs: ['ev:c'], assumptions: [], unknowns: unknowns('skeptic'), dissentTags: [] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.equal(result.metacognition.proceed, false);
  assert.equal(result.metacognition.knownUnknowns.length, 36);
  assert.equal(result.deliberation.unknowns.length, 36);
  assert.equal(result.decisionGate, 'metacognition-hold');
});

test('metacognitive hold provenance wins when collective hold has no material dissent record', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'hold', confidence: 0.95, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'repair', confidence: 0.85, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: [] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: ['rollback evidence incomplete'], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.equal(result.deliberation.decision, 'hold');
  assert.equal(result.deliberation.materialDissent.length, 0);
  assert.equal(result.metacognition.proceed, false);
  assert.equal(result.decisionGate, 'metacognition-hold');
});

test('collective hold without material dissent keeps distinct gate provenance', () => {
  const result = runCognitiveLoop({
    members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
    positions: [
      { individualId: 'builder-agent', conclusion: 'hold', confidence: 0.95, evidenceRefs: ['ev:a'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'research-agent', conclusion: 'repair', confidence: 0.88, evidenceRefs: ['ev:b'], assumptions: [], unknowns: [], dissentTags: [] },
      { individualId: 'skeptic-agent', conclusion: 'repair', confidence: 0.85, evidenceRefs: ['ev:c'], assumptions: [], unknowns: [], dissentTags: [] },
    ],
    metacognition: { evidenceCoverage: 0.95, calibratedConfidence: 0.9, knownUnknowns: [], materialConflictCount: 0, reversible: true },
    observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
    proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
    plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
  });
  assert.equal(result.deliberation.materialDissent.length, 0);
  assert.equal(result.metacognition.proceed, true);
  assert.equal(result.decision, 'hold');
  assert.equal(result.decisionGate, 'collective-hold');
});

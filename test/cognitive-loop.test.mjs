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
  assert.deepEqual(result.phases, ['perceive', 'remember', 'assess', 'deliberate', 'plan', 'predict', 'decide', 'store']);
  assert.equal(result.decision, 'repair');
  assert.equal(JSON.stringify(result).includes('privateEpisodicRefs'), false);
  assert.equal(result.authoritySource, 'existing-router-and-owner-authority');
});
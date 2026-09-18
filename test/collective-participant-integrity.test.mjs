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
const base = {
  members, requiredPerspectiveTags: ['engineering', 'risk', 'evidence'],
  metacognition: { evidenceCoverage: 0.9, calibratedConfidence: 0.82, knownUnknowns: [], materialConflictCount: 0, reversible: true },
  observedState: { queueDepth: 3 }, stateUncertainty: 0.1,
  proposedAction: { actionId: 'repair-capacity', effects: { queueDepth: -1 }, uncertainty: 0.1 },
  plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] },
};

const position = (individualId, evidenceRef) => ({ individualId, conclusion: 'repair', confidence: 0.8, evidenceRefs: [evidenceRef], assumptions: [], unknowns: [], dissentTags: [] });

test('rejects positions from identities outside the selected collective', () => {
  assert.throws(() => runCognitiveLoop({ ...base, positions: [position('builder-agent', 'ev:a'), position('research-agent', 'ev:b'), position('skeptic-agent', 'ev:c'), position('shadow-agent', 'ev:shadow')] }), { code: 'collective-participant-integrity-invalid' });
});

test('requires every selected individual to contribute exactly one position', () => {
  assert.throws(() => runCognitiveLoop({ ...base, positions: [position('builder-agent', 'ev:a'), position('research-agent', 'ev:b')] }), { code: 'collective-participant-integrity-invalid' });
});

test('rejects duplicate positions from a selected individual', () => {
  assert.throws(() => runCognitiveLoop({ ...base, positions: [position('builder-agent', 'ev:a'), position('builder-agent', 'ev:duplicate'), position('research-agent', 'ev:b'), position('skeptic-agent', 'ev:c')] }), { code: 'collective-participant-integrity-invalid' });
});

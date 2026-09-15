import { createHash } from 'node:crypto';
import { selectCollectiveParticipants, createCollectivePosition, synthesizeCollectiveDeliberation } from './collective-cognition.mjs';
import { assessMetacognition } from './metacognition.mjs';
import { simulateCounterfactual } from './cognitive-world-model.mjs';
import { planWorldStateActions } from './objective-planner.mjs';

export function runCognitiveLoop(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('cognitive-loop-invalid');
  const participants = selectCollectiveParticipants({
    members: input.members,
    requiredPerspectiveTags: input.requiredPerspectiveTags,
    maximumParticipants: Math.min(12, input.members?.length ?? 0),
  });
  const positions = (input.positions ?? []).map(createCollectivePosition);
  const metacognitive = assessMetacognition(input.metacognition);
  const deliberation = synthesizeCollectiveDeliberation({ positions });
  const plan = planWorldStateActions(input.plannerSnapshot, { now: Date.parse('2026-09-15T09:00:00.000Z') });
  const prediction = simulateCounterfactual({ observedState: input.observedState, stateUncertainty: input.stateUncertainty, action: input.proposedAction });
  const predictionAdmissible = prediction.predictedUncertainty <= 0.7;
  const decision = metacognitive.proceed && deliberation.decision !== 'hold' && predictionAdmissible ? deliberation.decision : 'hold';
  const decisionGate = !metacognitive.proceed ? 'metacognition-hold' : deliberation.decision === 'hold' ? 'material-dissent' : !predictionAdmissible ? 'prediction-uncertain' : 'admitted';
  const evidenceRefs = [...new Set(positions.flatMap((item) => item.evidenceRefs))].sort();
  const core = {
    schemaVersion: 1,
    kind: 'cognitive-loop-receipt',
    phases: ['perceive', 'remember', 'assess', 'deliberate', 'plan', 'predict', 'decide', 'store'],
    participantIds: participants.map((item) => item.individualId),
    evidenceRefs,
    metacognition: publicAssessment(metacognitive),
    deliberation: publicDeliberation(deliberation),
    plan,
    prediction,
    decision,
    decisionGate,
    authoritySource: 'existing-router-and-owner-authority',
    storedLesson: { decision, evidenceRefs, promotable: decision !== 'hold' },
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}
function publicAssessment(value) {
  return deepFreeze({ action: value.action, proceed: value.proceed, evidenceCoverage: value.evidenceCoverage, calibratedConfidence: value.calibratedConfidence, calibrationGap: value.calibrationGap, knownUnknowns: value.knownUnknowns, materialConflictCount: value.materialConflictCount, reversible: value.reversible, fingerprint: value.fingerprint });
}
function publicDeliberation(value) {
  return deepFreeze({ decision: value.decision, selectedIndividualId: value.selectedIndividualId, evidenceRefs: value.evidenceRefs, unknowns: value.unknowns, materialDissent: value.materialDissent, fingerprint: value.fingerprint });
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }



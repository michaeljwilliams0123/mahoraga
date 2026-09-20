import { createHash } from 'node:crypto';
import { selectCollectiveParticipants, createCollectivePosition, synthesizeCollectiveDeliberation } from './collective-cognition.mjs';
import { assessMetacognition, assessCollectiveMetacognition } from './metacognition.mjs';
import { resolveCollectiveDissent } from './collective-dissent-resolution.mjs';
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
  assertParticipantIntegrity(participants, positions);
  const deliberation = synthesizeCollectiveDeliberation({ positions });
  const dissentResolution = resolveCollectiveDissent({ positions, materialDissent: deliberation.materialDissent, evidenceLedger: input.evidenceLedger ?? [], dissentHistory: input.dissentHistory ?? [] });
  const suppliedMetacognition = assessMetacognition(input.metacognition);
  const metacognitive = assessCollectiveMetacognition({
    evidenceCoverage: suppliedMetacognition.evidenceCoverage,
    calibratedConfidence: suppliedMetacognition.calibratedConfidence,
    knownUnknowns: [...new Set([...suppliedMetacognition.knownUnknowns, ...deliberation.unknowns])],
    materialConflictCount: Math.max(suppliedMetacognition.materialConflictCount, dissentResolution.blockingCount),
    reversible: suppliedMetacognition.reversible,
  });
  const planned = planWorldStateActions(input.plannerSnapshot, { now: Date.parse('2026-09-15T09:00:00.000Z') });
  const plan = gateAutomaticMutation(planned, metacognitive.proceed && dissentResolution.blockingCount === 0);
  const resolvedDeliberationDecision = deliberation.materialDissent.length > 0 && dissentResolution.blockingCount === 0 && dissentResolution.alternativeSupport.qualified ? dissentResolution.alternativeSupport.conclusion : deliberation.decision;
  const prediction = simulateCounterfactual({ observedState: input.observedState, stateUncertainty: input.stateUncertainty, action: input.proposedAction });
  const predictionAdmissible = prediction.predictedUncertainty <= 0.7;
  const decision = metacognitive.proceed && resolvedDeliberationDecision !== 'hold' && predictionAdmissible ? resolvedDeliberationDecision : 'hold';
  const decisionGate = dissentResolution.escalationCount > 0 ? 'dissent-escalation' : dissentResolution.blockingCount > 0 ? 'material-dissent' : !metacognitive.proceed ? 'metacognition-hold' : resolvedDeliberationDecision === 'hold' ? 'collective-hold' : !predictionAdmissible ? 'prediction-uncertain' : 'admitted';
  const evidenceRefs = [...new Set(positions.flatMap((item) => item.evidenceRefs))].sort();
  const core = {
    schemaVersion: 1,
    kind: 'cognitive-loop-receipt',
    phases: ['perceive', 'remember', 'deliberate', 'assess', 'plan', 'predict', 'decide', 'store'],
    participantIds: participants.map((item) => item.individualId),
    evidenceRefs,
    metacognition: publicAssessment(metacognitive),
    deliberation: publicDeliberation(deliberation),
    dissentResolution,
    plan,
    prediction,
    decision,
    decisionGate,
    authoritySource: 'existing-router-and-owner-authority',
    storedLesson: { decision, evidenceRefs, promotable: decision !== 'hold' },
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}
function gateAutomaticMutation(plan, allowed) {
  if (allowed || plan.automaticMutationAllowed !== true) return plan;
  return deepFreeze({ ...plan, automaticMutationAllowed: false });
}
function assertParticipantIntegrity(participants, positions) {
  const participantIds = participants.map((item) => item.individualId).sort();
  const positionIds = positions.map((item) => item.individualId).sort();
  if (positionIds.length !== participantIds.length || new Set(positionIds).size !== positionIds.length || positionIds.some((id, index) => id !== participantIds[index])) fail('collective-participant-integrity-invalid');
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



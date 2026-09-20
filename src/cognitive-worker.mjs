import { createHash } from "node:crypto";
import { assessMetacognition } from './metacognition.mjs';
import { synthesizeCollectiveDeliberation } from './collective-cognition.mjs';
import { simulateCounterfactual } from './cognitive-world-model.mjs';
import { evaluateTransferGeneralization } from './transfer-generalization.mjs';
import { runCognitiveLoop } from './cognitive-loop.mjs';
import { promoteVerifiedCognitiveLearning } from './cognitive-learning-bridge.mjs';

export async function executeCognitiveCapability(capability, task = {}) {
  const input = task.capabilityInput ?? task;
  switch (capability) {
    case 'cognitive.health':
      return { verified: true, summary: 'Mahoraga cognitive core contracts are available.', cognitiveState: 'ready' };
    case 'cognitive.assess': {
      const assessment = assessMetacognition(required(input, 'metacognition'));
      return empirical(task, input, { verified: true, summary: `Metacognitive action is ${assessment.action}.`, assessment });
    }
    case 'cognitive.deliberate': {
      const deliberation = synthesizeCollectiveDeliberation({ positions: required(input, 'positions') });
      return empirical(task, input, { verified: true, summary: `Collective deliberation decision is ${deliberation.decision}.`, deliberation });
    }
    case 'cognitive.predict': {
      const prediction = simulateCounterfactual(required(input, 'counterfactual'));
      return empirical(task, input, { verified: true, summary: `Counterfactual ${prediction.actionId} simulated.`, prediction });
    }
    case 'cognitive.transfer': {
      const transfer = evaluateTransferGeneralization(required(input, 'transfer'));
      return empirical(task, input, { verified: true, summary: transfer.promotable ? 'Empirical transfer is promotable.' : `Transfer held: ${transfer.reason}.`, transfer });
    }
    case 'cognitive.cycle': {
      const cycle = runCognitiveLoop(required(input, 'cognitiveInput'));
      return empirical(task, input, { verified: true, summary: `Cognitive cycle completed with decision ${cycle.decision}.`, cycle });
    }
    case 'cognitive.learn': {
      const learning = promoteVerifiedCognitiveLearning(required(input, 'learningInput'));
      return empirical(task, input, { verified: true, summary: learning.promotable ? 'Verified cognitive outcome promoted to institutional memory.' : 'Cognitive learning held: ' + learning.reason + '.', learning });
    }
    default: throw new Error('unsupported-capability');
  }
}

function required(value, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value[key] === undefined) {
    const error = new TypeError(`cognitive-${key}-required`);
    error.code = `cognitive-${key}-required`;
    throw error;
  }
  return value[key];
}

function empirical(task, input, result) {
  const sourceCommit = typeof task.expectedSourceCommit === "string" && /^[a-f0-9]{40}$/i.test(task.expectedSourceCommit)
    ? task.expectedSourceCommit.toLowerCase()
    : null;
  const challengeId = typeof task.correlationId === "string" ? task.correlationId.slice(0, 120) : null;
  return { ...result, receiptMetadata: { evaluatorVersion: "cognitive-empirical-v1", sourceCommit, challengeId, inputsSha256: createHash("sha256").update(JSON.stringify(input)).digest("hex"), routeWorker: "cognitive-core" } };
}

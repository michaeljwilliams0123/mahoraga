import { assessMetacognition } from './metacognition.mjs';
import { synthesizeCollectiveDeliberation } from './collective-cognition.mjs';
import { simulateCounterfactual } from './cognitive-world-model.mjs';
import { evaluateTransferGeneralization } from './transfer-generalization.mjs';
import { runCognitiveLoop } from './cognitive-loop.mjs';

export async function executeCognitiveCapability(capability, task = {}) {
  switch (capability) {
    case 'cognitive.health':
      return { verified: true, summary: 'Mahoraga cognitive core contracts are available.', cognitiveState: 'ready' };
    case 'cognitive.assess': {
      const assessment = assessMetacognition(required(task, 'metacognition'));
      return { verified: true, summary: `Metacognitive action is ${assessment.action}.`, assessment };
    }
    case 'cognitive.deliberate': {
      const deliberation = synthesizeCollectiveDeliberation({ positions: required(task, 'positions') });
      return { verified: true, summary: `Collective deliberation decision is ${deliberation.decision}.`, deliberation };
    }
    case 'cognitive.predict': {
      const prediction = simulateCounterfactual(required(task, 'counterfactual'));
      return { verified: true, summary: `Counterfactual ${prediction.actionId} simulated.`, prediction };
    }
    case 'cognitive.transfer': {
      const transfer = evaluateTransferGeneralization(required(task, 'transfer'));
      return { verified: true, summary: transfer.promotable ? 'Empirical transfer is promotable.' : `Transfer held: ${transfer.reason}.`, transfer };
    }
    case 'cognitive.cycle': {
      const cycle = runCognitiveLoop(required(task, 'cognitiveInput'));
      return { verified: true, summary: `Cognitive cycle completed with decision ${cycle.decision}.`, cycle };
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

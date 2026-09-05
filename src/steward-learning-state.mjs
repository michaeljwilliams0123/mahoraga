import crypto from 'node:crypto';
import { buildAgentFeatLedger, validateAgentFeat } from './agent-feat-ledger.mjs';
import { planChildAgents, validateChildAgentManifest } from './agent-foundry.mjs';

export function buildStewardLearningState({ parentAgentId, agents = [], feats = [], gaps = [] } = {}) {
  if (typeof parentAgentId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(parentAgentId)) fail('steward-parent-agent-invalid');
  if (!Array.isArray(agents) || !Array.isArray(feats) || !Array.isArray(gaps)) fail('steward-learning-input-invalid');
  const normalizedAgents = agents.map(validateChildAgentManifest).sort((a, b) => a.agentId.localeCompare(b.agentId));
  const normalizedFeats = feats.map(validateAgentFeat);
  const normalizedGaps = gaps.map(normalizeGap).sort((a, b) => a.id.localeCompare(b.id));
  const sourceFingerprint = digest({ agents: normalizedAgents, feats: [...normalizedFeats].sort((a, b) => a.featId.localeCompare(b.featId)), gaps: normalizedGaps });
  const featLedger = buildAgentFeatLedger({ sourceFingerprint, feats: normalizedFeats });
  const plans = planChildAgents({ parentAgentId, existingAgents: normalizedAgents, gaps: normalizedGaps, createdAt: deterministicCreationTime(normalizedAgents, normalizedFeats) });
  const stateFingerprint = digest({ sourceFingerprint, featIds: featLedger.feats.map((feat) => feat.featId), plans: plans.map((plan) => ({ gapId: plan.gapId, agentId: plan.manifest.agentId })) });
  return deepFreeze({
    schemaVersion: 1,
    zeroCredit: true,
    learningMode: 'deterministic-state-refresh',
    sourceFingerprint,
    stateFingerprint,
    childAgentCount: normalizedAgents.length,
    featLedger,
    parentAccess: {
      allChildFeats: true,
      featIds: featLedger.feats.map((feat) => feat.featId).sort(),
      reusableFeatIds: [...featLedger.reusableFeatIds],
    },
    agentFactory: {
      plannedCount: plans.length,
      plans,
    },
  });
}

export function renderStewardLearningState(input) {
  return `${JSON.stringify(buildStewardLearningState(input), null, 2)}\n`;
}

function normalizeGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('steward-gap-invalid');
  for (const key of ['id', 'state', 'priority', 'summary', 'dependency']) if (typeof value[key] !== 'string' || value[key].length < 1) fail('steward-gap-invalid');
  return { id: value.id, state: value.state, priority: value.priority, summary: value.summary, dependency: value.dependency };
}
function deterministicCreationTime(agents, feats) {
  const candidates = [
    ...agents.map((agent) => agent.createdAt),
    ...feats.map((feat) => feat.learnedAt),
    '1970-01-01T00:00:00.000Z',
  ].sort();
  return candidates.at(-1);
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

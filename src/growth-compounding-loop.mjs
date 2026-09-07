import { createHash } from 'node:crypto';
import { buildAgentFeatLedger, validateAgentFeat } from './agent-feat-ledger.mjs';
import { validateChildAgentManifest } from './agent-foundry.mjs';
import { createObjectiveCandidate, reconcileObjectiveEconomy } from './objective-economy.mjs';
import { createInstitutionalMemoryRecord, reconcileInstitutionalMemory } from './institutional-memory.mjs';
import { buildOrganizationalAgentGraph, validateOrganizationUnit } from './organizational-agent-graph.mjs';

const PRIORITY_SCORE = Object.freeze({
  critical: Object.freeze({ impact: 100, urgency: 100, confidence: 95 }),
  high: Object.freeze({ impact: 90, urgency: 85, confidence: 90 }),
  medium: Object.freeze({ impact: 75, urgency: 65, confidence: 85 }),
  low: Object.freeze({ impact: 55, urgency: 40, confidence: 80 }),
});

export function runGrowthCompoundingLoop({
  entityId = 'mahoraga',
  parentAgentId = 'mahoraga',
  agents = [],
  feats = [],
  gaps = [],
  memoryRecords = [],
  existingObjectives = [],
  existingUnits = [],
  now = new Date().toISOString(),
} = {}) {
  const timestamp = canonicalTimestamp(now);
  if (!Array.isArray(agents) || !Array.isArray(feats) || !Array.isArray(gaps) || !Array.isArray(memoryRecords) || !Array.isArray(existingObjectives) || !Array.isArray(existingUnits)) {
    fail('growth-compounding-input-invalid');
  }
  const normalizedAgents = agents.map(validateChildAgentManifest).sort((a, b) => a.agentId.localeCompare(b.agentId));
  const normalizedFeats = feats.map(validateAgentFeat).sort((a, b) => a.featId.localeCompare(b.featId));
  const normalizedGaps = gaps.map(normalizeGap).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id));
  const normalizedUnits = existingUnits.map(validateOrganizationUnit).sort((a, b) => a.unitId.localeCompare(b.unitId));

  const sourceFingerprint = digest({
    entityId,
    parentAgentId,
    agents: normalizedAgents,
    feats: normalizedFeats,
    gaps: normalizedGaps,
    memoryIds: memoryRecords.map((record) => record?.memoryId ?? null).sort(),
    objectiveIds: existingObjectives.map((objective) => objective?.objectiveId ?? null).sort(),
    unitIds: normalizedUnits.map((unit) => unit.unitId),
  });
  const featLedger = buildAgentFeatLedger({ sourceFingerprint, feats: normalizedFeats });
  const objectiveCandidates = normalizedGaps.filter(actionableGap).map((gap) => objectiveFromGap(gap, timestamp));
  const objectives = reconcileObjectiveEconomy(objectiveCandidates, existingObjectives);
  const incomingMemory = normalizedGaps.filter(actionableGap).map((gap) => memoryFromGap(gap, timestamp));
  const memory = reconcileInstitutionalMemory({ records: memoryRecords, incoming: incomingMemory, now: timestamp });
  const organization = buildOrganizationalAgentGraph({
    entityId,
    parentAgentId,
    existingAgents: normalizedAgents,
    units: normalizedUnits,
    workloadGaps: normalizedGaps,
    featLedger,
    createdAt: timestamp,
  });
  const promotedCapabilities = promoteCapabilities(featLedger);
  const fingerprint = digest({
    sourceFingerprint,
    memory: memory.fingerprint,
    objectives: objectives.map((objective) => [objective.objectiveId, objective.state]),
    organization: organization.fingerprint,
    promotedCapabilities,
  });

  return deepFreeze({
    schemaVersion: 1,
    kind: 'level8-growth-compounding-loop',
    observedAt: timestamp,
    sourceFingerprint,
    fingerprint,
    memory,
    objectives,
    organization,
    featLedger,
    promotedCapabilities,
    growthMetrics: {
      activeMemoryCount: memory.activeMemoryIds.length,
      objectiveCount: objectives.length,
      plannedUnitCount: organization.plans.length,
      reusableFeatCount: featLedger.reusableFeatIds.length,
      promotedCapabilityCount: promotedCapabilities.length,
    },
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  });
}

function objectiveFromGap(gap, timestamp) {
  const score = PRIORITY_SCORE[gap.priority];
  return createObjectiveCandidate({
    objectiveId: `obj-${gap.id}`.slice(0, 95).replace(/-+$/g, ''),
    title: `Close ${gap.id} capability gap`,
    origin: 'capability-gap',
    missionAlignment: 95,
    impact: score.impact,
    urgency: score.urgency,
    confidence: score.confidence,
    dependencyReadiness: gap.dependency ? 80 : 100,
    reversibility: 85,
    costEfficiency: 100,
    capabilityReadiness: 70,
    evidenceQuality: 80,
    state: 'candidate',
  }, { now: () => new Date(timestamp) });
}

function memoryFromGap(gap, timestamp) {
  return createInstitutionalMemoryRecord({
    memoryClass: gap.state === 'refused' ? 'negative-memory' : 'observation',
    subject: gap.id,
    statement: gap.summary,
    provenance: 'entity-inference',
    confidence: PRIORITY_SCORE[gap.priority].confidence / 100,
    freshness: 'current',
    objectiveIds: [`obj-${gap.id}`.slice(0, 95).replace(/-+$/g, '')],
    evidenceRefs: [`gap-${gap.id}`.slice(0, 240)],
    capability: gap.id,
    supersedes: [],
  }, { observedAt: timestamp });
}

function promoteCapabilities(featLedger) {
  const byCapability = new Map();
  for (const feat of featLedger.feats) {
    if (!feat.reusable || feat.outcome !== 'success') continue;
    const current = byCapability.get(feat.capability) ?? new Set();
    current.add(feat.featId);
    byCapability.set(feat.capability, current);
  }
  return [...byCapability.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([capability]) => capability)
    .sort();
}

function normalizeGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('growth-gap-invalid');
  const id = checkedSlug(value.id, 'growth-gap-id-invalid');
  if (!Object.hasOwn(PRIORITY_SCORE, value.priority)) fail('growth-gap-priority-invalid');
  if (typeof value.state !== 'string' || value.state.length < 1) fail('growth-gap-state-invalid');
  return {
    id,
    state: value.state,
    priority: value.priority,
    workloadClass: checkedSlug(value.workloadClass ?? inferWorkloadClass(id), 'growth-gap-workload-invalid'),
    summary: checkedText(value.summary, 1_000, 'growth-gap-summary-invalid'),
    dependency: checkedText(value.dependency, 2_000, 'growth-gap-dependency-invalid'),
  };
}

function actionableGap(gap) { return gap.state === 'open' || gap.state === 'unverified' || gap.state === 'refused'; }
function inferWorkloadClass(id) {
  if (id.includes('research')) return 'research';
  if (id.includes('artifact')) return 'analysis';
  if (id.includes('repository') || id.includes('verify')) return 'engineering';
  return 'operations';
}
function priorityRank(value) { return ({ critical: 0, high: 1, medium: 2, low: 3 })[value] ?? 9; }
function checkedSlug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); return value; }
function checkedText(value, maximum, code) { if (typeof value !== 'string' || !value.trim() || value.length > maximum || /\0/.test(value)) fail(code); return value.replace(/\s+/g, ' ').trim(); }
function canonicalTimestamp(value) { const text = value instanceof Date ? value.toISOString() : String(value ?? ''); if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) fail('growth-compounding-clock-invalid'); return text; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

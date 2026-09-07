import { createHash } from 'node:crypto';
import { buildAgentFeatLedger, validateAgentFeat } from './agent-feat-ledger.mjs';
import { validateChildAgentManifest } from './agent-foundry.mjs';
import { createObjectiveCandidate, reconcileObjectiveEconomy, validateObjectiveCandidate } from './objective-economy.mjs';
import { createInstitutionalMemoryRecord, reconcileInstitutionalMemory } from './institutional-memory.mjs';
import { buildOrganizationalAgentGraph, validateOrganizationUnit } from './organizational-agent-graph.mjs';

const PRIORITY = Object.freeze({
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
  const observedAt = canonicalTimestamp(now);
  if (entityId !== 'mahoraga') fail('growth-entity-invalid');
  checkedSlug(parentAgentId, 'growth-parent-invalid');
  if (![agents, feats, gaps, memoryRecords, existingObjectives, existingUnits].every(Array.isArray)) {
    fail('growth-compounding-input-invalid');
  }

  const normalizedAgents = agents.map(validateChildAgentManifest).sort((a, b) => a.agentId.localeCompare(b.agentId));
  const normalizedFeats = feats.map(validateAgentFeat).sort((a, b) => a.featId.localeCompare(b.featId));
  const normalizedGaps = gaps.map(normalizeGap).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id));
  const normalizedObjectives = existingObjectives.map(validateObjectiveCandidate);
  const normalizedUnits = existingUnits.map(validateOrganizationUnit).sort((a, b) => a.unitId.localeCompare(b.unitId));

  const sourceFingerprint = digest({
    entityId,
    parentAgentId,
    agentIds: normalizedAgents.map((agent) => agent.agentId),
    featIds: normalizedFeats.map((feat) => feat.featId),
    gaps: normalizedGaps,
    memoryIds: memoryRecords.map((record) => record?.memoryId ?? null).sort(),
    objectiveFingerprints: normalizedObjectives.map((objective) => objective.fingerprint).sort(),
    unitIds: normalizedUnits.map((unit) => unit.unitId),
  });
  const featLedger = buildAgentFeatLedger({ sourceFingerprint, feats: normalizedFeats });

  const candidates = normalizedGaps.filter(isActionable).map((gap) => objectiveFromGap(gap, observedAt));
  const objectives = reconcileObjectiveEconomy(candidates, normalizedObjectives);

  const incomingMemory = normalizedGaps.filter(isActionable).map((gap) => createInstitutionalMemoryRecord({
    memoryClass: 'knowledge',
    subject: gap.id,
    statement: gap.summary,
    provenance: 'synthesized',
    confidence: PRIORITY[gap.priority].confidence / 100,
    freshness: 'current',
    objectiveIds: [objectiveIdForGap(gap.id)],
    evidenceRefs: [`gap-${gap.id}`],
    capability: gap.id,
    supersedes: [],
  }, { observedAt }));
  const memory = reconcileInstitutionalMemory({ records: memoryRecords, incoming: incomingMemory, now: observedAt });

  const organization = buildOrganizationalAgentGraph({
    entityId,
    parentAgentId,
    existingAgents: normalizedAgents,
    units: normalizedUnits,
    workloadGaps: normalizedGaps,
    featLedger,
    createdAt: observedAt,
  });

  const promotedCapabilities = promotedFromLedger(featLedger);
  const activeMemoryCount = memory.records.length - memory.supersededMemoryIds.length;
  const fingerprint = digest({
    sourceFingerprint,
    memoryFingerprint: memory.fingerprint,
    objectiveFingerprints: objectives.map((objective) => objective.fingerprint),
    organizationFingerprint: organization.fingerprint,
    promotedCapabilities,
  });

  return deepFreeze({
    schemaVersion: 1,
    kind: 'level8-growth-compounding-loop',
    observedAt,
    sourceFingerprint,
    fingerprint,
    memory,
    objectives,
    organization,
    featLedger,
    promotedCapabilities,
    growthMetrics: {
      activeMemoryCount,
      objectiveCount: objectives.length,
      plannedUnitCount: organization.plannedUnits.length,
      organizationUnitCount: organization.units.length,
      reusableFeatCount: featLedger.reusableFeatIds.length,
      promotedCapabilityCount: promotedCapabilities.length,
    },
    zeroCredit: true,
    providerRequired: false,
    creditCost: 0,
    paidFallback: false,
  });
}

function objectiveFromGap(gap, observedAt) {
  const score = PRIORITY[gap.priority];
  return createObjectiveCandidate({
    objectiveId: objectiveIdForGap(gap.id),
    title: `Close ${gap.id} capability gap`,
    origin: 'capability-gap',
    missionAlignment: 95,
    impact: score.impact,
    urgency: score.urgency,
    confidence: score.confidence,
    dependencyReadiness: gap.dependency ? 80 : 100,
    reversibility: 90,
    costEfficiency: 100,
    capabilityReadiness: 70,
    evidenceQuality: 80,
    state: 'candidate',
  }, { now: () => new Date(observedAt) });
}

function promotedFromLedger(ledger) {
  const byCapability = new Map();
  for (const feat of ledger.feats) {
    if (!feat.reusable || feat.outcome !== 'success') continue;
    const ids = byCapability.get(feat.capability) ?? new Set();
    ids.add(feat.featId);
    byCapability.set(feat.capability, ids);
  }
  return [...byCapability.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([capability]) => capability)
    .sort();
}

function normalizeGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('growth-gap-invalid');
  const allowed = new Set(['id', 'state', 'priority', 'workloadClass', 'summary', 'dependency']);
  if (Object.keys(value).length !== allowed.size || Object.keys(value).some((key) => !allowed.has(key))) fail('growth-gap-invalid');
  const priority = value.priority;
  if (!Object.hasOwn(PRIORITY, priority)) fail('growth-gap-priority-invalid');
  const state = value.state;
  if (!['open', 'unverified', 'refused', 'closed'].includes(state)) fail('growth-gap-state-invalid');
  return deepFreeze({
    id: checkedSlug(value.id, 'growth-gap-id-invalid'),
    state,
    priority,
    workloadClass: checkedSlug(value.workloadClass, 'growth-gap-workload-invalid'),
    summary: checkedText(value.summary, 1000, 'growth-gap-summary-invalid'),
    dependency: checkedSlug(value.dependency, 'growth-gap-dependency-invalid'),
  });
}

function isActionable(gap) {
  return gap.state === 'open' || gap.state === 'unverified' || gap.state === 'refused';
}

function objectiveIdForGap(id) {
  const value = `obj-${id}`;
  if (value.length > 96) fail('growth-objective-id-too-long');
  return value;
}

function priorityRank(value) {
  return ({ critical: 0, high: 1, medium: 2, low: 3 })[value] ?? 9;
}

function checkedSlug(value, code) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function checkedText(value, maximum, code) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > maximum || /\0/.test(value)) fail(code);
  return value.replace(/\s+/g, ' ').trim();
}

function canonicalTimestamp(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) fail('growth-compounding-clock-invalid');
  return text;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

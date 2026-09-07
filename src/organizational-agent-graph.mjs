import { createHash } from 'node:crypto';
import { planChildAgents, validateChildAgentManifest } from './agent-foundry.mjs';
import { buildAgentFeatLedger } from './agent-feat-ledger.mjs';

export const LEVEL8_ORGANIZATION_SCHEMA_VERSION = 1;

const UNIT_KEYS = new Set([
  'schemaVersion', 'unitId', 'role', 'mission', 'capabilities', 'workloadClasses',
  'persistent', 'authority', 'sharedMemory', 'sharedFeatLedger', 'zeroCredit', 'providerRequired', 'createdAt',
]);
const ACTIONABLE_STATES = new Set(['open', 'unverified']);
const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

export function createOrganizationUnit(input, { createdAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('organization-unit-invalid');
  return validateOrganizationUnit({
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    unitId: input.unitId,
    role: input.role,
    mission: input.mission,
    capabilities: normalizeSlugs(input.capabilities ?? [], 64, 'organization-unit-capabilities-invalid'),
    workloadClasses: normalizeSlugs(input.workloadClasses ?? [], 32, 'organization-unit-workloads-invalid'),
    persistent: input.persistent === true,
    authority: 'internal-function',
    sharedMemory: true,
    sharedFeatLedger: true,
    zeroCredit: true,
    providerRequired: false,
    createdAt,
  });
}

export function validateOrganizationUnit(value) {
  exact(value, UNIT_KEYS, 'organization-unit-invalid');
  if (value.schemaVersion !== LEVEL8_ORGANIZATION_SCHEMA_VERSION) fail('organization-unit-schema-invalid');
  const unit = {
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    unitId: checkedSlug(value.unitId, 64, 'organization-unit-id-invalid'),
    role: checkedSlug(value.role, 64, 'organization-unit-role-invalid'),
    mission: checkedText(value.mission, 2_000, 'organization-unit-mission-invalid'),
    capabilities: normalizeSlugs(value.capabilities, 64, 'organization-unit-capabilities-invalid'),
    workloadClasses: normalizeSlugs(value.workloadClasses, 32, 'organization-unit-workloads-invalid'),
    persistent: value.persistent,
    authority: value.authority,
    sharedMemory: value.sharedMemory,
    sharedFeatLedger: value.sharedFeatLedger,
    zeroCredit: value.zeroCredit,
    providerRequired: value.providerRequired,
    createdAt: canonicalTimestamp(value.createdAt, 'organization-unit-created-at-invalid'),
  };
  if (typeof unit.persistent !== 'boolean') fail('organization-unit-persistent-invalid');
  if (unit.authority !== 'internal-function' || unit.sharedMemory !== true || unit.sharedFeatLedger !== true || unit.zeroCredit !== true || unit.providerRequired !== false) {
    fail('organization-unit-authority-invalid');
  }
  return deepFreeze(unit);
}

export function planOrganizationUnits({
  entityId,
  parentAgentId,
  existingAgents = [],
  existingUnits = [],
  workloadGaps = [],
  createdAt = new Date().toISOString(),
} = {}) {
  checkedSlug(entityId, 64, 'organization-entity-id-invalid');
  checkedSlug(parentAgentId, 64, 'organization-parent-agent-invalid');
  canonicalTimestamp(createdAt, 'organization-created-at-invalid');
  if (!Array.isArray(existingAgents) || !Array.isArray(existingUnits) || !Array.isArray(workloadGaps) || workloadGaps.length > 1_024) {
    fail('organization-planner-input-invalid');
  }
  const agents = existingAgents.map(validateChildAgentManifest);
  const units = normalizeUnits(existingUnits);
  const coveredCapabilities = new Set([
    ...agents.flatMap((agent) => agent.capabilities),
    ...units.flatMap((unit) => unit.capabilities),
  ]);
  const coveredWorkloads = new Set(units.flatMap((unit) => unit.workloadClasses));
  const normalizedGaps = workloadGaps.map(normalizeGap)
    .filter((gap) => ACTIONABLE_STATES.has(gap.state) && !coveredCapabilities.has(gap.id) && !coveredWorkloads.has(gap.workloadClass))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id));
  const childPlans = planChildAgents({ parentAgentId, existingAgents: agents, gaps: normalizedGaps, createdAt });
  const byGap = new Map(childPlans.map((plan) => [plan.gapId, plan]));
  const plans = normalizedGaps.map((gap) => {
    const child = byGap.get(gap.id);
    if (!child) fail('organization-child-plan-missing');
    const unit = createOrganizationUnit({
      unitId: gap.id,
      role: gap.id,
      mission: gap.summary,
      capabilities: [gap.id],
      workloadClasses: [gap.workloadClass],
      persistent: true,
    }, { createdAt });
    const current = units.find((candidate) => candidate.unitId === unit.unitId);
    if (current && !sameUnitDefinition(current, unit)) fail('organization-unit-conflict');
    return deepFreeze({
      schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
      entityId,
      parentAgentId,
      gapId: gap.id,
      workloadClass: gap.workloadClass,
      priority: gap.priority,
      summary: gap.summary,
      dependency: gap.dependency,
      proposedUnitId: unit.unitId,
      createdAt: unit.createdAt,
      unit,
      manifest: child.manifest,
      zeroCredit: true,
      providerRequired: false,
    });
  });
  return deepFreeze(plans);
}

export function buildOrganizationalAgentGraph({
  entityId,
  parentAgentId,
  existingAgents = [],
  units = [],
  workloadGaps = [],
  featLedger = null,
  createdAt = new Date().toISOString(),
} = {}) {
  const normalizedEntityId = checkedSlug(entityId, 64, 'organization-entity-id-invalid');
  const normalizedParent = checkedSlug(parentAgentId, 64, 'organization-parent-agent-invalid');
  canonicalTimestamp(createdAt, 'organization-graph-created-at-invalid');
  const normalizedAgents = existingAgents.map(validateChildAgentManifest).sort((a, b) => a.agentId.localeCompare(b.agentId));
  const normalizedUnits = normalizeUnits(units);
  const plans = planOrganizationUnits({
    entityId: normalizedEntityId,
    parentAgentId: normalizedParent,
    existingAgents: normalizedAgents,
    existingUnits: normalizedUnits,
    workloadGaps,
    createdAt,
  });
  const effectiveUnits = normalizeUnits([...normalizedUnits, ...plans.map((plan) => plan.unit)]);
  let sharedFeatIds = [];
  if (featLedger != null) {
    if (!featLedger || featLedger.schemaVersion !== 1 || typeof featLedger.sourceFingerprint !== 'string' || !Array.isArray(featLedger.feats)) {
      fail('organization-feat-ledger-invalid');
    }
    const validated = buildAgentFeatLedger({ sourceFingerprint: featLedger.sourceFingerprint, feats: featLedger.feats });
    sharedFeatIds = [...validated.reusableFeatIds];
  }
  const graphCore = {
    entityId: normalizedEntityId,
    parentAgentId: normalizedParent,
    units: effectiveUnits,
    plans,
    plannedUnits: plans,
    sharedFeatIds: [...sharedFeatIds].sort(),
  };
  return deepFreeze({
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    ...graphCore,
    singularAuthority: true,
    authority: 'mahoraga-parent-only',
    sharedInstitutionalMemory: true,
    sharedFeatLedger: true,
    zeroCredit: true,
    providerRequired: false,
    fingerprint: digest(graphCore),
  });
}

function normalizeUnits(values) {
  if (!Array.isArray(values) || values.length > 512) fail('organization-unit-list-invalid');
  const byId = new Map();
  for (const raw of values) {
    const unit = validateOrganizationUnit(raw);
    const current = byId.get(unit.unitId);
    if (current && !sameUnitDefinition(current, unit)) fail('organization-unit-conflict');
    if (!current) byId.set(unit.unitId, unit);
  }
  return [...byId.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
}

function normalizeGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('organization-gap-invalid');
  const id = checkedSlug(value.id, 64, 'organization-gap-id-invalid');
  if (typeof value.state !== 'string') fail('organization-gap-state-invalid');
  if (!Object.hasOwn(PRIORITY_RANK, value.priority)) fail('organization-gap-priority-invalid');
  return {
    id,
    state: value.state,
    priority: value.priority,
    workloadClass: checkedSlug(value.workloadClass ?? inferWorkloadClass(id), 64, 'organization-gap-workload-invalid'),
    summary: checkedText(value.summary, 1_000, 'organization-gap-summary-invalid'),
    dependency: checkedText(value.dependency, 2_000, 'organization-gap-dependency-invalid'),
  };
}

function inferWorkloadClass(id) {
  if (id.includes('research')) return 'research';
  if (id.includes('artifact')) return 'analysis';
  if (id.includes('repository') || id.includes('verify')) return 'engineering';
  return 'operations';
}

function sameUnitDefinition(left, right) {
  const { createdAt: leftCreatedAt, ...leftDefinition } = left;
  const { createdAt: rightCreatedAt, ...rightDefinition } = right;
  return JSON.stringify(leftDefinition) === JSON.stringify(rightDefinition);
}

function priorityRank(value) { return PRIORITY_RANK[value] ?? 9; }
function normalizeSlugs(value, maximum, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, 64, code)).sort();
}
function checkedSlug(value, maximum, code) {
  if (typeof value !== 'string' || value.length > maximum || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail(code);
  return value;
}
function checkedText(value, maximum, code) {
  if (typeof value !== 'string') fail(code);
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum || /\0/.test(value)) fail(code);
  return normalized;
}
function canonicalTimestamp(value, code) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) fail(code);
  return text;
}
function exact(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

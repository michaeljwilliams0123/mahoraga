import crypto from 'node:crypto';
import { validateChildAgentManifest } from './agent-foundry.mjs';
import { validateAgentFeat } from './agent-feat-ledger.mjs';

export const LEVEL8_ORGANIZATION_SCHEMA_VERSION = 1;

const ACTIONABLE_STATES = new Set(['open', 'unverified']);
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const UNIT_KEYS = new Set([
  'schemaVersion',
  'unitId',
  'role',
  'mission',
  'capabilities',
  'workloadClasses',
  'persistent',
  'createdAt',
  'zeroCredit',
  'providerRequired',
]);

export function createOrganizationUnit(input, { createdAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('organization-unit-input-invalid');
  return validateOrganizationUnit({
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    unitId: checkedSlug(input.unitId, 'organization-unit-id-invalid'),
    role: checkedSlug(input.role, 'organization-unit-role-invalid'),
    mission: checkedText(input.mission, 1200, 'organization-unit-mission-invalid'),
    capabilities: normalizeSlugs(input.capabilities ?? [], 64, 'organization-unit-capabilities-invalid'),
    workloadClasses: normalizeSlugs(input.workloadClasses ?? [], 32, 'organization-unit-workloads-invalid'),
    persistent: input.persistent === true,
    createdAt: checkedTimestamp(createdAt, 'organization-unit-created-at-invalid'),
    zeroCredit: true,
    providerRequired: false,
  });
}

export function validateOrganizationUnit(value) {
  exact(value, UNIT_KEYS, 'organization-unit-invalid');
  if (value.schemaVersion !== LEVEL8_ORGANIZATION_SCHEMA_VERSION) fail('organization-unit-schema-invalid');
  checkedSlug(value.unitId, 'organization-unit-id-invalid');
  checkedSlug(value.role, 'organization-unit-role-invalid');
  checkedText(value.mission, 1200, 'organization-unit-mission-invalid');
  normalizeSlugs(value.capabilities, 64, 'organization-unit-capabilities-invalid');
  normalizeSlugs(value.workloadClasses, 32, 'organization-unit-workloads-invalid');
  if (value.persistent !== true) fail('organization-unit-persistence-required');
  checkedTimestamp(value.createdAt, 'organization-unit-created-at-invalid');
  if (value.zeroCredit !== true || value.providerRequired !== false) fail('organization-unit-credit-boundary-invalid');
  return deepFreeze(structuredClone(value));
}

export function planOrganizationUnits({
  entityId,
  parentAgentId,
  existingAgents = [],
  existingUnits = [],
  workloadGaps = [],
  createdAt = new Date().toISOString(),
} = {}) {
  checkedEntity(entityId);
  checkedSlug(parentAgentId, 'organization-parent-agent-invalid');
  checkedTimestamp(createdAt, 'organization-plan-created-at-invalid');
  if (!Array.isArray(existingAgents) || !Array.isArray(existingUnits) || !Array.isArray(workloadGaps) || workloadGaps.length > 1024) {
    fail('organization-plan-input-invalid');
  }

  const agents = existingAgents.map(validateChildAgentManifest);
  const units = existingUnits.map(validateOrganizationUnit);
  const coveredCapabilities = new Set([
    ...agents.flatMap((agent) => agent.capabilities),
    ...units.flatMap((unit) => unit.capabilities),
  ]);
  const coveredWorkloads = new Set(units.flatMap((unit) => unit.workloadClasses));
  const grouped = new Map();

  for (const rawGap of workloadGaps) {
    const gap = validateWorkloadGap(rawGap);
    if (!ACTIONABLE_STATES.has(gap.state) || coveredCapabilities.has(gap.id)) continue;
    const key = gap.workloadClass;
    const current = grouped.get(key) ?? [];
    current.push(gap);
    grouped.set(key, current);
  }

  const plans = [];
  for (const [workloadClass, gaps] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (coveredWorkloads.has(workloadClass)) continue;
    const orderedGaps = [...gaps].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id));
    const primary = orderedGaps[0];
    const unitId = `${workloadClass}-director`.slice(0, 96).replace(/-+$/g, '');
    const unit = createOrganizationUnit({
      unitId,
      role: unitId,
      mission: `Coordinate ${workloadClass} work for Mahoraga: ${orderedGaps.map((gap) => gap.summary).join(' ')}`.slice(0, 1200),
      capabilities: orderedGaps.map((gap) => gap.id),
      workloadClasses: [workloadClass],
      persistent: true,
    }, { createdAt });
    plans.push(deepFreeze({
      schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
      entityId,
      parentAgentId,
      gapId: primary.id,
      gapIds: orderedGaps.map((gap) => gap.id).sort(),
      priority: primary.priority,
      unit,
      zeroCredit: true,
      providerRequired: false,
    }));
  }

  return deepFreeze(plans.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.gapId.localeCompare(b.gapId)));
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
  checkedEntity(entityId);
  checkedSlug(parentAgentId, 'organization-parent-agent-invalid');
  checkedTimestamp(createdAt, 'organization-graph-created-at-invalid');
  if (!Array.isArray(existingAgents) || !Array.isArray(units) || !Array.isArray(workloadGaps)) fail('organization-graph-input-invalid');

  const agents = existingAgents.map(validateChildAgentManifest).sort((a, b) => a.agentId.localeCompare(b.agentId));
  const uniqueUnits = new Map();
  for (const raw of units) {
    const unit = validateOrganizationUnit(raw);
    const current = uniqueUnits.get(unit.unitId);
    if (current && sameUnitDefinition(current, unit) === false) fail('organization-unit-conflict');
    if (!current) uniqueUnits.set(unit.unitId, unit);
  }
  const orderedUnits = [...uniqueUnits.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
  const gaps = workloadGaps.map(validateWorkloadGap).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id));
  const sharedFeatIds = validateFeatLedger(featLedger);

  const core = {
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    entityId,
    parentAgentId,
    singularAuthority: true,
    agents,
    units: orderedUnits,
    workloadGaps: gaps,
    sharedFeatIds,
    createdAt,
    zeroCredit: true,
    providerRequired: false,
  };
  const fingerprint = digest({ ...core, createdAt: undefined });
  return deepFreeze({ ...core, fingerprint });
}

function validateFeatLedger(ledger) {
  if (ledger === null) return deepFreeze([]);
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || ledger.schemaVersion !== 1 || !Array.isArray(ledger.feats) || !Array.isArray(ledger.reusableFeatIds)) {
    fail('organization-feat-ledger-invalid');
  }
  if (typeof ledger.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(ledger.sourceFingerprint)) fail('organization-feat-ledger-invalid');
  const feats = ledger.feats.map(validateAgentFeat);
  const reusable = new Set(feats.filter((feat) => feat.reusable).map((feat) => feat.featId));
  if (new Set(ledger.reusableFeatIds).size !== ledger.reusableFeatIds.length) fail('organization-feat-ledger-invalid');
  for (const id of ledger.reusableFeatIds) {
    if (typeof id !== 'string' || !/^feat-[a-f0-9]{24}$/.test(id) || !reusable.has(id)) fail('organization-feat-ledger-invalid');
  }
  return deepFreeze([...ledger.reusableFeatIds].sort());
}

function validateWorkloadGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('organization-workload-gap-invalid');
  const allowed = new Set(['id', 'state', 'priority', 'workloadClass', 'summary', 'dependency']);
  if (Object.keys(value).some((key) => !allowed.has(key)) || Object.keys(value).length !== allowed.size) fail('organization-workload-gap-invalid');
  const gap = {
    id: checkedSlug(value.id, 'organization-workload-gap-invalid'),
    state: typeof value.state === 'string' ? value.state : fail('organization-workload-gap-invalid'),
    priority: PRIORITIES.has(value.priority) ? value.priority : fail('organization-workload-gap-invalid'),
    workloadClass: checkedSlug(value.workloadClass, 'organization-workload-gap-invalid'),
    summary: checkedText(value.summary, 1000, 'organization-workload-gap-invalid'),
    dependency: checkedText(value.dependency, 2000, 'organization-workload-gap-invalid'),
  };
  return deepFreeze(gap);
}

function checkedEntity(value) { if (value !== 'mahoraga') fail('organization-entity-must-be-mahoraga'); return value; }
function sameUnitDefinition(left, right) {
  const { createdAt: leftCreatedAt, ...leftDefinition } = left;
  const { createdAt: rightCreatedAt, ...rightDefinition } = right;
  return JSON.stringify(leftDefinition) === JSON.stringify(rightDefinition);
}
function normalizeSlugs(value, max, code) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(code);
  return value.map((item) => checkedSlug(item, code)).sort();
}
function checkedSlug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,95}$/.test(value)) fail(code); return value; }
function checkedText(value, max, code) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(code); return value; }
function checkedTimestamp(value, code) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function priorityRank(value) { return ({ critical: 0, high: 1, medium: 2, low: 3 })[value] ?? 9; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

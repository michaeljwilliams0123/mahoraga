import crypto from 'node:crypto';

export const LEVEL8_ORGANIZATION_SCHEMA_VERSION = 1;

const UNIT_KEYS = new Set([
  'schemaVersion', 'unitId', 'role', 'mission', 'capabilities', 'workloadClasses',
  'persistent', 'createdAt', 'zeroCredit', 'providerRequired',
]);

export function createOrganizationUnit(input, { createdAt = new Date().toISOString() } = {}) {
  return validateOrganizationUnit({
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    unitId: checkedSlug(input.unitId, 'organization-unit-id-invalid'),
    role: checkedSlug(input.role, 'organization-unit-role-invalid'),
    mission: checkedText(input.mission, 2000, 'organization-unit-mission-invalid'),
    capabilities: normalizeSlugs(input.capabilities ?? [], 'organization-unit-capabilities-invalid'),
    workloadClasses: normalizeSlugs(input.workloadClasses ?? [], 'organization-unit-workloads-invalid'),
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
  checkedText(value.mission, 2000, 'organization-unit-mission-invalid');
  normalizeSlugs(value.capabilities, 'organization-unit-capabilities-invalid');
  normalizeSlugs(value.workloadClasses, 'organization-unit-workloads-invalid');
  if (typeof value.persistent !== 'boolean') fail('organization-unit-persistent-invalid');
  checkedTimestamp(value.createdAt, 'organization-unit-created-at-invalid');
  if (value.zeroCredit !== true) fail('organization-unit-zero-credit-required');
  if (value.providerRequired !== false) fail('organization-unit-provider-required-invalid');
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
  checkedSlug(entityId, 'organization-entity-id-invalid');
  checkedSlug(parentAgentId, 'organization-parent-agent-id-invalid');
  checkedTimestamp(createdAt, 'organization-plan-created-at-invalid');
  if (!Array.isArray(existingAgents) || !Array.isArray(existingUnits) || !Array.isArray(workloadGaps)) fail('organization-plan-input-invalid');

  const units = existingUnits.map(validateOrganizationUnit);
  const coveredWorkloads = new Set(units.flatMap((unit) => unit.workloadClasses));
  const coveredCapabilities = new Set(units.flatMap((unit) => unit.capabilities));

  for (const agent of existingAgents) {
    for (const capability of Array.isArray(agent?.capabilities) ? agent.capabilities : []) coveredCapabilities.add(capability);
    for (const workload of Array.isArray(agent?.workloadClasses) ? agent.workloadClasses : []) coveredWorkloads.add(workload);
  }

  const plans = [];
  for (const gap of workloadGaps) {
    if (!gap || typeof gap !== 'object' || gap.state !== 'open') continue;
    const gapId = checkedSlug(gap.id, 'organization-gap-id-invalid');
    const workloadClass = checkedSlug(gap.workloadClass, 'organization-gap-workload-invalid');
    if (coveredWorkloads.has(workloadClass) || coveredCapabilities.has(gapId)) continue;
    plans.push(deepFreeze({
      schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
      entityId,
      parentAgentId,
      gapId,
      workloadClass,
      priority: checkedSlug(gap.priority, 'organization-gap-priority-invalid'),
      summary: checkedText(gap.summary, 1000, 'organization-gap-summary-invalid'),
      dependency: checkedSlug(gap.dependency, 'organization-gap-dependency-invalid'),
      proposedUnitId: gapId,
      createdAt,
      zeroCredit: true,
      providerRequired: false,
    }));
  }
  return deepFreeze(plans.sort((a, b) => a.gapId.localeCompare(b.gapId)));
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
  checkedSlug(entityId, 'organization-entity-id-invalid');
  checkedSlug(parentAgentId, 'organization-parent-agent-id-invalid');
  checkedTimestamp(createdAt, 'organization-graph-created-at-invalid');
  if (!Array.isArray(existingAgents) || !Array.isArray(units) || !Array.isArray(workloadGaps)) fail('organization-graph-input-invalid');

  const byId = new Map();
  for (const raw of units) {
    const unit = validateOrganizationUnit(raw);
    const prior = byId.get(unit.unitId);
    if (prior && stable(prior) !== stable(unit)) fail('organization-unit-conflict');
    byId.set(unit.unitId, unit);
  }

  const orderedUnits = [...byId.values()].sort((a, b) => a.unitId.localeCompare(b.unitId));
  const plannedUnits = planOrganizationUnits({
    entityId,
    parentAgentId,
    existingAgents,
    existingUnits: orderedUnits,
    workloadGaps,
    createdAt,
  });
  const sharedFeatIds = featLedger === null ? [] : normalizeFeatLedger(featLedger);
  const body = {
    schemaVersion: LEVEL8_ORGANIZATION_SCHEMA_VERSION,
    entityId,
    parentAgentId,
    singularAuthority: true,
    units: orderedUnits,
    plannedUnits,
    sharedFeatIds,
    createdAt,
    zeroCredit: true,
    providerRequired: false,
  };
  return deepFreeze({ ...body, fingerprint: sha256(stable(body)) });
}

function normalizeFeatLedger(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.reusableFeatIds)) fail('organization-feat-ledger-invalid');
  const ids = [...value.reusableFeatIds];
  if (new Set(ids).size !== ids.length) fail('organization-feat-ledger-invalid');
  for (const id of ids) if (typeof id !== 'string' || !/^feat-[a-f0-9]{24}$/.test(id)) fail('organization-feat-ledger-invalid');
  return ids.sort();
}

function normalizeSlugs(value, code) { if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail(code); return value.map((item) => checkedSlug(item, code)).sort(); }
function checkedSlug(value, code) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)) fail(code); return value; }
function checkedText(value, max, code) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(code); return value; }
function checkedTimestamp(value, code) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function exact(value, keys, code) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

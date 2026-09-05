const ACTIONABLE_STATES = new Set(['open', 'unverified']);
const MANIFEST_KEYS = new Set(['schemaVersion', 'agentId', 'parentAgentId', 'role', 'mission', 'capabilities', 'privileges', 'permanent', 'selfUpdate', 'zeroCredit', 'sharedFeatLedger', 'ownerApprovalRequired', 'platformAuthorizationRequired', 'createdAt']);

export function createChildAgentManifest(input, { createdAt = new Date().toISOString() } = {}) {
  return validateChildAgentManifest({
    schemaVersion: 1,
    agentId: input.agentId,
    parentAgentId: input.parentAgentId,
    role: input.role,
    mission: input.mission,
    capabilities: normalizeSlugs(input.capabilities ?? [], 32, 'agent capabilities'),
    privileges: normalizeSlugs(input.privileges ?? [], 32, 'agent privileges'),
    permanent: true,
    selfUpdate: true,
    zeroCredit: true,
    sharedFeatLedger: true,
    ownerApprovalRequired: false,
    platformAuthorizationRequired: true,
    createdAt,
  });
}

export function validateChildAgentManifest(value) {
  exact(value, MANIFEST_KEYS, 'child agent manifest');
  if (value.schemaVersion !== 1) fail('child-agent-schema-invalid');
  checkedSlug(value.agentId, 'agent id');
  checkedSlug(value.parentAgentId, 'parent agent id');
  checkedSlug(value.role, 'agent role');
  checkedText(value.mission, 1000, 'agent mission');
  normalizeSlugs(value.capabilities, 32, 'agent capabilities');
  normalizeSlugs(value.privileges, 32, 'agent privileges');
  if (value.permanent !== true || value.selfUpdate !== true || value.zeroCredit !== true || value.sharedFeatLedger !== true) fail('child-agent-inheritance-invalid');
  if (value.ownerApprovalRequired !== false || value.platformAuthorizationRequired !== true) fail('child-agent-authorization-boundary-invalid');
  checkedTimestamp(value.createdAt, 'agent creation time');
  return deepFreeze(structuredClone(value));
}

export function planChildAgents({ parentAgentId, existingAgents = [], gaps = [], createdAt = new Date().toISOString() } = {}) {
  checkedSlug(parentAgentId, 'parent agent id');
  if (!Array.isArray(existingAgents) || !Array.isArray(gaps) || gaps.length > 512) fail('agent-foundry-input-invalid');
  const existing = existingAgents.map(validateChildAgentManifest);
  const covered = new Set(existing.flatMap((agent) => agent.capabilities));
  const plans = [];
  for (const gap of gaps) {
    validateGap(gap);
    if (!ACTIONABLE_STATES.has(gap.state) || covered.has(gap.id)) continue;
    const role = `${gap.id}-specialist`.slice(0, 64).replace(/-+$/g, '');
    const agentId = `mahoraga-${role}`.slice(0, 64).replace(/-+$/g, '');
    const manifest = createChildAgentManifest({
      agentId,
      parentAgentId,
      role,
      mission: `${gap.summary} ${gap.dependency}`.slice(0, 1000),
      capabilities: [gap.id],
      privileges: ['github-read', 'github-pr-write'],
    }, { createdAt });
    plans.push(deepFreeze({ schemaVersion: 1, gapId: gap.id, priority: gap.priority, manifest }));
  }
  return deepFreeze(plans.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.gapId.localeCompare(b.gapId)));
}

export function applyAgentFoundryPlans(registry, plans = []) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.agents)) fail('agent-registry-invalid');
  checkedSlug(registry.parentAgentId, 'parent agent id');
  if (!Array.isArray(plans) || plans.length > 512) fail('agent-foundry-plan-list-invalid');
  const agents = new Map(registry.agents.map((agent) => {
    const validated = validateChildAgentManifest(agent);
    if (validated.parentAgentId !== registry.parentAgentId) fail('agent-registry-parent-mismatch');
    return [validated.agentId, validated];
  }));
  for (const plan of plans) {
    if (!plan || typeof plan !== 'object' || plan.schemaVersion !== 1 || typeof plan.gapId !== 'string' || !plan.manifest) fail('agent-foundry-plan-invalid');
    const manifest = validateChildAgentManifest(plan.manifest);
    if (manifest.parentAgentId !== registry.parentAgentId) fail('agent-registry-parent-mismatch');
    const current = agents.get(manifest.agentId);
    if (current && !sameAgentDefinition(current, manifest)) fail('agent-registry-conflict');
    if (!current) agents.set(manifest.agentId, manifest);
  }
  return deepFreeze({ schemaVersion: 1, parentAgentId: registry.parentAgentId, agents: [...agents.values()].sort((a, b) => a.agentId.localeCompare(b.agentId)) });
}

function sameAgentDefinition(left, right) {
  const { createdAt: leftCreatedAt, ...leftDefinition } = left;
  const { createdAt: rightCreatedAt, ...rightDefinition } = right;
  return JSON.stringify(leftDefinition) === JSON.stringify(rightDefinition);
}

function validateGap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('agent-foundry-gap-invalid');
  checkedSlug(value.id, 'gap id');
  if (typeof value.state !== 'string') fail('agent-foundry-gap-invalid');
  if (!new Set(['critical', 'high', 'medium', 'low']).has(value.priority)) fail('agent-foundry-gap-invalid');
  checkedText(value.summary, 1000, 'gap summary');
  checkedText(value.dependency, 2000, 'gap dependency');
}
function priorityRank(value) { return ({ critical: 0, high: 1, medium: 2, low: 3 })[value] ?? 9; }
function normalizeSlugs(value, max, label) { if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(`${label.replace(/ /g, '-')}-invalid`); return value.map((item) => checkedSlug(item, label)).sort(); }
function checkedSlug(value, label) { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function checkedText(value, max, label) { if (typeof value !== 'string' || value.trim().length < 1 || value.length > max || /[\0]/.test(value)) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function checkedTimestamp(value, label) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label.replace(/ /g, '-')}-invalid`); return value; }
function exact(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(`${label.replace(/ /g, '-')}-invalid`); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

import { applyAgentFoundryPlans } from "./agent-foundry.mjs";

export const UNATTENDED_FOUNDRY_FLEET_KIND = "unattended-foundry-fleet";
export const UNATTENDED_FOUNDRY_FLEET_SCHEMA_VERSION = 1;

export function emptyFoundryRegistry(parentAgentId = "mahoraga") {
  if (typeof parentAgentId !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(parentAgentId)) {
    fail("foundry-parent-invalid");
  }
  return Object.freeze({
    schemaVersion: 1,
    parentAgentId,
    agents: Object.freeze([]),
  });
}

export function admitUnattendedFoundry({
  registry = null,
  parentAgentId = "mahoraga",
  plans = [],
} = {}) {
  const resolvedParent = registry?.parentAgentId ?? parentAgentId;
  const resolvedBase = registry == null ? emptyFoundryRegistry(resolvedParent) : registry;
  const before = new Set((resolvedBase.agents ?? []).map((agent) => agent.agentId));
  const next = applyAgentFoundryPlans(resolvedBase, plans);
  const admittedAgentIds = next.agents
    .map((agent) => agent.agentId)
    .filter((id) => !before.has(id))
    .sort();
  return Object.freeze({
    registry: next,
    fleet: snapshotFoundryFleet(next, admittedAgentIds),
  });
}

export function snapshotFoundryFleet(registry, admittedAgentIds = []) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.agents)) {
    fail("foundry-registry-invalid");
  }
  const ids = registry.agents.map((agent) => agent.agentId).sort();
  const admitted = [...new Set(admittedAgentIds)].sort();
  return Object.freeze({
    schemaVersion: UNATTENDED_FOUNDRY_FLEET_SCHEMA_VERSION,
    kind: UNATTENDED_FOUNDRY_FLEET_KIND,
    parentAgentId: registry.parentAgentId,
    agentCount: ids.length,
    admittedCount: admitted.length,
    admittedAgentIds: Object.freeze(admitted),
    agentIds: Object.freeze(ids),
    creditCost: 0,
    paidFallback: false,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

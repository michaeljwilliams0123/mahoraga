import { createHash } from "node:crypto";

export const UNIVERSAL_CAPABILITY_GRAPH_SCHEMA_VERSION = 1;

const GRAPH_KEYS = new Set([
  "schemaVersion", "kind", "observedAt", "nodes", "edges", "fingerprint", "creditCost", "paidFallback",
]);
const EDGE_TYPES = new Set(["provides", "fallback", "declares"]);
const EVIDENCE_RANK = Object.freeze({ observed: 0, inferred: 1, verified: 2 });

export function buildUniversalCapabilityGraph({ capabilityRoutes = [], agents = [], observedAt = new Date().toISOString() } = {}) {
  canonicalTimestamp(observedAt, "capability-graph-observed-at-invalid");
  if (!Array.isArray(capabilityRoutes) || capabilityRoutes.length > 4096) fail("capability-graph-routes-invalid");
  if (!Array.isArray(agents) || agents.length > 1024) fail("capability-graph-agents-invalid");

  const nodes = new Map();
  const edges = new Map();
  const routesByCapability = new Map();

  for (const raw of capabilityRoutes) {
    const route = normalizeRoute(raw);
    put(nodes, workerNode(route), "capability-graph-node-conflict");
    const list = routesByCapability.get(route.capability) ?? [];
    list.push(route);
    routesByCapability.set(route.capability, list);
    put(edges, providesEdge(route), "capability-graph-edge-conflict");
  }

  for (const raw of capabilityRoutes) {
    const route = normalizeRoute(raw);
    for (const fallbackWorkerId of route.fallbackWorkerIds) {
      if (!nodes.has(`worker:${fallbackWorkerId}`)) continue;
      put(edges, simpleEdge("fallback", `worker:${route.workerId}`, `worker:${fallbackWorkerId}`), "capability-graph-edge-conflict");
    }
  }

  const normalizedAgents = agents.map(normalizeAgent).sort((left, right) => left.agentId.localeCompare(right.agentId));
  for (const agent of normalizedAgents) {
    put(nodes, agentNode(agent), "capability-graph-node-conflict");
    for (const capability of agent.capabilities) {
      if (!routesByCapability.has(capability)) routesByCapability.set(capability, []);
      put(edges, simpleEdge("declares", `agent:${agent.agentId}`, `capability:${capability}`), "capability-graph-edge-conflict");
    }
  }

  for (const [capability, routes] of routesByCapability) {
    put(nodes, capabilityNode(capability, routes), "capability-graph-node-conflict");
  }

  const core = {
    schemaVersion: UNIVERSAL_CAPABILITY_GRAPH_SCHEMA_VERSION,
    kind: "universal-capability-graph",
    observedAt,
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
    creditCost: 0,
    paidFallback: false,
  };
  return validateUniversalCapabilityGraph({ ...core, fingerprint: digest(core) });
}

export function validateUniversalCapabilityGraph(value) {
  exact(value, GRAPH_KEYS, "capability-graph-invalid");
  if (value.schemaVersion !== UNIVERSAL_CAPABILITY_GRAPH_SCHEMA_VERSION || value.kind !== "universal-capability-graph") fail("capability-graph-invalid");
  canonicalTimestamp(value.observedAt, "capability-graph-observed-at-invalid");
  if (value.creditCost !== 0 || value.paidFallback !== false) fail("capability-graph-paid-contamination");
  if (!Array.isArray(value.nodes) || value.nodes.length > 8192 || !Array.isArray(value.edges) || value.edges.length > 16384) fail("capability-graph-invalid");

  const nodeIds = new Set();
  const nodes = value.nodes.map((node) => validateNode(node));
  for (const node of nodes) {
    if (nodeIds.has(node.id)) fail("capability-graph-node-invalid");
    nodeIds.add(node.id);
  }
  if (!sortedById(nodes)) fail("capability-graph-node-order-invalid");

  const edgeIds = new Set();
  const edges = value.edges.map((edge) => validateEdge(edge));
  for (const edge of edges) {
    if (edgeIds.has(edge.id) || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) fail("capability-graph-edge-invalid");
    edgeIds.add(edge.id);
  }
  if (!sortedById(edges)) fail("capability-graph-edge-order-invalid");

  const core = {
    schemaVersion: UNIVERSAL_CAPABILITY_GRAPH_SCHEMA_VERSION,
    kind: "universal-capability-graph",
    observedAt: value.observedAt,
    nodes,
    edges,
    creditCost: 0,
    paidFallback: false,
  };
  if (typeof value.fingerprint !== "string" || value.fingerprint !== digest(core)) fail("capability-graph-fingerprint-invalid");
  return deepFreeze({ ...core, fingerprint: value.fingerprint });
}

function normalizeRoute(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capability-graph-route-invalid");
  const route = {
    capability: token(value.capability, 96, "capability-graph-capability-invalid"),
    workerId: slug(value.workerId, "capability-graph-worker-invalid"),
    workerLabel: text(value.workerLabel, 160, "capability-graph-worker-label-invalid"),
    enabled: boolean(value.enabled, "capability-graph-worker-invalid"),
    availability: token(value.availability, 64, "capability-graph-availability-invalid"),
    routable: boolean(value.routable, "capability-graph-route-invalid"),
    evidenceLevel: evidence(value.evidenceLevel),
    routingReason: nullableToken(value.routingReason, 96, "capability-graph-routing-reason-invalid"),
    interfaceType: token(value.interfaceType, 64, "capability-graph-interface-invalid"),
    permissionClass: token(value.permissionClass, 96, "capability-graph-permission-invalid"),
    reliability: integer(value.reliability, 0, 100, "capability-graph-reliability-invalid"),
    requiresAttendedDesktop: boolean(value.requiresAttendedDesktop, "capability-graph-attendance-invalid"),
    executionType: token(value.executionType, 64, "capability-graph-execution-type-invalid"),
    latencyMs: integer(value.latencyMs, 0, 3_600_000, "capability-graph-latency-invalid"),
    maximumWorkload: integer(value.maximumWorkload, 1, 1024, "capability-graph-workload-invalid"),
    workload: integer(value.workload, 0, 1024, "capability-graph-workload-invalid"),
    fallbackWorkerIds: slugList(value.fallbackWorkerIds ?? [], 64, "capability-graph-fallback-invalid"),
    costClass: token(value.costClass, 64, "capability-graph-cost-invalid"),
    dataClasses: tokenList(value.dataClasses, 32, 64, "capability-graph-data-classes-invalid"),
    executionPlane: token(value.executionPlane, 96, "capability-graph-execution-plane-invalid"),
    economicTier: value.economicTier === undefined ? economicTierForCostClass(value.costClass) : integer(value.economicTier, 0, 8, "capability-graph-cost-invalid"),
  };
  if (!route.routable && route.routingReason === null) fail("capability-graph-routing-reason-invalid");
  return deepFreeze(route);
}

function normalizeAgent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1) fail("capability-graph-agent-invalid");
  const agent = {
    agentId: slug(value.agentId, "capability-graph-agent-invalid"),
    parentAgentId: slug(value.parentAgentId, "capability-graph-agent-invalid"),
    role: slug(value.role, "capability-graph-agent-invalid"),
    capabilities: tokenList(value.capabilities, 64, 96, "capability-graph-agent-capabilities-invalid"),
    privileges: slugList(value.privileges, 64, "capability-graph-agent-privileges-invalid"),
    permanent: value.permanent,
    zeroCredit: value.zeroCredit,
    platformAuthorizationRequired: value.platformAuthorizationRequired,
  };
  if (agent.permanent !== true || agent.zeroCredit !== true || agent.platformAuthorizationRequired !== true) fail("capability-graph-agent-boundary-invalid");
  return deepFreeze(agent);
}

function workerNode(route) {
  return deepFreeze({
    id: `worker:${route.workerId}`,
    type: "worker",
    workerId: route.workerId,
    label: route.workerLabel,
    enabled: route.enabled,
    availability: route.availability,
    executionPlane: route.executionPlane,
    costClass: route.costClass,
    permissionClass: route.permissionClass,
    requiresAttendedDesktop: route.requiresAttendedDesktop,
  });
}

function capabilityNode(capability, routes) {
  const routable = routes.some((route) => route.routable);
  const evidenceLevel = routes.reduce((best, route) => EVIDENCE_RANK[route.evidenceLevel] > EVIDENCE_RANK[best] ? route.evidenceLevel : best, "observed");
  const routingReasons = [...new Set(routes.filter((route) => !route.routable).map((route) => route.routingReason ?? "not-routable"))].sort();
  if (routes.length === 0) routingReasons.push("no-live-route");
  return deepFreeze({ id: `capability:${capability}`, type: "capability", capability, routable, evidenceLevel, routingReasons });
}

function agentNode(agent) {
  return deepFreeze({
    id: `agent:${agent.agentId}`,
    type: "agent",
    agentId: agent.agentId,
    parentAgentId: agent.parentAgentId,
    role: agent.role,
    capabilities: agent.capabilities,
    privileges: agent.privileges,
    permanent: true,
    zeroCredit: true,
    platformAuthorizationRequired: true,
  });
}

function providesEdge(route) {
  return deepFreeze({
    id: `provides:${route.workerId}:${route.capability}`,
    type: "provides",
    from: `worker:${route.workerId}`,
    to: `capability:${route.capability}`,
    workerId: route.workerId,
    capability: route.capability,
    routable: route.routable,
    evidenceLevel: route.evidenceLevel,
    routingReason: route.routingReason,
    dataClasses: route.dataClasses,
    executionPlane: route.executionPlane,
    permissionClass: route.permissionClass,
    requiresAttendedDesktop: route.requiresAttendedDesktop,
    reliability: route.reliability,
    latencyMs: route.latencyMs,
    workload: route.workload,
    costClass: route.costClass,
    economicTier: route.economicTier,
  });
}

function simpleEdge(type, from, to) {
  return deepFreeze({ id: `${type}:${from}:${to}`, type, from, to });
}

function validateNode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capability-graph-node-invalid");
  if (value.type === "worker") {
    exact(value, new Set(["id", "type", "workerId", "label", "enabled", "availability", "executionPlane", "costClass", "permissionClass", "requiresAttendedDesktop"]), "capability-graph-node-invalid");
    const workerId = slug(value.workerId, "capability-graph-node-invalid");
    if (value.id !== `worker:${workerId}`) fail("capability-graph-node-invalid");
    text(value.label, 160, "capability-graph-node-invalid");
    boolean(value.enabled, "capability-graph-node-invalid");
    token(value.availability, 64, "capability-graph-node-invalid");
    token(value.executionPlane, 96, "capability-graph-node-invalid");
    token(value.costClass, 64, "capability-graph-node-invalid");
    token(value.permissionClass, 96, "capability-graph-node-invalid");
    boolean(value.requiresAttendedDesktop, "capability-graph-node-invalid");
  } else if (value.type === "capability") {
    exact(value, new Set(["id", "type", "capability", "routable", "evidenceLevel", "routingReasons"]), "capability-graph-node-invalid");
    const capability = token(value.capability, 96, "capability-graph-node-invalid");
    if (value.id !== `capability:${capability}`) fail("capability-graph-node-invalid");
    boolean(value.routable, "capability-graph-node-invalid");
    evidence(value.evidenceLevel);
    tokenList(value.routingReasons, 128, 96, "capability-graph-node-invalid");
  } else if (value.type === "agent") {
    exact(value, new Set(["id", "type", "agentId", "parentAgentId", "role", "capabilities", "privileges", "permanent", "zeroCredit", "platformAuthorizationRequired"]), "capability-graph-node-invalid");
    const agentId = slug(value.agentId, "capability-graph-node-invalid");
    if (value.id !== `agent:${agentId}` || value.permanent !== true || value.zeroCredit !== true || value.platformAuthorizationRequired !== true) fail("capability-graph-node-invalid");
    slug(value.parentAgentId, "capability-graph-node-invalid");
    slug(value.role, "capability-graph-node-invalid");
    tokenList(value.capabilities, 64, 96, "capability-graph-node-invalid");
    slugList(value.privileges, 64, "capability-graph-node-invalid");
  } else fail("capability-graph-node-invalid");
  return structuredClone(value);
}

function validateEdge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !EDGE_TYPES.has(value.type)) fail("capability-graph-edge-invalid");
  if (value.type === "provides") {
    exact(value, new Set(["id", "type", "from", "to", "workerId", "capability", "routable", "evidenceLevel", "routingReason", "dataClasses", "executionPlane", "permissionClass", "requiresAttendedDesktop", "reliability", "latencyMs", "workload", "costClass", "economicTier"]), "capability-graph-edge-invalid");
    const workerId = slug(value.workerId, "capability-graph-edge-invalid");
    const capability = token(value.capability, 96, "capability-graph-edge-invalid");
    if (value.id !== `provides:${workerId}:${capability}` || value.from !== `worker:${workerId}` || value.to !== `capability:${capability}`) fail("capability-graph-edge-invalid");
    boolean(value.routable, "capability-graph-edge-invalid");
    evidence(value.evidenceLevel);
    nullableToken(value.routingReason, 96, "capability-graph-edge-invalid");
    tokenList(value.dataClasses, 32, 64, "capability-graph-edge-invalid");
    token(value.executionPlane, 96, "capability-graph-edge-invalid");
    token(value.permissionClass, 96, "capability-graph-edge-invalid");
    boolean(value.requiresAttendedDesktop, "capability-graph-edge-invalid");
    integer(value.reliability, 0, 100, "capability-graph-edge-invalid");
    integer(value.latencyMs, 0, 3_600_000, "capability-graph-edge-invalid");
    integer(value.workload, 0, 1024, "capability-graph-edge-invalid");
    token(value.costClass, 64, "capability-graph-edge-invalid");
    integer(value.economicTier, 0, 8, "capability-graph-edge-invalid");
  } else {
    exact(value, new Set(["id", "type", "from", "to"]), "capability-graph-edge-invalid");
    if (value.id !== `${value.type}:${value.from}:${value.to}`) fail("capability-graph-edge-invalid");
  }
  return structuredClone(value);
}

function put(map, value, code) {
  const current = map.get(value.id);
  if (current && JSON.stringify(current) !== JSON.stringify(value)) fail(code);
  if (!current) map.set(value.id, value);
}

function evidence(value) {
  if (!Object.hasOwn(EVIDENCE_RANK, value)) fail("capability-graph-evidence-invalid");
  return value;
}

function slugList(value, max, code) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(code);
  return value.map((item) => slug(item, code)).sort();
}

function tokenList(value, max, length, code) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length) fail(code);
  return value.map((item) => token(item, length, code)).sort();
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function token(value, max, code) {
  if (typeof value !== "string" || value.length < 2 || value.length > max || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(code);
  return value;
}

function nullableToken(value, max, code) {
  if (value === null) return null;
  return token(value, max, code);
}

function text(value, max, code) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > max || /[\0\r\n]/.test(value)) fail(code);
  return value;
}

function boolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function integer(value, min, max, code) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code);
  return value;
}

function canonicalTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code);
}

function sortedById(values) {
  return values.every((value, index) => index === 0 || values[index - 1].id.localeCompare(value.id) < 0);
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
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

function economicTierForCostClass(costClass) {
  if (costClass === "deterministic") return 0;
  if (costClass === "local-model") return 1;
  if (costClass === "cloud-open-weight") return 2;
  if (costClass === "licensed-cloud") return 3;
  if (costClass === "metered-cloud") return 4;
  return 8;
}

import { createHash } from "node:crypto";
import { validateUniversalCapabilityGraph } from "./universal-capability-graph.mjs";

export const DELEGATED_WORK_FABRIC_SCHEMA_VERSION = 1;

const WORK_CLASSES = new Set(["assigned", "derived", "preventive", "opportunity", "institutional", "evolution"]);
const REQUEST_KEYS = new Set([
  "workId", "objectiveId", "workClass", "capability", "dataClass", "authorityRef", "attendedSessionRef", "preferredAgentId",
]);

export function planDelegatedWork({ graph, requests = [] } = {}) {
  const capabilityGraph = validateUniversalCapabilityGraph(graph);
  if (!Array.isArray(requests) || requests.length > 2048) fail("delegation-requests-invalid");
  const normalized = requests.map(normalizeRequest).sort((left, right) => left.workId.localeCompare(right.workId));
  if (new Set(normalized.map((request) => request.workId)).size !== normalized.length) fail("delegation-work-duplicate");

  const assigned = [];
  const waiting = [];
  const blocked = [];
  for (const request of normalized) {
    const result = planOne(capabilityGraph, request);
    if (result.state === "assigned") assigned.push(result.value);
    if (result.state === "waiting") waiting.push(result.value);
    if (result.state === "blocked") blocked.push(result.value);
  }

  const core = {
    schemaVersion: DELEGATED_WORK_FABRIC_SCHEMA_VERSION,
    kind: "delegated-work-plan",
    graphFingerprint: capabilityGraph.fingerprint,
    assigned,
    waiting,
    blocked,
    creditCost: 0,
    paidFallback: false,
  };
  return deepFreeze({ ...core, fingerprint: digest(core) });
}

function planOne(graph, request) {
  const capabilityNode = graph.nodes.find((node) => node.type === "capability" && node.capability === request.capability);
  if (!capabilityNode) return disposition("blocked", request, "capability-not-declared");

  if (request.preferredAgentId !== null) {
    const declared = graph.edges.some((edge) => edge.type === "declares"
      && edge.from === `agent:${request.preferredAgentId}`
      && edge.to === `capability:${request.capability}`);
    if (!declared) return disposition("blocked", request, "agent-capability-not-declared");
  }

  const routes = graph.edges.filter((edge) => edge.type === "provides" && edge.capability === request.capability);
  if (routes.length === 0) return disposition("waiting", request, "no-live-route");
  const dataCompatible = routes.filter((route) => route.dataClasses.includes(request.dataClass));
  if (dataCompatible.length === 0) return disposition("blocked", request, "data-class-not-supported");
  const routable = dataCompatible.filter((route) => route.routable).sort(compareRoutes);
  if (routable.length === 0) {
    const observed = [...dataCompatible].sort(compareRoutes)[0];
    return disposition("waiting", request, observed.routingReason ?? capabilityNode.routingReasons[0] ?? "capability-not-routable");
  }

  const selected = routable[0];
  if (selected.requiresAttendedDesktop && request.attendedSessionRef === null) {
    return disposition("blocked", request, "attended-session-required");
  }
  return {
    state: "assigned",
    value: deepFreeze({
      workId: request.workId,
      objectiveId: request.objectiveId,
      workClass: request.workClass,
      capability: request.capability,
      workerId: selected.workerId,
      agentId: request.preferredAgentId,
      authorityRef: request.authorityRef,
      attendedSessionRef: request.attendedSessionRef,
      evidenceLevel: selected.evidenceLevel,
      executionPlane: selected.executionPlane,
    }),
  };
}

function disposition(state, request, reason) {
  return {
    state,
    value: deepFreeze({
      workId: request.workId,
      objectiveId: request.objectiveId,
      workClass: request.workClass,
      capability: request.capability,
      reason: token(reason, 96, "delegation-reason-invalid"),
    }),
  };
}

function normalizeRequest(value) {
  exact(value, REQUEST_KEYS, "delegation-request-invalid");
  const request = {
    workId: slug(value.workId, "delegation-work-id-invalid"),
    objectiveId: slug(value.objectiveId, "delegation-objective-id-invalid"),
    workClass: value.workClass,
    capability: token(value.capability, 96, "delegation-capability-invalid"),
    dataClass: token(value.dataClass, 64, "delegation-data-class-invalid"),
    authorityRef: value.authorityRef,
    attendedSessionRef: nullableSlug(value.attendedSessionRef, "delegation-attended-session-invalid"),
    preferredAgentId: nullableSlug(value.preferredAgentId, "delegation-agent-invalid"),
  };
  if (!WORK_CLASSES.has(request.workClass)) fail("delegation-work-class-invalid");
  if (request.authorityRef === null || request.authorityRef === undefined) fail("delegation-authority-required");
  request.authorityRef = slug(request.authorityRef, "delegation-authority-invalid");
  return deepFreeze(request);
}

function compareRoutes(left, right) {
  return left.workload - right.workload
    || left.latencyMs - right.latencyMs
    || right.reliability - left.reliability
    || left.workerId.localeCompare(right.workerId);
}

function nullableSlug(value, code) {
  if (value === null) return null;
  return slug(value, code);
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function token(value, max, code) {
  if (typeof value !== "string" || value.length < 2 || value.length > max || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(code);
  return value;
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code);
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

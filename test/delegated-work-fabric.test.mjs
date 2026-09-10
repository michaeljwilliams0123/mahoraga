import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUniversalCapabilityGraph,
  validateUniversalCapabilityGraph,
} from "../src/universal-capability-graph.mjs";
import { planDelegatedWork } from "../src/delegated-work-fabric.mjs";

const NOW = "2026-09-08T18:00:00.000Z";

function desktopRoute(overrides = {}) {
  return {
    capability: "desktop.filesystem",
    workerId: "desktop",
    workerLabel: "Desktop Worker",
    enabled: true,
    availability: "live",
    routable: true,
    evidenceLevel: "verified",
    routingReason: null,
    interfaceType: "desktop-automation",
    permissionClass: "interactive-desktop",
    reliability: 75,
    requiresAttendedDesktop: true,
    executionType: "interactive-session",
    latencyMs: 1000,
    maximumWorkload: 1,
    workload: 0,
    fallbackWorkerIds: [],
    costClass: "deterministic",
    dataClasses: ["synthetic", "personal", "local-only", "enterprise"],
    executionPlane: "local",
    authorityScopes: ["desktop.read"],
    idempotencyClass: "task-key",
    recoveryClasses: ["refresh-readiness", "retry-route"],
    ...overrides,
  };
}

function desktopAgent() {
  return {
    schemaVersion: 1,
    agentId: "desktop-steward",
    parentAgentId: "mahoraga-steward",
    role: "desktop-steward",
    mission: "Operate bounded attended desktop capabilities.",
    capabilities: ["desktop.filesystem"],
    privileges: ["desktop-read"],
    permanent: true,
    selfUpdate: true,
    zeroCredit: true,
    sharedFeatLedger: true,
    ownerApprovalRequired: false,
    platformAuthorizationRequired: true,
    createdAt: NOW,
  };
}

test("universal graph keeps live routing separate from declared agent capability", () => {
  const graph = buildUniversalCapabilityGraph({
    capabilityRoutes: [desktopRoute()],
    agents: [desktopAgent()],
    observedAt: NOW,
  });

  assert.equal(graph.kind, "universal-capability-graph");
  assert.equal(graph.schemaVersion, 2);
  assert.equal(graph.nodes.find((node) => node.id === "capability:desktop.filesystem").routable, true);
  assert.equal(graph.edges.some((edge) => edge.type === "declares" && edge.from === "agent:desktop-steward"), true);
  const routeEdge = graph.edges.find((edge) => edge.type === "provides");
  assert.equal(routeEdge.routable, true);
  assert.deepEqual(routeEdge.authorityScopes, ["desktop.read"]);
  assert.equal(routeEdge.idempotencyClass, "task-key");
  assert.deepEqual(routeEdge.recoveryClasses, ["refresh-readiness", "retry-route"]);
  assert.match(routeEdge.routeFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(graph.creditCost, 0);
  assert.equal(graph.paidFallback, false);
  assert.equal(Object.isFrozen(graph), true);
});

test("a Foundry declaration never makes an unavailable capability routable", () => {
  const graph = buildUniversalCapabilityGraph({
    capabilityRoutes: [desktopRoute({ routable: false, evidenceLevel: "observed", routingReason: "canary-stale" })],
    agents: [desktopAgent()],
    observedAt: NOW,
  });

  assert.equal(graph.nodes.find((node) => node.id === "capability:desktop.filesystem").routable, false);
  assert.equal(graph.edges.find((edge) => edge.type === "provides").routingReason, "canary-stale");
});

test("graph serialization is deterministic across input ordering", () => {
  const processRoute = desktopRoute({ capability: "desktop.processes" });
  const ordered = buildUniversalCapabilityGraph({
    capabilityRoutes: [desktopRoute(), processRoute],
    agents: [desktopAgent()],
    observedAt: NOW,
  });
  const shuffled = buildUniversalCapabilityGraph({
    capabilityRoutes: [processRoute, desktopRoute()],
    agents: [desktopAgent()],
    observedAt: NOW,
  });

  assert.deepEqual(shuffled, ordered);
  assert.match(ordered.fingerprint, /^[a-f0-9]{64}$/);
});

test("graph validation rejects content-bearing and dangling records", () => {
  const graph = buildUniversalCapabilityGraph({ capabilityRoutes: [desktopRoute()], agents: [], observedAt: NOW });
  assert.deepEqual(validateUniversalCapabilityGraph(structuredClone(graph)), graph);
  assert.throws(() => validateUniversalCapabilityGraph({ ...structuredClone(graph), prompt: "secret" }), /capability-graph-invalid/);
  assert.throws(() => validateUniversalCapabilityGraph({
    ...structuredClone(graph),
    edges: [{ ...graph.edges[0], to: "capability:missing" }],
  }), /capability-graph-edge-invalid/);
});

function filesystemRequest(overrides = {}) {
  return {
    workId: "work-desktop-hash",
    objectiveId: "objective-wave-8",
    workClass: "assigned",
    capability: "desktop.filesystem",
    dataClass: "local-only",
    authorityRef: "authority-wave-8",
    attendedSessionRef: "session-wave-8",
    preferredAgentId: "desktop-steward",
    ...overrides,
  };
}

function desktopGraph(routeOverrides = {}) {
  return buildUniversalCapabilityGraph({
    capabilityRoutes: [desktopRoute(routeOverrides)],
    agents: [desktopAgent()],
    observedAt: NOW,
  });
}

test("delegation selects a verified Windows route and binds objective authority", () => {
  const plan = planDelegatedWork({ graph: desktopGraph(), requests: [filesystemRequest()] });

  assert.deepEqual(plan.assigned, [{
    workId: "work-desktop-hash",
    objectiveId: "objective-wave-8",
    workClass: "assigned",
    capability: "desktop.filesystem",
    workerId: "desktop",
    agentId: "desktop-steward",
    authorityRef: "authority-wave-8",
    attendedSessionRef: "session-wave-8",
    evidenceLevel: "verified",
    executionPlane: "local",
  }]);
  assert.deepEqual(plan.waiting, []);
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.creditCost, 0);
  assert.equal(plan.paidFallback, false);
  assert.equal(Object.isFrozen(plan), true);
});

test("delegation waits for stale evidence without widening the route", () => {
  const plan = planDelegatedWork({
    graph: desktopGraph({ routable: false, evidenceLevel: "observed", routingReason: "canary-stale" }),
    requests: [filesystemRequest()],
  });

  assert.deepEqual(plan.assigned, []);
  assert.equal(plan.waiting[0].reason, "canary-stale");
  assert.equal(plan.waiting[0].workId, "work-desktop-hash");
});

test("delegation blocks incompatible data, missing attendance, and undeclared agents", () => {
  assert.equal(planDelegatedWork({
    graph: desktopGraph(),
    requests: [filesystemRequest({ dataClass: "public" })],
  }).blocked[0].reason, "data-class-not-supported");
  assert.equal(planDelegatedWork({
    graph: desktopGraph(),
    requests: [filesystemRequest({ attendedSessionRef: null })],
  }).blocked[0].reason, "attended-session-required");
  assert.equal(planDelegatedWork({
    graph: desktopGraph(),
    requests: [filesystemRequest({ preferredAgentId: "unknown-agent" })],
  }).blocked[0].reason, "agent-capability-not-declared");
});

test("delegation rejects missing objective authority, duplicate work, and unknown fields", () => {
  assert.throws(() => planDelegatedWork({
    graph: desktopGraph(),
    requests: [filesystemRequest({ authorityRef: null })],
  }), /delegation-authority-required/);
  assert.throws(() => planDelegatedWork({
    graph: desktopGraph(),
    requests: [filesystemRequest(), filesystemRequest()],
  }), /delegation-work-duplicate/);
  assert.throws(() => planDelegatedWork({
    graph: desktopGraph(),
    requests: [{ ...filesystemRequest(), prompt: "do not persist me" }],
  }), /delegation-request-invalid/);
});

test("delegation supports all six Level 8 work classes deterministically", () => {
  const classes = ["assigned", "derived", "preventive", "opportunity", "institutional", "evolution"];
  const requests = classes.map((workClass, index) => filesystemRequest({ workId: `work-${index + 1}`, workClass }));
  const reversed = planDelegatedWork({ graph: desktopGraph(), requests: [...requests].reverse() });
  const ordered = planDelegatedWork({ graph: desktopGraph(), requests });

  assert.deepEqual(reversed, ordered);
  assert.deepEqual(ordered.assigned.map((item) => item.workId), ["work-1", "work-2", "work-3", "work-4", "work-5", "work-6"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUniversalCapabilityGraph,
  validateUniversalCapabilityGraph,
} from "../src/universal-capability-graph.mjs";

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
  assert.equal(graph.nodes.find((node) => node.id === "capability:desktop.filesystem").routable, true);
  assert.equal(graph.edges.some((edge) => edge.type === "declares" && edge.from === "agent:desktop-steward"), true);
  assert.equal(graph.edges.find((edge) => edge.type === "provides").routable, true);
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

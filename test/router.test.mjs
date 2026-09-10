import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { capabilityIndex, routeTask } from "../src/router.mjs";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function verifiedWorkerState(manifest, workerId, processStatus = "live") {
  const worker = manifest.workers.find((item) => item.id === workerId);
  return {
    workerId,
    status: processStatus,
    lastHeartbeatAt: "2026-08-25T11:59:55.000Z",
    readiness: worker.capabilities.map((capability) => ({
      workerId,
      capability,
      processStatus,
      providerStatus: "ready",
      canaryStatus: "verified",
      processObservedAt: "2026-08-25T11:59:55.000Z",
      providerObservedAt: "2026-08-25T11:59:30.000Z",
      canaryVerifiedAt: "2026-08-25T11:59:00.000Z",
      lastErrorCode: null,
    })),
  };
}

test("local deterministic work routes to an enabled isolated worker", async () => {
  const manifest = await loadManifest();
  const route = routeTask(manifest, { capability: "system.health", dataClass: "synthetic", requestedMode: "local" }, { workerStates: [verifiedWorkerState(manifest, "local-core")], now: NOW });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "local-core");
  assert.equal(route.decision.interfaceType, "deterministic-worker");
  assert.equal(route.decision.permissionClass, "bounded-local");
});

test("enterprise and unavailable capabilities wait without crossing boundaries", async () => {
  const manifest = await loadManifest();
  assert.deepEqual(routeTask(manifest, { capability: "m365.reason", dataClass: "enterprise", requestedMode: "local" }), {
    status: "waiting", reason: "no-enabled-worker", worker: null,
  });
  assert.equal(routeTask(manifest, { capability: "system.health", dataClass: "local-only", requestedMode: "maximum" }, { workerStates: [verifiedWorkerState(manifest, "local-core")], now: NOW }).status, "routable");
});

test("capability registry exposes routing evidence and runtime availability", async () => {
  const manifest = await loadManifest();
  const registry = capabilityIndex(manifest, [verifiedWorkerState(manifest, "local-core")], NOW);
  const health = registry.find((entry) => entry.workerId === "local-core" && entry.capability === "system.health");
  assert.equal(health.availability, "live");
  assert.equal(health.reliability, 99);
  assert.equal(health.requiresAttendedDesktop, false);
  assert.deepEqual(health.fallbackWorkerIds, []);
});

test("router prefers the most native reliable route and fails over around unavailable workers", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.push({
    ...structuredClone(manifest.workers.find((worker) => worker.id === "local-core")),
    id: "native-health",
    label: "Native Health",
    routing: {
      interfaceType: "native-api",
      permissionClass: "bounded-local",
      reliability: 95,
      requiresAttendedDesktop: false,
      fallbackWorkerIds: ["local-core"],
    },
  });
  const task = { capability: "system.health", dataClass: "synthetic", requestedMode: "local" };
  const readyStates = [verifiedWorkerState(manifest, "native-health"), verifiedWorkerState(manifest, "local-core")];
  assert.equal(routeTask(manifest, task, { workerStates: readyStates, now: NOW }).worker.id, "native-health");
  const failoverStates = [verifiedWorkerState(manifest, "native-health", "quarantined"), verifiedWorkerState(manifest, "local-core")];
  assert.equal(routeTask(manifest, task, { workerStates: failoverStates, now: NOW }).worker.id, "local-core");
});

test("router fails closed for stale and offline worker states", async () => {
  const manifest = await loadManifest();
  const task = { capability: "system.health", dataClass: "synthetic", requestedMode: "local" };
  for (const status of ["stale", "stopped", "crashed", "quarantined"]) {
    assert.equal(routeTask(manifest, task, { workerStates: [verifiedWorkerState(manifest, "local-core", status)], now: NOW }).status, "waiting");
  }
});


test("owner-authorized Copilot invocation requires matching platform authority", async () => {
  const manifest = structuredClone(await loadManifest());
  const studio = manifest.workers.find((worker) => worker.id === "copilot-studio");
  studio.enabled = true;
  const task = {
    capability: "studio.delegate",
    dataClass: "enterprise",
    requestedMode: "maximum",
    authorityScope: "copilot.invoke",
  };
  const route = routeTask(manifest, task, {
    workerStates: [verifiedWorkerState(manifest, "copilot-studio")],
    now: NOW,
    platformAuthorityScopesByWorkerId: { "copilot-studio": ["copilot.invoke"] },
  });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "copilot-studio");
  assert.equal(route.authorityDecision.authorized, true);
});

test("owner-authorized capability waits when platform authority is absent", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.find((worker) => worker.id === "copilot-studio").enabled = true;
  const task = {
    capability: "studio.delegate",
    dataClass: "enterprise",
    requestedMode: "maximum",
    authorityScope: "copilot.invoke",
  };
  const route = routeTask(manifest, task, {
    workerStates: [verifiedWorkerState(manifest, "copilot-studio")],
    now: NOW,
    platformAuthorityScopesByWorkerId: { "copilot-studio": [] },
  });
  assert.equal(route.status, "waiting");
  assert.equal(route.reason, "platform-authority-missing");
  assert.equal(route.worker, null);
});

test("existing tasks without authority scope keep their current routing behavior", async () => {
  const manifest = await loadManifest();
  const route = routeTask(manifest, { capability: "system.health", dataClass: "synthetic", requestedMode: "local" }, {
    workerStates: [verifiedWorkerState(manifest, "local-core")], now: NOW,
  });
  assert.equal(route.status, "routable");
  assert.equal(Object.hasOwn(route, "authorityDecision"), false);
});

test("missing owner authority stays non-recoverable", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.find((worker) => worker.id === "copilot-studio").enabled = true;
  manifest.ownerAuthority.scopes = manifest.ownerAuthority.scopes.filter((scope) => scope !== "copilot.invoke");
  const task = {
    capability: "studio.delegate",
    dataClass: "enterprise",
    requestedMode: "maximum",
    authorityScope: "copilot.invoke",
  };
  const route = routeTask(manifest, task, {
    workerStates: [verifiedWorkerState(manifest, "copilot-studio")],
    now: NOW,
    platformAuthorityScopesByWorkerId: { "copilot-studio": ["copilot.invoke"] },
  });
  assert.equal(route.status, "waiting");
  assert.equal(route.reason, "owner-authority-missing");
  assert.equal(Object.hasOwn(route, "recoveryPlan"), false);
});
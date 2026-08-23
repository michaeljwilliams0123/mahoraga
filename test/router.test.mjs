import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { capabilityIndex, routeTask } from "../src/router.mjs";

test("local deterministic work routes to an enabled isolated worker", async () => {
  const manifest = await loadManifest();
  const route = routeTask(manifest, { capability: "system.health", dataClass: "synthetic", requestedMode: "local" });
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
  assert.equal(routeTask(manifest, { capability: "system.health", dataClass: "local-only", requestedMode: "maximum" }).status, "routable");
});

test("capability registry exposes routing evidence and runtime availability", async () => {
  const manifest = await loadManifest();
  const registry = capabilityIndex(manifest, [{ workerId: "local-core", status: "healthy" }]);
  const health = registry.find((entry) => entry.workerId === "local-core" && entry.capability === "system.health");
  assert.equal(health.availability, "healthy");
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
  assert.equal(routeTask(manifest, task).worker.id, "native-health");
  assert.equal(routeTask(manifest, task, { workerStates: [{ workerId: "native-health", status: "quarantined" }] }).worker.id, "local-core");
});

test("router fails closed for stale and offline worker states", async () => {
  const manifest = await loadManifest();
  const task = { capability: "system.health", dataClass: "synthetic", requestedMode: "local" };
  for (const status of ["stale", "offline", "unhealthy", "unavailable"]) {
    assert.equal(routeTask(manifest, task, { workerStates: [{ workerId: "local-core", status }] }).status, "waiting");
  }
});


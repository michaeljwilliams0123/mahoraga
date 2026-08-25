import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { capabilityIndex, routeTask } from "../src/router.mjs";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");
const VERIFIED_AT = "2026-08-25T11:59:00.000Z";

function workerState({ canaryStatus = "verified", providerStatus = "ready", processStatus = "live" } = {}) {
  return {
    workerId: "local-core",
    status: processStatus,
    lastHeartbeatAt: "2026-08-25T11:59:55.000Z",
    readiness: [{
      workerId: "local-core",
      capability: "system.health",
      processStatus,
      providerStatus,
      canaryStatus,
      processObservedAt: "2026-08-25T11:59:55.000Z",
      providerObservedAt: "2026-08-25T11:59:30.000Z",
      canaryVerifiedAt: canaryStatus === "verified" ? VERIFIED_AT : null,
      lastErrorCode: null,
    }],
  };
}

function policyTask(overrides = {}) {
  return {
    capability: "system.health",
    dataClass: "synthetic",
    requestedMode: "local",
    allowedWorkerIds: ["local-core"],
    attendedRequired: false,
    executionPlane: "local",
    ...overrides,
  };
}

test("capability index keeps process liveness separate from verified readiness", async () => {
  const manifest = await loadManifest();
  const entry = capabilityIndex(manifest, [workerState({ canaryStatus: "never" })])
    .find((item) => item.workerId === "local-core" && item.capability === "system.health");
  assert.equal(entry.process.status, "live");
  assert.equal(entry.provider.status, "ready");
  assert.equal(entry.canary.status, "never");
  assert.equal(entry.routable, false);
  assert.equal(entry.routingReason, "canary-never-run");
});

test("routing requires a fresh canary and returns the precise block reason", async () => {
  const manifest = await loadManifest();
  const blocked = routeTask(manifest, policyTask(), { workerStates: [workerState({ canaryStatus: "never" })], now: NOW });
  assert.deepEqual(blocked, { status: "waiting", reason: "canary-never-run", worker: null });
  const route = routeTask(manifest, policyTask(), { workerStates: [workerState()], now: NOW });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "local-core");
  assert.equal(route.decision.evidenceLevel, "verified");
});

test("server-derived worker authority is enforced by routing", async () => {
  const manifest = await loadManifest();
  const result = routeTask(manifest, policyTask({ allowedWorkerIds: ["repair-worker"] }), { workerStates: [workerState()], now: NOW });
  assert.deepEqual(result, { status: "waiting", reason: "worker-not-authorized", worker: null });
});

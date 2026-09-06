import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { statusPayload } from "../src/server.mjs";

test("status API never marks a capability routable without fresh verified canary evidence", async () => {
  const manifest = await loadManifest();
  const worker = manifest.workers.find((item) => item.enabled);
  const observedAt = new Date().toISOString();
  const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const supervisor = {
    status: () => [{
      workerId: worker.id, label: worker.label, status: "live", pid: 1234, restartCount: 0, lastHeartbeatAt: observedAt,
      capabilities: worker.capabilities, readiness: worker.capabilities.map((capability) => ({
        capability, processStatus: "live", providerStatus: "ready", canaryStatus: "verified",
        processObservedAt: observedAt, providerObservedAt: observedAt, canaryVerifiedAt: stale,
      })),
    }],
    health: () => ({ supervisorRunning: true, startedAt: observedAt, healthy: true, unhealthyWorkers: [], repairScan: { lastVerifiedAt: observedAt, healthy: true, checked: 1, inProgress: false, activeIncidents: 0 } }),
  };
  const database = {
    listTasks: () => [], listImprovements: () => [], listConversations: () => [], listObjectives: () => [], listRepairIncidents: () => [],
  };
  const status = statusPayload(manifest, database, supervisor);
  assert.equal(manifest.versions, undefined);
  assert.equal(status.version, "7.0.0-alpha.2");
  assert.equal(status.versions.runtime, status.version);
  assert.equal(status.versions.controlCenter, status.version);
  assert.equal(status.versions.api, status.version);
  assert.equal(status.controlCenterApi.controlCenterVersion, status.versions.controlCenter);
  assert.equal(status.controlCenterApi.runtimeVersion, status.version);
  assert.ok(status.capabilities.length > 0);
  for (const capability of status.capabilities) if (capability.routable) {
    assert.equal(capability.canary, "verified");
    assert.equal(capability.evidenceLevel, "verified");
    assert.ok(capability.lastVerifiedAt);
    assert.ok(Date.parse(status.generatedAt) - Date.parse(capability.lastVerifiedAt) <= status.evidencePolicy.deterministicReadCanaryTtlMs);
  }
  assert.equal(status.capabilities.filter((item) => item.workerId === worker.id).some((item) => item.routable), false);
});

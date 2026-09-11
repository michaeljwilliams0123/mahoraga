import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { deriveRuntimeProvenance, refreshRuntimeProvenanceAuthority } from "../src/runtime.mjs";
import { statusPayload } from "../src/server.mjs";

function statusFixtures(manifest, provenance = null) {
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
    health: () => ({ supervisorRunning: true, startedAt: observedAt, healthy: true, unhealthyWorkers: [], repairScan: { lastVerifiedAt: observedAt, healthy: true, checked: 1, inProgress: false, activeIncidents: 0 }, ...(provenance ? { provenance } : {}) }),
  };
  const database = {
    listTasks: () => [], listImprovements: () => [], listConversations: () => [], listObjectives: () => [], listRepairIncidents: () => [],
  };
  return { worker, supervisor, database };
}

test("status API never marks a capability routable without fresh verified canary evidence", async () => {
  const manifest = await loadManifest();
  const { worker, supervisor, database } = statusFixtures(manifest);
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

test("status distinguishes same-version runtimes by immutable source commit and reports drift", async () => {
  const manifest = await loadManifest();
  const expectedSourceCommit = "a".repeat(40);
  const staleSourceCommit = "b".repeat(40);
  const currentProvenance = await deriveRuntimeProvenance({ repositoryHeadReader: async () => expectedSourceCommit, expectedSourceCommit });
  const staleProvenance = await deriveRuntimeProvenance({ repositoryHeadReader: async () => staleSourceCommit, expectedSourceCommit });
  const currentFixtures = statusFixtures(manifest, currentProvenance);
  const staleFixtures = statusFixtures(manifest, staleProvenance);
  const current = statusPayload(manifest, currentFixtures.database, currentFixtures.supervisor);
  const stale = statusPayload(manifest, staleFixtures.database, staleFixtures.supervisor);
  assert.equal(current.version, stale.version);
  assert.equal(current.runtime.provenance.sourceCommit, expectedSourceCommit);
  assert.equal(current.runtime.provenance.state, "current");
  assert.equal(stale.runtime.provenance.sourceCommit, staleSourceCommit);
  assert.equal(stale.runtime.provenance.expectedSourceCommit, expectedSourceCommit);
  assert.equal(stale.runtime.provenance.provenanceClass, "repository-head");
  assert.equal(stale.runtime.provenance.state, "runtime-drift");
  assert.equal(Object.isFrozen(stale.runtime.provenance), true);
});

test("runtime provenance fails closed for invalid expected identity and unknown source", async () => {
  await assert.rejects(
    deriveRuntimeProvenance({ repositoryHeadReader: async () => "a".repeat(40), expectedSourceCommit: "main" }),
    /runtime-expected-source-commit-invalid/,
  );
  const unknown = await deriveRuntimeProvenance({ repositoryHeadReader: async () => { throw new Error("git-unavailable"); } });
  assert.deepEqual(unknown, { sourceCommit: null, expectedSourceCommit: null, authoritativeSourceCommit: null, provenanceClass: "unknown", state: "unknown" });
});


test("runtime provenance detects authoritative main advancing after startup", async () => {
  const sourceCommit = "a".repeat(40);
  const advancedMain = "b".repeat(40);
  const provenance = await deriveRuntimeProvenance({
    repositoryHeadReader: async () => sourceCommit,
    expectedSourceCommit: sourceCommit,
    authoritativeHeadReader: async () => advancedMain,
  });
  assert.equal(provenance.sourceCommit, sourceCommit);
  assert.equal(provenance.expectedSourceCommit, sourceCommit);
  assert.equal(provenance.authoritativeSourceCommit, advancedMain);
  assert.equal(provenance.state, "runtime-drift");
});

test("runtime provenance is unknown when authoritative main cannot be observed", async () => {
  const sourceCommit = "a".repeat(40);
  const provenance = await deriveRuntimeProvenance({
    repositoryHeadReader: async () => sourceCommit,
    expectedSourceCommit: sourceCommit,
    authoritativeHeadReader: async () => { throw new Error("remote-unavailable"); },
  });
  assert.equal(provenance.sourceCommit, sourceCommit);
  assert.equal(provenance.expectedSourceCommit, sourceCommit);
  assert.equal(provenance.authoritativeSourceCommit, null);
  assert.equal(provenance.state, "unknown");
});
test("runtime provenance refresh preserves the source commit loaded at process startup", async () => {
  const startupCommit = "a".repeat(40);
  const advancedMain = "b".repeat(40);
  const startup = await deriveRuntimeProvenance({
    repositoryHeadReader: async () => startupCommit,
    expectedSourceCommit: startupCommit,
    authoritativeHeadReader: async () => startupCommit,
  });
  const refreshed = await refreshRuntimeProvenanceAuthority(startup, {
    authoritativeHeadReader: async () => advancedMain,
  });
  assert.equal(refreshed.sourceCommit, startupCommit);
  assert.equal(refreshed.expectedSourceCommit, startupCommit);
  assert.equal(refreshed.authoritativeSourceCommit, advancedMain);
  assert.equal(refreshed.state, "runtime-drift");
});

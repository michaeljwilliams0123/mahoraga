import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";

test("canonical manifest defines verified automatic update authority and localhost runtime", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.version, "7.0.0-alpha.1");
  assert.equal(manifest.versions.runtime, manifest.version);
  assert.equal(manifest.versions.controlCenter, manifest.version);
  assert.equal(manifest.updateAuthority, "mahoraga-verified-automatic");
  assert.equal(manifest.runtime.host, "127.0.0.1");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.queue.outboundOnly, true);
  assert.equal(manifest.queue.exactlyOnce, true);
  assert.ok(manifest.workers.some((worker) => worker.id === "local-core" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "self-healer" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "browser" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "repository" && worker.enabled));
  assert.equal(manifest.browser.controlCenterUrl, "http://127.0.0.1:4782/");
  assert.equal(manifest.browser.signedSessionEnabled, false);
  assert.deepEqual(manifest.repair.automaticRiskClasses, ["operational", "core"]);
  assert.equal(manifest.routingPolicy.interfaceOrder[0], "native-api");
  assert.ok(manifest.workers.every((worker) => worker.routing.reliability >= 0));
  assert.deepEqual(manifest.truthContracts, {
    controlSession: { idleTtlMs: 28_800_000, bootstrapNonceTtlMs: 30_000 },
    capabilityReadiness: { deterministicReadCanaryTtlMs: 86_400_000, writeCanaryTtlMs: 900_000 },
    contentVault: { root: "state/content-vault" },
    executionCells: { root: "state/execution-cells/codex" },
    receipts: { schemaVersion: 1 },
  });
  for (const worker of manifest.workers.filter((item) => item.enabled)) {
    assert.deepEqual(Object.keys(worker.capabilityCanaries).sort(), [...worker.capabilities].sort());
    assert.equal(worker.capabilityCanaries[worker.healthProbe], "health");
    assert.ok(Object.values(worker.capabilityCanaries).every((mode) => ["health", "direct", "provider-derived"].includes(mode)));
  }
});

test("manifest rejects external browser targets and premature signed browser access", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.browser.controlCenterUrl = "https://example.com/";
  assert.throws(() => validateManifest(manifest), /loopback-only/);
  manifest.browser.controlCenterUrl = "http://127.0.0.1:4782/";
  manifest.browser.signedSessionEnabled = true;
  assert.throws(() => validateManifest(manifest), /Signed browser session/);
});

test("manifest rejects public listeners and non-automatic update authority", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.runtime.host = "0.0.0.0";
  assert.throws(() => validateManifest(manifest), /localhost-only/);
  manifest.runtime.host = "127.0.0.1";
  manifest.updateAuthority = "user-only";
  assert.throws(() => validateManifest(manifest), /verified automatic/);
});

test("manifest rejects unknown routing fallbacks", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers[0].routing.fallbackWorkerIds = ["missing-worker"];
  assert.throws(() => validateManifest(manifest), /fallback references/);
});

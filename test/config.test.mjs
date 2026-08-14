import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";

test("canonical manifest defines user-only update authority and localhost runtime", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.updateAuthority, "user-only");
  assert.equal(manifest.runtime.host, "127.0.0.1");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.queue.outboundOnly, true);
  assert.equal(manifest.queue.exactlyOnce, true);
  assert.ok(manifest.workers.some((worker) => worker.id === "local-core" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "self-healer" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "browser" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "repository" && worker.enabled));
  assert.deepEqual(manifest.repair.automaticRiskClasses, ["operational"]);
  assert.equal(manifest.routingPolicy.interfaceOrder[0], "native-api");
  assert.ok(manifest.workers.every((worker) => worker.routing.reliability >= 0));
});

test("manifest rejects public listeners and non-user update authority", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.runtime.host = "0.0.0.0";
  assert.throws(() => validateManifest(manifest), /localhost-only/);
  manifest.runtime.host = "127.0.0.1";
  manifest.updateAuthority = "automatic";
  assert.throws(() => validateManifest(manifest), /user-only/);
});

test("manifest rejects unknown routing fallbacks", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers[0].routing.fallbackWorkerIds = ["missing-worker"];
  assert.throws(() => validateManifest(manifest), /fallback references/);
});

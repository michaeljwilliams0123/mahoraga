import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";

test("canonical manifest defines user-only update authority and localhost runtime", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.updateAuthority, "user-only");
  assert.equal(manifest.runtime.host, "127.0.0.1");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.queue.outboundOnly, true);
  assert.equal(manifest.queue.configurationSource, "runtime-environment");
  assert.equal(manifest.queue.deliveryMode, "at-least-once");
  assert.equal(manifest.queue.effectSemantics, "idempotent");
  assert.equal(manifest.queue.leaseFencing, true);
  assert.ok(manifest.workers.some((worker) => worker.id === "local-core" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "self-healer" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "browser" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "repository" && worker.enabled));
  assert.equal(manifest.browser.controlCenterUrl, "http://127.0.0.1:4782/");
  assert.equal(manifest.browser.signedSessionEnabled, false);
  assert.deepEqual(manifest.repair.automaticRiskClasses, ["operational"]);
  assert.equal(manifest.routingPolicy.interfaceOrder[0], "native-api");
  assert.ok(manifest.workers.every((worker) => worker.routing.reliability >= 0));
});

test("manifest rejects embedded deployment metadata and false exactly-once claims", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.queue.environmentUrl = ["https://tenant", ".crm.dynamics", ".com/"].join("");
  assert.throws(() => validateManifest(manifest), /runtime environment reference/);
  manifest.queue.environmentUrl = "${DATAVERSE_ENVIRONMENT_URL}";
  manifest.queue.deliveryMode = "exactly-once";
  assert.throws(() => validateManifest(manifest), /at-least-once delivery/);
});

test("manifest rejects external browser targets and premature signed browser access", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.browser.controlCenterUrl = "https://example.com/";
  assert.throws(() => validateManifest(manifest), /loopback-only/);
  manifest.browser.controlCenterUrl = "http://127.0.0.1:4782/";
  manifest.browser.signedSessionEnabled = true;
  assert.throws(() => validateManifest(manifest), /Signed browser session/);
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

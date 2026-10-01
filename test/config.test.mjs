import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalAiConfigurationAllowed, loadManifest, validateManifest } from "../src/config.mjs";

const PRODUCTION_ENV = { NODE_ENV: "production" };
const LOCAL_AI_DEV_ENV = { NODE_ENV: "development", ALLOW_LOCAL_AI_DEV: "true" };

test("canonical manifest exposes one product version plus compatibility revisions", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.version, "7.0.0-alpha.2");
  assert.equal(manifest.versions, undefined);
  assert.deepEqual(manifest.protocols, {
    apiProtocol: "2",
    taskSchema: "3",
    workerContract: "2",
    relayProtocol: "1",
    capabilityRegistrySchema: "1",
  });
  assert.equal(manifest.updateAuthority, "mahoraga-verified-automatic");
  assert.equal(manifest.runtime.host, "127.0.0.1");
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.queue.outboundOnly, true);
  assert.equal(manifest.queue.exactlyOnce, true);
  assert.ok(manifest.workers.some((worker) => worker.id === "local-core" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "self-healer" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "browser" && worker.enabled));
  assert.ok(manifest.workers.some((worker) => worker.id === "repository" && worker.enabled));
  assert.ok(manifest.workers.every((worker) => typeof worker.implementationRevision === "string" && worker.implementationRevision.length > 0));
  assert.ok(manifest.workers.every((worker) => worker.version === undefined));
  assert.equal(manifest.browser.controlCenterUrl, "http://127.0.0.1:4782/");
  assert.equal(manifest.browser.signedSessionEnabled, true);
  assert.equal(manifest.mcpProviders.length, 1);
  assert.equal(manifest.mcpProviders[0].enabled, false);
  assert.equal(manifest.mcpProviders[0].executableIdentity, "openclaw-mcp-host");
  assert.equal(manifest.executionBudgets.maximumDepth, 4);
  assert.equal(manifest.observationMemory.rawTurnLimit, 24);
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
    assert.ok(Object.values(worker.capabilityCanaries).every((mode) => ["health", "direct", "provider-derived", "manual"].includes(mode)));
  }
});

test("manifest validator rejects legacy product-like subversion fields", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.versions = { runtime: manifest.version };
  assert.throws(() => validateManifest(manifest), /Legacy version registry|protocol/i);
  delete manifest.versions;
  manifest.workers[0].version = manifest.workers[0].implementationRevision;
  assert.throws(() => validateManifest(manifest), /legacy worker version|implementation revision/i);
});

test("manifest rejects external browser targets and non-boolean signed browser state", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.browser.controlCenterUrl = "https://example.com/";
  assert.throws(() => validateManifest(manifest), /loopback-only/);
  manifest.browser.controlCenterUrl = "http://127.0.0.1:4782/";
  manifest.browser.signedSessionEnabled = "enabled";
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

test("manifest rejects caller-addressable MCP transports", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.mcpProviders[0].endpoint = "https://caller.example";
  assert.throws(() => validateManifest(manifest), /MCP provider fields/);
});

test("desktop communication send is separately registered with a manual canary", async () => {
  const manifest = await loadManifest();
  const worker = manifest.workers.find((item) => item.id === "desktop");
  assert.ok(worker.capabilities.includes("communication.send"));
  assert.equal(worker.capabilityCanaries["communication.send"], "manual");
});

test("non-development startup rejects enabled local adapters and local environment configuration", async () => {
  const manifest = structuredClone(await loadManifest(undefined, { env: PRODUCTION_ENV }));
  const localWorker = manifest.workers.find((worker) => worker.id === "local-reasoner");
  localWorker.enabled = true;
  assert.throws(() => validateManifest(manifest, { env: PRODUCTION_ENV }), /development-only.*NODE_ENV=development.*ALLOW_LOCAL_AI_DEV=true/i);
  const defaultManifest = await loadManifest(undefined, { env: PRODUCTION_ENV });
  await assert.rejects(
    loadManifest(undefined, { env: { ...PRODUCTION_ENV, STRUCTURED_GENERATION_ADAPTER: "ollama" } }),
    /development-only/i,
  );

  for (const env of [
    { ...PRODUCTION_ENV, EMBEDDING_PROVIDER: "local" },
    { ...PRODUCTION_ENV, STRUCTURED_GENERATION_ADAPTER: "ollama" },
    { ...PRODUCTION_ENV, MAHORAGA_ZERO_CREDIT_MODEL_URL: "http://127.0.0.1:11434/v1" },
  ]) {
    assert.throws(() => validateManifest(defaultManifest, { env }), /development-only/i);
  }
});

test("local adapters require both development mode and explicit override", async () => {
  const manifest = await loadManifest(undefined, { env: PRODUCTION_ENV });
  const localWorker = manifest.workers.find((worker) => worker.id === "local-reasoner");
  localWorker.enabled = true;
  assert.doesNotThrow(() => assertLocalAiConfigurationAllowed({ workers: [localWorker] }, LOCAL_AI_DEV_ENV));
  assert.throws(() => assertLocalAiConfigurationAllowed({ workers: [localWorker] }, { ...LOCAL_AI_DEV_ENV, ALLOW_LOCAL_AI_DEV: "false" }), /development-only/i);
  assert.throws(() => assertLocalAiConfigurationAllowed({ workers: [localWorker] }, { NODE_ENV: "production", ALLOW_LOCAL_AI_DEV: "true" }), /development-only/i);

  const devManifest = await loadManifest(undefined, { env: LOCAL_AI_DEV_ENV });
  assert.equal(devManifest.workers.find((worker) => worker.id === "local-open-weight").enabled, true);
});

test("default non-development manifest keeps cloud answers and removes local model routes", async () => {
  const manifest = await loadManifest(undefined, { env: PRODUCTION_ENV });
  assert.equal(manifest.workers.some((worker) => worker.id === "codespaces-open-weight" && worker.enabled), true);
  assert.equal(manifest.workers.some((worker) => worker.id === "local-open-weight"), false);
  assert.equal(manifest.costModes["zero-credit"].includes("local-model"), false);
});

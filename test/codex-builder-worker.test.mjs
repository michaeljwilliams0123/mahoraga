import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { buildCodexBuilderEnvelope, executeCodexBuilderCapability } from "../src/codex-builder-worker.mjs";

async function builderWorker() { return (await loadManifest()).workers.find((worker) => worker.id === "primary-codex-builder"); }

test("Codex Builder remains separate, task-scoped, and disabled", async () => {
  const worker = await builderWorker();
  const envelope = buildCodexBuilderEnvelope({ worker, task: { id: "mhg-builder", correlationId: "pcx-builder" }, session: { authoritySessionId: "primary-session", executionSessionId: "cdb-session" } });
  assert.equal(worker.enabled, false);
  assert.equal(envelope.executionMode, "task-scoped");
  assert.equal(envelope.interactiveAuthority, false);
  assert.equal(envelope.apiKeyRequired, false);
});

test("Codex Builder health reports the known AppX direct-call boundary", async () => {
  const worker = await builderWorker();
  const result = await executeCodexBuilderCapability("codex.health", {}, worker, { run: async () => ({ exitCode: null, errorCode: "EACCES", stderr: "Access is denied." }) });
  assert.equal(result.verified, false);
  assert.match(result.summary, /Access denied/);
  assert.equal(result.providerHealth.invocation, "desktop-appx-access-denied");
});

test("manifest rejects direct Codex Builder execution", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.find((worker) => worker.id === "primary-codex-builder").adapter.directExecutionEnabled = true;
  assert.throws(() => validateManifest(manifest), /Codex Builder adapter boundary/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../coordination/agent-factory/registry.json", import.meta.url), "utf8"));
const workerProcess = await readFile(new URL("../src/worker-process.mjs", import.meta.url), "utf8");

const originalStewardAgents = new Set([
  "mahoraga-agent-foundry",
  "mahoraga-code-guardian",
  "mahoraga-github-operator",
  "mahoraga-primary-codex-builder-specialist",
  "mahoraga-state-learner",
]);

test("existing Steward children are preserved and self-extension builder is additive", () => {
  const ids = new Set(registry.agents.map((agent) => agent.agentId));
  for (const id of originalStewardAgents) assert.equal(ids.has(id), true, `${id} must be preserved`);
  assert.equal(ids.has("mahoraga-self-extension-builder"), true);
  assert.equal(registry.agents.length >= originalStewardAgents.size + 1, true);
});

test("artifact.create extends local-core without replacing its existing capabilities", () => {
  const localCore = manifest.workers.find((worker) => worker.id === "local-core");
  for (const capability of ["provider.gap", "artifact.inspect", "system.health", "manifest.validate"]) assert.equal(localCore.capabilities.includes(capability), true);
  assert.equal(localCore.capabilities.includes("artifact.create"), true);
});

test("self-extension aliases extend the existing Primary Codex Builder", () => {
  const builder = manifest.workers.find((worker) => worker.id === "primary-codex-builder");
  for (const capability of ["codex.health", "codex.execute", "code.create-test", "self.patch", "agent.replicate", "self.enhance"]) assert.equal(builder.capabilities.includes(capability), true);
  assert.equal(builder.adapter.directExecutionEnabled, true);
  assert.equal(builder.adapter.networkAccess, false);
  assert.equal(builder.adapter.apiKeyRequired, false);
});

test("worker process composes the existing artifact and Codex paths", () => {
  assert.match(workerProcess, /executeArtifactAuthoringCapability/);
  assert.match(workerProcess, /executeSelfExtensionCapability/);
  assert.match(workerProcess, /executeCodexBuilderCapability/);
  assert.match(workerProcess, /LocalArtifactStore/);
});

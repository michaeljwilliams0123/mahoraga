import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../coordination/agent-factory/registry.json", import.meta.url), "utf8"));
const selfExtensionCli = await readFile(new URL("../scripts/mahoraga-self-extension.mjs", import.meta.url), "utf8");
const resources = JSON.parse(await readFile(new URL("../coordination/self-extension/resources.json", import.meta.url), "utf8"));

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

test("canonical worker manifest remains on the existing runtime capabilities", () => {
  const localCore = manifest.workers.find((worker) => worker.id === "local-core");
  for (const capability of ["provider.gap", "artifact.inspect", "system.health", "manifest.validate"]) assert.equal(localCore.capabilities.includes(capability), true);
  const builder = manifest.workers.find((worker) => worker.id === "primary-codex-builder");
  for (const capability of ["codex.health", "codex.execute"]) assert.equal(builder.capabilities.includes(capability), true);
  assert.equal(builder.adapter.directExecutionEnabled, true);
  assert.equal(builder.adapter.networkAccess, false);
  assert.equal(builder.adapter.apiKeyRequired, false);
});

test("self-extension CLI composes existing storage and Codex resources without worker replacement", () => {
  assert.match(selfExtensionCli, /executeArtifactAuthoringCapability/);
  assert.match(selfExtensionCli, /executeSelfExtensionCapability/);
  assert.match(selfExtensionCli, /LocalArtifactStore/);
  assert.match(selfExtensionCli, /createContentVault/);
  assert.match(selfExtensionCli, /primary-codex-builder/);
});

test("resource map exposes all additive lanes and keeps paid API fallback disabled", () => {
  assert.equal(resources.preservationMode, "additive-no-delete-rename");
  assert.equal(resources.meteredOpenAiApi, false);
  for (const capability of ["artifact.create", "code.create-test", "self.patch", "agent.replicate", "self.enhance"]) {
    assert.ok(resources.lanes[capability], `${capability} resource lane must exist`);
  }
  assert.ok(resources.lanes["artifact.create"].resources.includes("src/local-artifact-store.mjs"));
  assert.ok(resources.lanes["code.create-test"].resources.includes("src/codex-builder-worker.mjs"));
  assert.ok(resources.lanes["self.patch"].resources.includes("src/execution-cell.mjs"));
  assert.ok(resources.lanes["agent.replicate"].resources.includes("src/agent-foundry.mjs"));
  assert.ok(resources.lanes["self.enhance"].resources.includes("src/evolution-controller.mjs"));
});

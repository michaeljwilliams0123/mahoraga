import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../src/config.mjs";
import { selectZeroCreditProvider } from "../src/zero-credit-provider-selector.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("four-hour cycle stays deterministic with empty providers and no generation", async () => {
  const workerSource = await readFile(path.join(root, "src/cloud-cycle-worker.mjs"), "utf8");
  assert.match(workerSource, /providers: \[\]/);
  assert.match(workerSource, /requiresGeneration: false/);
  assert.match(workerSource, /cloudModeEnabled: false/);
  assert.match(workerSource, /MAHORAGA_CANDIDATE_PRODUCER === "github-native"/);
  assert.doesNotMatch(workerSource, /process\.env\.OPENAI/);

  const workflow = await readFile(path.join(root, ".github/workflows/sovereign-eight-hour-cycle.yml"), "utf8");
  assert.match(workflow, /MAHORAGA_CANDIDATE_PRODUCER:\s*github-native/);
  assert.doesNotMatch(workflow, /openai\.com/);

  const manifest = await loadManifest();
  assert.equal(manifest.featureFlags.openAIProvider, false);

  const decision = selectZeroCreditProvider({ providers: [], requiresGeneration: false, cloudModeEnabled: false });
  assert.equal(decision.status, "selected");
  assert.equal(decision.providerId, "deterministic-only");
  assert.equal(decision.costClass, "deterministic");

  const waiting = selectZeroCreditProvider({ providers: [], requiresGeneration: true, cloudModeEnabled: true });
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.providerId, "waiting-zero-credit-provider");
});

test("four-hour cycle uses the SD00 zero-credit self-hosted runner when hosted Actions admission is unavailable", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/sovereign-eight-hour-cycle.yml"), "utf8");
  assert.match(workflow, /candidate-cycle:\s*[\s\S]*?runs-on:\s*\[self-hosted,\s*windows,\s*x64,\s*mahoraga,\s*sd009wc7,\s*zero-credit\]/i);
  assert.match(workflow, /producer-smoke:\s*[\s\S]*?runs-on:\s*\[self-hosted,\s*windows,\s*x64,\s*mahoraga,\s*sd009wc7,\s*zero-credit\]/i);
  assert.doesNotMatch(workflow, /runs-on:\s*ubuntu-latest/);
});


test("release uses hosted Linux while Steward keeps the proven self-hosted lane", async () => {
  const releaseWorkflow = await readFile(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(releaseWorkflow, /runs-on:\s*ubuntu-latest/i);
  assert.doesNotMatch(releaseWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64\]/i);

  const stewardWorkflow = await readFile(path.join(root, ".github/workflows/steward-two-hour-learning.yml"), "utf8");
  assert.match(stewardWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64\]/i);
  assert.doesNotMatch(stewardWorkflow, /runs-on:\s*ubuntu-latest/i);
});

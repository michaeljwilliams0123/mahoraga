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
  assert.match(workflow, /MAHORAGA_ZERO_CREDIT_MODEL_URL:\s*["']{2}/);
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

test("four-hour cycle matches portable Windows zero-credit capacity and never a named device", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/sovereign-eight-hour-cycle.yml"), "utf8");
  const required = /runs-on:\s*\[self-hosted,\s*windows,\s*x64,\s*mahoraga,\s*zero-credit\]/gi;
  assert.equal((workflow.match(required) ?? []).length, 2, "candidate and smoke must both require free local capacity");
  assert.doesNotMatch(workflow, /sd009wc7|runs-on:\s*(?:windows|ubuntu)-latest/i);
  assert.match(workflow, /MAHORAGA_ZERO_CREDIT_MODEL_URL:\s*["']{2}/);
});


test("release uses hosted Linux and Steward permits free public-only Ubuntu without spending private minutes", async () => {
  const releaseWorkflow = await readFile(path.join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(releaseWorkflow, /runs-on:\s*ubuntu-latest/i);
  assert.match(releaseWorkflow, /group:\s*mahoraga-release-/i);
  assert.match(releaseWorkflow, /cancel-in-progress:\s*true/i);
  assert.doesNotMatch(releaseWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64\]/i);

  const stewardWorkflow = await readFile(path.join(root, ".github/workflows/steward-two-hour-learning.yml"), "utf8");
  // Job-level if is evaluated before a hosted runner is allocated. Keep the
  // privacy guard in the SAME learn job, not in a later step or an advisory.
  assert.match(stewardWorkflow, /learn:\s*[\s\S]*?if:\s*>-[\s\S]*?github\.event\.repository\.private\s*==\s*false[\s\S]*?runs-on:\s*ubuntu-latest/i);
  assert.match(stewardWorkflow, /github\.event_name\s*==\s*'schedule'/);
  assert.match(stewardWorkflow, /github\.actor\s*==\s*'michaeljwilliams0123'/);
  assert.doesNotMatch(stewardWorkflow, /runs-on:\s*\[self-hosted,\s*linux,\s*x64\]/i);
  assert.doesNotMatch(stewardWorkflow, /runs-on:\s*ubuntu-\d+-core/i);
  const governedMirror = await readFile(path.join(root, "state/release-baseline/.github/workflows/steward-two-hour-learning.yml"), "utf8");
  assert.equal(stewardWorkflow, governedMirror);
});

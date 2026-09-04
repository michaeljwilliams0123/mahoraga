import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const producerModule = await import("../src/sovereign-candidate-producer.mjs").catch(() => null);
const cycleModule = await import("../src/cloud-cycle-worker.mjs").catch(() => null);
const workflow = await readFile(new URL("../.github/workflows/sovereign-eight-hour-cycle.yml", import.meta.url), "utf8");

test("scan proposes a bounded operator scan report when it is missing", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: () => false,
    gapAudit: { open: [] },
  });
  assert.equal(enhancement.id, "operator-scan-report");
  assert.deepEqual(enhancement.changedFiles, ["scripts/sovereign-scan-report.mjs"]);
});

test("scan returns no actionable work once the operator scan report exists", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => relative === "scripts/sovereign-scan-report.mjs",
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement, null);
});

test("producer refuses trust-plane changed paths", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  assert.throws(
    () => producerModule.assertSafeCandidatePaths([".github/workflows/release.yml"]),
    /trust-plane/,
  );
});

test("changed-files digest is deterministic and order-independent", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const first = producerModule.candidateChangedFilesDigest(["scripts/sovereign-scan-report.mjs", "README.md"]);
  const second = producerModule.candidateChangedFilesDigest(["README.md", "scripts/sovereign-scan-report.mjs"]);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test("operator scan report script is content-bounded and zero-credit", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderOperatorScanReportScript();
  assert.match(rendered, /buildGapAudit/);
  assert.match(rendered, /blockedGapIds/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx/);
});

test("GitHub Actions PR policy denial is classified explicitly", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  assert.equal(typeof producerModule.classifyPullRequestCreationFailure, "function");
  const classified = producerModule.classifyPullRequestCreationFailure({
    stderr: "GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)",
  });
  assert.equal(classified.code, "candidate-pr-creation-disabled");
  assert.equal(classified.stage, "pull-request-create");
  assert.match(classified.publicDetail, /Actions > General/i);
  assert.doesNotMatch(classified.publicDetail, /token|secret/i);
});

test("an already-pushed candidate branch with no PR is recoverable", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  assert.equal(typeof producerModule.decideExistingCandidateHandoff, "function");
  assert.equal(producerModule.decideExistingCandidateHandoff([]), "create-pr");
  assert.equal(producerModule.decideExistingCandidateHandoff([{ number: 97 }]), "reuse-pr");
  assert.throws(() => producerModule.decideExistingCandidateHandoff([{ number: 97 }, { number: 98 }]), /candidate-existing-pr-invalid/);
});

test("cloud cycle preserves safe producer failure stage and detail", async () => {
  assert.ok(cycleModule, "cloud cycle module should exist");
  const result = await cycleModule.runCloudCycle({
    repositoryIdentity: "owner/repo",
    providers: [],
    requiresGeneration: false,
    cloudModeEnabled: false,
    providerSelector: () => ({ status: "selected", providerId: "deterministic-only" }),
    candidateProducer: async () => {
      const error = new Error("candidate-pr-creation-disabled");
      error.code = "candidate-pr-creation-disabled";
      error.stage = "pull-request-create";
      error.publicDetail = "Enable Settings > Actions > General > Workflow permissions > Allow GitHub Actions to create and approve pull requests.";
      throw error;
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.terminalReason, "candidate-pr-creation-disabled");
  assert.equal(result.terminalStage, "pull-request-create");
  assert.match(result.terminalDetail, /Workflow permissions/);
});

test("scheduler preserves worker JSON when node exits nonzero", () => {
  assert.match(workflow, /set \+e/);
  assert.match(workflow, /node_rc=/);
  assert.match(workflow, /cycle\.stderr/);
  assert.match(workflow, /candidate-pr-creation-disabled|terminalDetail|terminalStage/);
});

test("scheduler connects the GitHub-native producer and one-time ten-minute smoke", () => {
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /MAHORAGA_CANDIDATE_PRODUCER:\s*github-native/);
  assert.match(workflow, /sovereign-producer-smoke-v1/);
  assert.match(workflow, /createDeploymentAnchor/);
});

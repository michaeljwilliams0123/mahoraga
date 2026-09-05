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

test("scan proposes a scan-report test once the report exists", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => relative === "scripts/sovereign-scan-report.mjs",
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement.id, "operator-scan-report-test");
  assert.deepEqual(enhancement.changedFiles, ["test/sovereign-scan-report.test.mjs"]);
});

test("scan proposes a stale-branch report once the scan report and its test exist", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => relative === "scripts/sovereign-scan-report.mjs" || relative === "test/sovereign-scan-report.test.mjs",
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement.id, "operator-stale-branch-report");
  assert.deepEqual(enhancement.changedFiles, ["scripts/sovereign-stale-branch-report.mjs"]);
});

test("scan proposes a zero-credit boundary test once report, test, and stale-branch report exist", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) =>
      relative === "scripts/sovereign-scan-report.mjs" ||
      relative === "test/sovereign-scan-report.test.mjs" ||
      relative === "scripts/sovereign-stale-branch-report.mjs",
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement.id, "zero-credit-boundary-test");
  assert.deepEqual(enhancement.changedFiles, ["test/zero-credit-boundary.test.mjs"]);
});

const FOUR_SHOT = new Set([
  "scripts/sovereign-scan-report.mjs",
  "test/sovereign-scan-report.test.mjs",
  "scripts/sovereign-stale-branch-report.mjs",
  "test/zero-credit-boundary.test.mjs",
]);
const LEDGER = "reports/sovereign-cycle-outcome.json";
const CYCLE_A = "a".repeat(64);
const CYCLE_B = "b".repeat(64);

test("scan proposes a cycle outcome ledger once one-shot recipes exist", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => FOUR_SHOT.has(relative),
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement.id, "cycle-outcome-ledger");
  assert.deepEqual(enhancement.changedFiles, [LEDGER]);
  producerModule.assertSafeCandidatePaths([LEDGER]);
});

test("scan refreshes the ledger when cycleId advanced", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => FOUR_SHOT.has(relative) || relative === LEDGER,
    readFile: () => JSON.stringify({ schemaVersion: 1, cycleId: CYCLE_A }),
    cycleId: CYCLE_B,
    gapAudit: { open: [] },
  });
  assert.equal(enhancement.id, "cycle-outcome-ledger");
  assert.match(enhancement.title, /refresh/);
});

test("scan returns no actionable work when ledger already records this cycleId", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => FOUR_SHOT.has(relative) || relative === LEDGER,
    readFile: () => JSON.stringify({ schemaVersion: 1, cycleId: CYCLE_A }),
    cycleId: CYCLE_A,
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement, null);
});

test("cycle outcome ledger render is bounded JSON and zero-credit", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderCycleOutcomeLedger({
    cycleId: CYCLE_A,
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }, { id: "gap-open", state: "open" }] },
    baseSha: "c".repeat(40),
    producedAt: "2026-09-05T04:00:00.000Z",
  });
  const parsed = JSON.parse(rendered);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.cycleId, CYCLE_A);
  assert.equal(parsed.counts.blocked, 1);
  assert.equal(parsed.counts.actionable, 1);
  assert.deepEqual(parsed.blockedGapIds, ["signed-browser-session"]);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx|Destiny|7\.0/);
  assert.equal(producerModule.recordedLedgerCycleId(rendered), CYCLE_A);
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

test("operator scan report test is content-bounded and zero-credit", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderOperatorScanReportTest();
  assert.match(rendered, /sovereign-scan-report\.mjs/);
  assert.match(rendered, /schemaVersion/);
  assert.match(rendered, /blockedGapIds/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx/);
  producerModule.assertSafeCandidatePaths(["test/sovereign-scan-report.test.mjs"]);
});

test("stale-branch report script is content-bounded and zero-credit", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderOperatorStaleBranchReportScript();
  assert.match(rendered, /leftoverSovereignBranches/);
  assert.match(rendered, /feature\/sovereign-/);
  assert.match(rendered, /ls-remote/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx|git push/);
  producerModule.assertSafeCandidatePaths(["scripts/sovereign-stale-branch-report.mjs"]);
});

test("zero-credit boundary test is content-bounded and stays off licensed cloud", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderZeroCreditBoundaryTest();
  assert.match(rendered, /selectZeroCreditProvider/);
  assert.match(rendered, /deterministic-only/);
  assert.match(rendered, /requiresGeneration: false/);
  assert.match(rendered, /openAIProvider, false/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx/);
  producerModule.assertSafeCandidatePaths(["test/zero-credit-boundary.test.mjs"]);
});

test("stale leftover candidate branches without an open PR are reclaimable", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const base = "a".repeat(40);
  const drifted = "b".repeat(40);
  assert.equal(producerModule.decideStaleCandidateBranch({ mergeBase: base, baseSha: base, openPrCount: 1 }), "reuse");
  assert.equal(producerModule.decideStaleCandidateBranch({ mergeBase: drifted, baseSha: base, openPrCount: 0 }), "reclaim");
  assert.throws(
    () => producerModule.decideStaleCandidateBranch({ mergeBase: drifted, baseSha: base, openPrCount: 1 }),
    /candidate-existing-base-drift/,
  );
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

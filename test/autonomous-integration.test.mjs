import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateAutonomousIntegration, latestExactDestinyResult, latestExactWorkflowRun } from "../src/autonomous-integration.mjs";
import { ROOT } from "../src/config.mjs";

const policy = {
  automaticIntegration: true,
  eligibleBranchPrefixes: ["codex/", "destiny/", "feature/", "upgrade/"],
  protectedPaths: [".github/workflows", "AGENTS.md", "scripts/autonomous-integration.mjs", "src/autonomy-policy.mjs", "src/autonomous-integration.mjs", "src/config.mjs", "src/github-audit.mjs", "src/update-contract.mjs"],
};

function candidate(overrides = {}) {
  return {
    workflow: { name: "Verify Mahoraga", conclusion: "success", headSha: "abc123" },
    pullRequest: {
      number: 45,
      state: "open",
      draft: false,
      baseRef: "main",
      baseSha: "base123",
      currentMainSha: "base123",
      title: "Improve autonomous runtime",
      headRef: "feature/autonomous-runtime",
      headSha: "abc123",
      headRepository: "michaeljwilliams0123/mahoraga",
      baseRepository: "michaeljwilliams0123/mahoraga",
      mergeable: true,
      headContainsMain: true,
      changedFiles: ["web/app.js", "web/styles.css"],
      ...overrides,
    },
  };
}

function destinyCandidate(overrides = {}) {
  return candidate({
    title: "[DESTINY-CODEX] Improve the public workspace",
    headRef: "destiny/public-workspace",
    destinyRelayVerified: true,
    destinyResult: { status: "success", headSha: "abc123" },
    ...overrides,
  });
}

test("exact successful same-repository heads outside protected roots are eligible", () => {
  assert.deepEqual(evaluateAutonomousIntegration(candidate(), policy), {
    eligible: true,
    reason: "eligible",
    pullRequestNumber: 45,
    headSha: "abc123",
    deployPages: false,
  });
});

test("integration rejects stale, failed, forked, draft, conflicted, and changed-base candidates", () => {
  const cases = [
    [{ workflow: { name: "Verify Mahoraga", conclusion: "failure", headSha: "abc123" }, pullRequest: candidate().pullRequest }, "verification-not-successful"],
    [candidate({ headSha: "different" }), "verified-head-mismatch"],
    [candidate({ headRepository: "attacker/fork" }), "fork-not-eligible"],
    [candidate({ draft: true }), "draft-not-eligible"],
    [candidate({ mergeable: false }), "merge-conflict"],
    [candidate({ currentMainSha: "advanced" }), "base-advanced"],
    [candidate({ headContainsMain: false }), "head-behind-main"],
  ];
  for (const [input, reason] of cases) assert.equal(evaluateAutonomousIntegration(input, policy).reason, reason);
});

test("integration rejects ineligible branches and every protected root", () => {
  assert.equal(evaluateAutonomousIntegration(candidate({ headRef: "random/change" }), policy).reason, "branch-not-eligible");
  for (const changedPath of policy.protectedPaths) {
    assert.equal(evaluateAutonomousIntegration(candidate({ changedFiles: [changedPath] }), policy).reason, "protected-path");
    assert.equal(evaluateAutonomousIntegration(candidate({ changedFiles: [`${changedPath}/nested.yml`] }), policy).reason, "protected-path");
  }
});

test("Destiny integration does not wait for an exact-head result after trusted checks pass", () => {
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ destinyResult: null }), policy).eligible, true);
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ destinyResult: { status: "blocked-terminal-pr", headSha: "abc123" } }), policy).eligible, true);
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ destinyResult: { status: "success", headSha: "different" } }), policy).eligible, true);
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ destinyRelayVerified: false }), policy).reason, "destiny-relay-verification-required");
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ headRef: "feature/ui", destinyResult: null }), policy).eligible, true);
});

test("Destiny integration requires an implementation delta beyond its dispatch envelope", () => {
  const dispatch = "coordination/destiny-dispatches/dcx-3c11bb0e4a5d3b6329832b0a.json";
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ changedFiles: [dispatch] }), policy).reason, "destiny-implementation-required");
  assert.equal(evaluateAutonomousIntegration(destinyCandidate({ changedFiles: [dispatch, "web/app.js"] }), policy).eligible, true);
});

test("the newest exact-head pull-request run is authoritative", () => {
  const headSha = "a".repeat(40);
  const runs = [
    { id: 1, name: "Verify Mahoraga", head_sha: headSha, event: "pull_request", run_number: 10, run_attempt: 1, status: "completed", conclusion: "success" },
    { id: 2, name: "Verify Mahoraga", head_sha: headSha, event: "pull_request", run_number: 11, run_attempt: 1, status: "completed", conclusion: "failure" },
    { id: 3, name: "Verify Mahoraga", head_sha: headSha, event: "workflow_dispatch", run_number: 12, run_attempt: 1, status: "completed", conclusion: "success" },
  ];
  assert.equal(latestExactWorkflowRun(runs, { name: "Verify Mahoraga", headSha }).conclusion, "failure");
  assert.equal(latestExactWorkflowRun(runs, { name: "Verify Mahoraga", headSha: "b".repeat(40) }), null);
});

test("the newest well-formed owner result for the exact head is authoritative", () => {
  const headSha = "a".repeat(40);
  const comment = (id, status, head = headSha, owner = "michaeljwilliams0123") => ({
    id, created_at: `2026-08-30T12:00:0${id}Z`, user: { login: owner },
    body: `[DESTINY-CODEX:RESULT]\nhead=\`${head}\`\nstatus=\`${status}\``,
  });
  const selected = latestExactDestinyResult([
    comment(1, "success"),
    comment(2, "blocked-terminal-pr"),
    comment(3, "success", "b".repeat(40)),
    comment(4, "success", headSha, "attacker"),
  ], { owner: "michaeljwilliams0123", headSha });
  assert.deepEqual(selected, { status: "blocked-terminal-pr", headSha });
  assert.equal(latestExactDestinyResult([{ ...comment(5, "success"), body: `${comment(5, "success").body}\nstatus=\`blocked\`` }], { owner: "michaeljwilliams0123", headSha }), null);
});

test("only verified cloud changes request a post-merge Pages deployment", () => {
  assert.equal(evaluateAutonomousIntegration(candidate({ changedFiles: ["cloud/app.js"] }), policy).deployPages, true);
  assert.equal(evaluateAutonomousIntegration(candidate({ changedFiles: ["cloudish/app.js"] }), policy).deployPages, false);
});

test("workflow waits for latest Destiny evidence and explicitly verifies each workflow-token merge", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "autonomous-integration.yml"), "utf8");
  assert.match(source, /issue_comment:/);
  assert.match(source, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(source, /actions: write/);
  assert.match(source, /latestExactWorkflowRun/);
  assert.equal(source.match(/latestExactWorkflowRun/g)?.length, 6);
  assert.match(source, /latestExactDestinyResult/);
  assert.equal(source.match(/latestExactDestinyResult/g)?.length, 4);
  assert.match(source, /verify\?\.status === "completed" && verify\.conclusion === "success"/);
  assert.match(source, /relay\?\.status === "completed" && relay\.conclusion === "success"/);
  assert.match(source, /freshDecision = evaluateAutonomousIntegration/);
  assert.match(source, /createWorkflowDispatch/);
  assert.match(source, /workflow_id: "verify\.yml"/);
  assert.match(source, /workflow_id: "pages\.yml"/);
  assert.match(source, /steps\.policy\.outputs\.deploy_pages/);
});

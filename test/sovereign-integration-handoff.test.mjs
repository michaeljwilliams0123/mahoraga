import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { latestExactWorkflowRun } from "../src/autonomous-integration.mjs";

test("sovereign exact-head verification ignores approval-gated PR noise but keeps real failures authoritative", () => {
  const headSha = "a".repeat(40);
  const approvalGated = [
    {
      id: 100,
      name: "Verify Mahoraga",
      head_sha: headSha,
      event: "workflow_dispatch",
      run_number: 20,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
    },
    {
      id: 101,
      name: "Verify Mahoraga",
      head_sha: headSha,
      event: "pull_request",
      run_number: 21,
      run_attempt: 1,
      status: "completed",
      conclusion: "action_required",
    },
  ];

  const selected = latestExactWorkflowRun(approvalGated, {
    name: "Verify Mahoraga",
    headSha,
    events: ["pull_request", "workflow_dispatch"],
    ignoredConclusions: ["action_required"],
  });

  assert.equal(selected?.event, "workflow_dispatch");
  assert.equal(selected?.conclusion, "success");

  const laterRealFailure = [
    ...approvalGated,
    {
      id: 102,
      name: "Verify Mahoraga",
      head_sha: headSha,
      event: "workflow_dispatch",
      run_number: 22,
      run_attempt: 1,
      status: "completed",
      conclusion: "failure",
    },
  ];
  assert.equal(latestExactWorkflowRun(laterRealFailure, {
    name: "Verify Mahoraga",
    headSha,
    events: ["pull_request", "workflow_dispatch"],
    ignoredConclusions: ["action_required"],
  })?.conclusion, "failure");
});

test("successful sovereign verification explicitly dispatches trusted integration with exact branch and SHA", async () => {
  const verify = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  const integration = await readFile(new URL("../.github/workflows/autonomous-integration.yml", import.meta.url), "utf8");

  assert.match(verify, /dispatch-sovereign-integration:/);
  assert.match(verify, /needs:\s*\[verify\]/);
  assert.doesNotMatch(verify, /dispatch-sovereign-integration:\s*\n\s+needs:\s*\[verify, workspace\]/);
  assert.doesNotMatch(verify, /workspace:\s*\n\s+name: Verify unified Vercel workspace/);
  assert.match(verify, /Vercel production deployment is retired/);
  assert.match(verify, /Ubuntu \+ Windows only/);
  assert.match(verify, /github\.event_name == 'workflow_dispatch'/);
  assert.match(verify, /startsWith\(github\.ref_name, 'feature\/sovereign-'\)/);
  assert.match(verify, /actions:\s*write/);
  assert.match(verify, /workflow_id:\s*["']autonomous-integration\.yml["']/);
  assert.match(verify, /ref:\s*["']main["']/);
  assert.match(verify, /candidate_head_sha/);
  assert.match(verify, /candidate_head_branch/);

  assert.match(integration, /workflow_dispatch:/);
  assert.match(integration, /candidate_head_sha:/);
  assert.match(integration, /candidate_head_branch:/);
  assert.match(integration, /context\.payload\.inputs/);
  assert.match(integration, /detail\.head\.sha !== candidateHeadSha/);
  assert.match(integration, /detail\.head\.ref !== candidateHeadBranch/);
  assert.match(integration, /detail\.head\.repo\?\.full_name !== `\$\{owner\}\/\$\{repo\}`/);
  assert.match(integration, /events:\s*\["pull_request",\s*"workflow_dispatch"\]/);
  assert.match(integration, /ignoredConclusions:\s*\["action_required"\]/);
  assert.match(integration, /autonomous-main-publication-receipt\.json/);
  assert.match(integration, /autonomous-main-publication-\$\{\{ steps\.integrate\.outputs\.merged_sha \}\}/);
  assert.match(integration, /publication_source_run_id/);
  assert.match(integration, /publication_merged_sha/);
  assert.match(verify, /publication_source_run_id:/);
  assert.match(verify, /publication_merged_sha:/);
  assert.match(verify, /Autonomous Integration/);
  assert.match(verify, /verified-main-publication-\$\{\{ github\.sha \}\}/);
  assert.match(verify, /trusted-autonomous-publication-receipt-invalid/);
  assert.match(integration, /receipt\.verifyRunId = String\(matches\[0\]\.id\)/);
  assert.match(integration, /publication-verify-run-ambiguous/);
  assert.match(verify, /for attempt in \$\(seq 1 30\)/);
  assert.match(verify, /\.status == "completed"/);
  assert.match(verify, /\.conclusion == "success"/);
  assert.match(verify, /String\(receipt\?\.verifyRunId \?\? ""\) !== String\(process\.env\.GITHUB_RUN_ID\)/);
});

test("automatic main beta release stays on workflow_run, not a second verify dispatch", async () => {
  const verify = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
  const release = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const verifier = await readFile(new URL("../scripts/verify-exact-head.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(verify, /dispatch-automatic-release:/);
  assert.match(release, /workflow_run:/);
  assert.match(release, /head_branch == 'main'/);
  assert.match(release, /github-actions\[bot\]/);
  assert.match(release, /actions:\s*read/);
  assert.match(release, /Fetch trusted bot publication receipt/);
  assert.match(release, /run: node scripts\/verified-main-publication\.ts/);
  assert.match(release, /run: node scripts\/verify-exact-head\.mjs/);
  assert.match(verifier, /currentMainSha/);
  assert.match(verifier, /stale-verified-main/);
});

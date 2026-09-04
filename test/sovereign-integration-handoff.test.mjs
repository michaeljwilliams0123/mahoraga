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
  assert.match(verify, /needs:\s*\[verify, workspace\]/);
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
  assert.match(integration, /events:\s*\["pull_request",\s*"workflow_dispatch"\]/);
  assert.match(integration, /ignoredConclusions:\s*\["action_required"\]/);
});

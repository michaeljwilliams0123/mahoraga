import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isTrustedAutonomousIntegrationWorkflow } from "../src/github-audit.mjs";

test("write-capable autonomous integration stays bound to latest exact-head evidence at merge", () => {
  const trusted = `
on:\n  workflow_run:\n    workflows: ["Verify Mahoraga", "Validate Destiny Codex Relay"]
permissions:\n  actions: write\n  contents: write\n  pull-requests: write
jobs:\n  integrate:\n    if: github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.head_repository.full_name == github.repository
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:\n      ref: main\n      persist-credentials: false
  - run: node scripts/autonomous-integration.mjs --input state/autonomous-integration-input.json
  - uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3
    with:\n      script: |\n        const verify = latestExactWorkflowRun(runs, { name: "Verify Mahoraga", headSha: detail.head.sha });\n        const relay = latestExactWorkflowRun(runs, { name: "Validate Destiny Codex Relay", headSha: detail.head.sha });\n        const verifySucceeded = verify?.status === "completed" && verify.conclusion === "success";\n        const relaySucceeded = relay?.status === "completed" && relay.conclusion === "success";\n        const freshDecision = evaluateAutonomousIntegration({ pullRequest: { headContainsMain: ancestry.data.behind_by === 0 } }, policy);\n        if (!freshDecision.eligible) throw new Error(\`policy-changed-before-merge:\${freshDecision.reason}\`);\n        if (freshDecision.headSha !== expectedHead) throw new Error("verified-head-advanced");\n        github.rest.pulls.merge({ sha: expectedHead, merge_method: "squash" });
        github.rest.actions.createWorkflowDispatch({ workflow_id: "verify.yml", ref: "main" });
`;
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted), true);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("ref: main", "ref: ${{ github.event.workflow_run.head_sha }}")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("persist-credentials: false", "persist-credentials: true")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("sha: expectedHead", "sha: pr.head.sha")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("pull-requests: write", "pull-requests: read")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("actions: write", "actions: read")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("github.event.workflow_run.event == 'pull_request'", "true")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("workflow_run:", "workflow_run:\n  issue_comment:")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("const verify =", "const destinyResult = latestExactDestinyResult(comments);\n        const verify =")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replaceAll("latestExactWorkflowRun", "runs.find")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace('verify?.status === "completed" && verify.conclusion === "success"', "verify !== undefined")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace('relay?.status === "completed" && relay.conclusion === "success"', "relay !== undefined")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("const freshDecision = evaluateAutonomousIntegration", "const freshDecision = Object.freeze")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("headContainsMain: ancestry.data.behind_by === 0", "headContainsMain: true")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("freshDecision.headSha !== expectedHead", "false")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("github.rest.actions.createWorkflowDispatch", "github.rest.actions.getWorkflowRun")), false);
});

test("successful verification without an open pull request is a clean no-op", async () => {
  const workflow = await readFile(new URL("../.github/workflows/autonomous-integration.yml", import.meta.url), "utf8");
  assert.match(workflow, /candidates\.length === 0/);
  assert.match(workflow, /core\.setOutput\("found", "false"\)/);
  assert.match(workflow, /steps\.candidate\.outputs\.found == 'true'/);
  assert.doesNotMatch(workflow, /expected-one-open-main-pr/);
});

test("sovereign workflow-dispatch verification is admitted only for bounded same-repo producer branches", async () => {
  const workflow = await readFile(new URL("../.github/workflows/autonomous-integration.yml", import.meta.url), "utf8");
  assert.match(workflow, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /startsWith\(github\.event\.workflow_run\.head_branch, 'feature\/sovereign-'\)/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(workflow), true);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'\s*\|\|\s*true/);
});

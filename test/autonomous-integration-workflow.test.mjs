import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedAutonomousIntegrationWorkflow } from "../src/github-audit.mjs";

test("write-capable autonomous integration stays bound to trusted metadata and exact-head merge", () => {
  const trusted = `
on:\n  workflow_run:\n    workflows: ["Verify Mahoraga"]
permissions:\n  contents: write\n  pull-requests: write
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:\n      ref: main\n      persist-credentials: false
  - run: node scripts/autonomous-integration.mjs --input state/autonomous-integration-input.json
  - uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3
    with:\n      script: |\n        if (pr.head.sha !== expectedHead) throw new Error("verified-head-advanced");\n        if (pr.base.sha !== main.commit.sha) throw new Error("base-advanced-before-merge");\n        github.rest.pulls.merge({ sha: expectedHead, merge_method: "squash" });
`;
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted), true);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("ref: main", "ref: ${{ github.event.workflow_run.head_sha }}")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("persist-credentials: false", "persist-credentials: true")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("sha: expectedHead", "sha: pr.head.sha")), false);
  assert.equal(isTrustedAutonomousIntegrationWorkflow(trusted.replace("pull-requests: write", "pull-requests: read")), false);
});

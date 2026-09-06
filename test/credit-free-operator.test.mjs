import test from "node:test";
import assert from "node:assert/strict";
import {
  admitOwnerGitHubOperator,
  classifyMcpSpendingClass,
} from "../src/credit-free-operator.mjs";
import {
  classifyAutonomyProvider,
  selectCreditFreeExecutionPlane,
  attestZeroCreditHealth,
  CORE_OWNED_CLOUD_METERED_PROVIDERS,
} from "../src/credit-free-autonomy.mjs";

test("core-owned cloud workers are metered, never unknown", () => {
  for (const provider of CORE_OWNED_CLOUD_METERED_PROVIDERS) {
    assert.equal(classifyAutonomyProvider(provider), "metered");
    assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: provider }).reason, "metered-provider-forbidden");
  }
  assert.equal(attestZeroCreditHealth({
    providers: ["repository", "native-cloud-model"],
  }).reason, "metered-provider-present");
});

test("review bots and hosted OpenClaw are metered contamination", () => {
  assert.equal(classifyAutonomyProvider("chatgpt-codex-connector"), "metered");
  assert.equal(classifyAutonomyProvider("copilot-review"), "metered");
  assert.equal(classifyAutonomyProvider("openclaw-hosted"), "metered");
});

test("github operators and local MCP hosts are credit-free inspect planes", () => {
  assert.equal(classifyAutonomyProvider("github-operator"), "credit-free");
  assert.equal(classifyAutonomyProvider("grok-github-mcp"), "credit-free");
  assert.equal(classifyAutonomyProvider("mcp-host"), "credit-free");
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "grok-github-mcp" }).ok, true);
});

test("MCP spending class is fail-closed", () => {
  assert.equal(classifyMcpSpendingClass("deterministic"), "credit-free");
  assert.equal(classifyMcpSpendingClass("licensed-cloud"), "metered");
  assert.equal(classifyMcpSpendingClass("mystery"), "unknown");
});

test("owner GitHub operator may inspect, repair, merge exact-head, and close superseded PRs at $0", () => {
  for (const action of ["inspect", "repair", "comment", "assign", "merge-exact-head", "close-superseded"]) {
    const admitted = admitOwnerGitHubOperator({ action });
    assert.equal(admitted.ok, true, action);
    assert.equal(admitted.creditCost, 0);
    assert.equal(admitted.paidFallback, false);
    assert.equal(admitted.scheduler, false);
  }
});

test("owner GitHub operator refuses Codex review, cycleId-only PRs, extra gates, and metered inference", () => {
  assert.equal(admitOwnerGitHubOperator({ requestsCodexReview: true }).reason, "codex-review-forbidden");
  assert.equal(admitOwnerGitHubOperator({ opensCycleIdOnlyPr: true }).reason, "cycleid-only-pr-forbidden");
  assert.equal(admitOwnerGitHubOperator({ addsMergeGate: true }).reason, "extra-merge-gate-forbidden");
  assert.equal(admitOwnerGitHubOperator({ invokesMeteredInference: true }).reason, "metered-provider-forbidden");
  assert.equal(admitOwnerGitHubOperator({ action: "buy-review-credits" }).reason, "operator-action-not-admitted");
  assert.equal(admitOwnerGitHubOperator({ actor: "codex-cloud" }).reason, "operator-actor-unknown");
});

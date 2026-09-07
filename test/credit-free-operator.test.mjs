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

test("owner GitHub operator may read, create, modify, administer, repair, and merge at $0", () => {
  for (const action of [
    "inspect", "create", "modify", "administer", "repair", "comment", "assign", "merge-exact-head", "close-superseded",
  ]) {
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

test("chatgpt GitHub MCP is a credit-free owner-authorized mutation plane", () => {
  assert.equal(classifyAutonomyProvider("chatgpt-github-mcp"), "credit-free");
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "chatgpt-github-mcp" }).ok, true);
  for (const action of ["inspect", "create", "modify", "administer"]) {
    assert.equal(admitOwnerGitHubOperator({ actor: "chatgpt-github-mcp", action }).ok, true, action);
  }
});

test("GitHub Codespaces start is metered billed compute", () => {
  assert.equal(classifyAutonomyProvider("codespaces"), "metered");
  assert.equal(classifyAutonomyProvider("github-codespaces"), "metered");
  assert.equal(selectCreditFreeExecutionPlane({ requestedProvider: "codespaces" }).reason, "metered-provider-forbidden");
  assert.equal(attestZeroCreditHealth({
    providers: ["repository", "codespaces"],
  }).reason, "metered-provider-present");
});

test("deny-first: untrusted content cannot share mutating tools; delete-ref remains forbidden", () => {
  assert.equal(admitOwnerGitHubOperator({ action: "inspect", untrustedContentPresent: true }).ok, true);
  assert.equal(admitOwnerGitHubOperator({ action: "comment", untrustedContentPresent: true }).ok, true);
  for (const action of ["repair", "create", "modify", "administer", "merge-exact-head"]) {
    assert.equal(admitOwnerGitHubOperator({ action, untrustedContentPresent: true }).reason, "untrusted-content-mutation-forbidden", action);
  }
  assert.equal(admitOwnerGitHubOperator({ deletesRef: true }).reason, "delete-ref-forbidden");
});

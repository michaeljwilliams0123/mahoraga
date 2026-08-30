import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAutonomousIntegration } from "../src/autonomous-integration.mjs";

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
      headRef: "destiny/ultron-ui-20260830",
      headSha: "abc123",
      headRepository: "michaeljwilliams0123/mahoraga",
      baseRepository: "michaeljwilliams0123/mahoraga",
      mergeable: true,
      changedFiles: ["web/app.js", "web/styles.css"],
      ...overrides,
    },
  };
}

test("exact successful same-repository heads outside protected roots are eligible", () => {
  assert.deepEqual(evaluateAutonomousIntegration(candidate(), policy), {
    eligible: true,
    reason: "eligible",
    pullRequestNumber: 45,
    headSha: "abc123",
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

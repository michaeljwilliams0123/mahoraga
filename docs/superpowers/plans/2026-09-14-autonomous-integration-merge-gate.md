# Autonomous Integration Exact-Check Merge Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Allow autonomous integration to accept GitHub's unstable aggregate merge state only when both canonical required Verify checks are successful on the authorized exact head SHA.

**Architecture:** Preserve the classifyPullMergeState and requiredExactHeadChecksReady boundaries. Reclassify unstable from a conclusive failure to an evidence-required hold, then let evaluateExactHeadMergeGate grant readiness only through the two canonical exact-head check records.

**Tech Stack:** Node.js 24 ESM, node:test, GitHub Actions check-run metadata.

**Spec:** docs/superpowers/specs/2026-09-14-autonomous-integration-merge-gate-design.md

## Global Constraints

- Do not change REQUIRED_MERGE_CHECK_CONTEXTS; it remains exactly Verify (ubuntu-latest) and Verify (windows-latest).
- Keep hard blocks for behind, dirty, draft, ineligible decisions, stale heads, and invalid evidence.
- An unstable result is ready only when both required contexts are completed and success for the supplied 40-character head SHA.
- Missing, pending, skipped, cancelled, stale, or failed required checks remain a hold.
- Do not change workflow permissions, branch-protection settings, merge methods, credentials, Railway variables, or deployment configuration.
- Because src/autonomous-integration.mjs is an essential release artifact, refresh its matching state/release-baseline copy in the same reviewed change.
- Run focused tests, git diff --check, and npm run verify before opening the protected bootstrap PR.

---

## File structure

- src/autonomous-integration.mjs: classify the aggregate state and resolve it against canonical exact-head evidence.
- test/autonomous-integration.test.mjs: lock positive and negative unstable behavior to the canonical contexts.

### Task 1: Write the unstable-state regression

**Files:**
- Modify: test/autonomous-integration.test.mjs in the existing merge-gate test.
- Read: src/autonomous-integration.mjs for evaluateExactHeadMergeGate and REQUIRED_MERGE_CHECK_CONTEXTS.

**Interfaces:**
- Consumes: evaluateExactHeadMergeGate({ policyDecision, mergeableState, checkRuns, headSha }).
- Produces: a regression requiring ready only when both canonical contexts succeed on headSha.

- [ ] **Step 1: Add a positive exact-head unstable case**

~~~js
const unstableWithRequiredChecks = evaluateExactHeadMergeGate({
  policyDecision,
  mergeableState: "unstable",
  headSha,
  checkRuns: [
    { name: "Verify (ubuntu-latest)", head_sha: headSha, status: "completed", conclusion: "success", completed_at: "2026-09-14T18:54:00Z" },
    { name: "Verify (windows-latest)", head_sha: headSha, status: "completed", conclusion: "success", completed_at: "2026-09-14T18:55:00Z" },
    { name: "non-required diagnostic", head_sha: headSha, status: "completed", conclusion: "failure", completed_at: "2026-09-14T18:56:00Z" },
  ],
});
assert.equal(unstableWithRequiredChecks.ok, true);
assert.equal(unstableWithRequiredChecks.status, "ready");
assert.equal(unstableWithRequiredChecks.reason, "required-checks-ready");
~~~

- [ ] **Step 2: Add the negative required-check case**

~~~js
const unstableWithFailedRequiredCheck = evaluateExactHeadMergeGate({
  policyDecision,
  mergeableState: "unstable",
  headSha,
  checkRuns: [
    { name: "Verify (ubuntu-latest)", head_sha: headSha, status: "completed", conclusion: "success", completed_at: "2026-09-14T18:54:00Z" },
    { name: "Verify (windows-latest)", head_sha: headSha, status: "completed", conclusion: "failure", completed_at: "2026-09-14T18:55:00Z" },
  ],
});
assert.equal(unstableWithFailedRequiredCheck.ok, false);
assert.equal(unstableWithFailedRequiredCheck.status, "hold");
assert.equal(unstableWithFailedRequiredCheck.reason, "required-checks-pending");
assert.deepEqual(unstableWithFailedRequiredCheck.missing, ["Verify (windows-latest)"]);
~~~

- [ ] **Step 3: Change the empty-check unstable assertion**

~~~js
assert.equal(failing.status, "hold");
assert.equal(failing.reason, "required-checks-pending");
~~~

- [ ] **Step 4: Run the focused test before implementation**

Run: node --test --test-isolation=none test/autonomous-integration.test.mjs

Expected: FAIL because current code reports every unstable state as blocked with required-checks-failing.

- [ ] **Step 5: Commit the red test**

~~~bash
git add test/autonomous-integration.test.mjs
git commit -m "test: cover unstable exact-head merge gate"
~~~

### Task 2: Gate unstable through canonical evidence

**Files:**
- Modify: src/autonomous-integration.mjs in classifyPullMergeState and evaluateExactHeadMergeGate.
- Test: test/autonomous-integration.test.mjs.

**Interfaces:**
- Consumes: requiredExactHeadChecksReady(checkRuns, { headSha, requiredContexts }), returning { ok, reason, missing }.
- Produces: a frozen ready result only when mergeableState is unstable and both canonical checks pass for headSha.

- [ ] **Step 1: Reclassify unstable as evidence-required**

~~~js
if (state === "unstable") {
  return Object.freeze({ ok: false, status: "hold", reason: "merge-state-unstable" });
}
~~~

- [ ] **Step 2: Grant readiness only from green canonical evidence**

After the call to requiredExactHeadChecksReady, insert this branch before the existing hold return:

~~~js
if (state.reason === "merge-state-unstable" && checks.ok) {
  return Object.freeze({
    ok: true,
    status: "ready",
    reason: "required-checks-ready",
    missing: Object.freeze([]),
    creditCost: 0,
    paidFallback: false,
  });
}
~~~

Leave the hold return untouched, so every negative evidence result continues to hold.

- [ ] **Step 3: Run focused verification**

Run: node --test --test-isolation=none test/autonomous-integration.test.mjs

Expected: PASS for the new positive/negative cases and the existing conflict, draft, and unknown-state protections.

- [ ] **Step 4: Run patch and repository verification**

Run: git diff --check && npm run verify

Expected: no whitespace errors and a successful verification suite. Preserve evidence of any pre-existing or environmental failure; do not attribute it to this change without diagnosis.

- [ ] **Step 5: Refresh the required recovery baseline and rerun verification**

Run: npm run baseline:refresh && npm run verify

Expected: state/release-baseline/src/autonomous-integration.mjs becomes byte-identical to its source counterpart, and the full suite passes without baseline drift.

- [ ] **Step 6: Commit the implementation and baseline**

~~~bash
git add src/autonomous-integration.mjs state/release-baseline/src/autonomous-integration.mjs test/autonomous-integration.test.mjs docs/superpowers/plans/2026-09-14-autonomous-integration-merge-gate.md
git commit -m "fix: gate unstable merge state by exact required checks"
~~~

### Task 3: Prepare protected integration evidence

**Files:**
- Read: .github/workflows/autonomous-integration.yml, config/main-protection.contract.json, AGENTS.md.
- No source or configuration changes.

**Interfaces:**
- Consumes: Task 2's implementation commit and local verification evidence.
- Produces: a bootstrap PR limited to the approved spec, plan, implementation, and deterministic regression test.

- [ ] **Step 1: Reconfirm exact changed-file scope**

Run: git status --short --branch && git diff --check origin/main...HEAD && git diff --name-only origin/main...HEAD

Expected: the approved spec, this plan, src/autonomous-integration.mjs, and test/autonomous-integration.test.mjs only.

- [ ] **Step 2: Push without rewriting history**

Run: git push --set-upstream origin codex/fix-autonomous-integration-unstable-gate

Expected: a normally published branch with no force push.

- [ ] **Step 3: Open the bootstrap PR and await exact-head checks**

Create a PR into main titled fix: gate unstable merge state by exact required checks. Include the observed #488 false negative, the exact two-context rule, focused test result, and npm run verify result. Do not merge or enable auto-merge without fresh exact-head readiness and explicit owner confirmation.

## Plan self-review

- **Spec coverage:** Task 1 locks both allowed and blocked unstable cases; Task 2 implements the narrow gate; Task 3 preserves protected-path CI and landing boundaries.
- **Placeholder scan:** Every code edit, test, command, and expected result is specified.
- **Type consistency:** All tasks use the existing evaluateExactHeadMergeGate, requiredExactHeadChecksReady, headSha, checkRuns, status, conclusion, and missing interfaces.

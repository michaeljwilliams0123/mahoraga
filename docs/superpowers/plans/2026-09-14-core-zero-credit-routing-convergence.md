# Core Zero-Credit Routing Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that Mahoraga's cloud chat path can execute a real answer through an admitted zero-credit provider, never silently fall back to a paid route, and deploy the exact verified GitHub head to canonical Railway production.

**Architecture:** Reuse the merged zero-credit admission work from PR #484 instead of reimplementing it. Add only missing contract coverage around fail-closed routing, then verify the exact merged head through the repository's existing `verify` workflow and a live canonical Railway canary.

**Tech Stack:** Node.js >=24, node:test, existing Mahoraga runtime/server, GitHub Actions, Railway.

**Spec:** `docs/superpowers/specs/2026-09-14-primary-controller-readiness-design.md`

## Global Constraints

- Unauthorized paid-provider spend is forbidden.
- Destructive data loss requires owner approval.
- Reconcile `main`, open PRs, current Railway deployment, and in-flight work before creating new implementation.
- Preserve fail-closed behavior for unverified, unroutable, licensed, metered, or otherwise non-zero-credit providers.
- Required verification is exact-head verification; do not treat stale CI as evidence.
- Canonical production is `mahoraga-runtime-main`; do not create a replacement Railway service.

---

### Task 1: Reconcile merged zero-credit admission work

**Files:**
- Inspect: `src/server.mjs`
- Inspect: `state/release-baseline/src/server.mjs`
- Inspect: `test/chat-runtime.test.mjs`
- Inspect: `test/zero-credit-chat-mode.test.mjs`

**Interfaces:**
- Consumes: `zeroCreditChatRouteAvailable(routes, capability)` and `zeroCreditChatTaskRequestedMode(creditPolicy, fallback)`.
- Produces: a confirmed source baseline that already contains PR #484 semantics before any new edit is made.

- [ ] **Step 1: Refresh authoritative branch state**

Run:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git status --short --branch
```

Expected: clean `main`, no local divergence.

- [ ] **Step 2: Confirm the merged routing helpers exist in both governed copies**

Run:

```bash
git grep -n "zeroCreditChatRouteAvailable\|zeroCreditChatTaskRequestedMode" -- src/server.mjs state/release-baseline/src/server.mjs test
```

Expected: both helpers exist in live and release-baseline server sources; tests reference them.

- [ ] **Step 3: Run focused merged regressions**

Run:

```bash
node --test --test-isolation=none test/zero-credit-chat-mode.test.mjs test/chat-runtime.test.mjs
```

Expected: PASS. If either fails, stop and debug the failure before adding coverage.

### Task 2: Lock the no-paid-fallback contract

**Files:**
- Modify: `test/chat-runtime.test.mjs`

**Interfaces:**
- Consumes: `zeroCreditChatRouteAvailable(routes, capability)` from `src/server.mjs`.
- Produces: a regression proving `licensed-cloud` and `metered-cloud` routes cannot satisfy zero-credit chat admission.

- [ ] **Step 1: Add the regression beside the existing zero-credit admission test**

```js
test("zero-credit answer admission never accepts paid execution classes", async () => {
  const { zeroCreditChatRouteAvailable } = await import("../src/server.mjs");
  const route = (costClass) => ({
    capability: "assistant.respond",
    enabled: true,
    routable: true,
    costClass,
  });

  assert.equal(zeroCreditChatRouteAvailable([route("licensed-cloud")], "assistant.respond"), false);
  assert.equal(zeroCreditChatRouteAvailable([route("metered-cloud")], "assistant.respond"), false);
  assert.equal(zeroCreditChatRouteAvailable([route("cloud-open-weight")], "assistant.respond"), true);
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test --test-isolation=none test/chat-runtime.test.mjs
```

Expected: PASS if the merged contract is intact. If a paid class is admitted, the test fails and the implementation must be debugged before proceeding.

- [ ] **Step 3: Commit only the regression**

Run:

```bash
git add test/chat-runtime.test.mjs
git commit -m "test(runtime): lock zero-credit paid fallback boundary"
```

### Task 3: Verify the complete repository gate on the exact head

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: repository `verify` script from `package.json`.
- Produces: exact-head verification evidence suitable for merge/deploy gating.

- [ ] **Step 1: Run the repository verification suite**

Run:

```bash
npm run verify
```

Expected: exit code 0.

- [ ] **Step 2: Push the branch and record the exact SHA**

Run:

```bash
git push -u origin HEAD
git rev-parse HEAD
```

Expected: one exact head SHA to use for GitHub Actions and deployment comparison.

- [ ] **Step 3: Require the GitHub Verify workflow to pass on that exact SHA**

Use GitHub Actions evidence for the exact SHA from Step 2. Do not use a run from an earlier commit. Ubuntu and Windows required Verify jobs must be green before merge.

### Task 4: Merge and prove canonical Railway convergence

**Files:**
- No repository source changes expected after merge.

**Interfaces:**
- Consumes: verified GitHub head and canonical Railway service `mahoraga-runtime-main`.
- Produces: one live deployment whose reported source SHA equals merged `main` and whose answer path proves zero-credit execution.

- [ ] **Step 1: Merge only after exact-head verification**

Use the repository's normal merge method and expected-head protection. Record the resulting `main` SHA.

- [ ] **Step 2: Reconcile canonical Railway instead of creating a new service**

Inspect project `e644391a-9698-4026-b5e1-a28e07cfaf82` and service `mahoraga-runtime-main`. Deploy or promote the merged `main` only through the existing canonical service.

Expected: canonical service reports SUCCESS and the deployed source SHA matches merged `main`.

- [ ] **Step 3: Run a live zero-credit answer canary**

Submit one authenticated ordinary-language request through the real cloud workspace using the default zero-credit policy.

Expected:

```text
request accepted
assistant.respond route is enabled and routable
cost class is deterministic, local-model, or cloud-open-weight
real answer returned
paidFallback = false
creditCost = 0
```

- [ ] **Step 4: Run a negative paid-fallback canary**

Use a controlled test fixture that exposes only licensed/metered answer routes; do not alter the live paid-provider policy merely to create the test condition.

Expected: `zero-credit-provider-unavailable`; no licensed or metered invocation occurs.

### Task 5: Record convergence evidence

**Files:**
- Create: `docs/readiness/core-zero-credit-routing-evidence.md`

**Interfaces:**
- Consumes: exact Git SHA, CI run IDs, Railway deployment ID, live canary result.
- Produces: durable evidence for the primary-controller readiness gate.

- [ ] **Step 1: Write the evidence record from observed values**

Create `docs/readiness/core-zero-credit-routing-evidence.md` only after the live proof exists. Include the exact 40-character merged main SHA, exact Ubuntu and Windows Verify run IDs and conclusions, canonical Railway service name and deployment ID, deployed source SHA comparison, zero-credit answer canary result, paid-fallback-attempted boolean, observed monetary spend, and final `GREEN` or `AMBER` result. Do not copy example IDs or invent missing evidence.

- [ ] **Step 2: Commit the evidence**

Run:

```bash
git add docs/readiness/core-zero-credit-routing-evidence.md
git commit -m "docs(readiness): record zero-credit routing convergence"
```

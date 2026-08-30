# Phase A Sovereign Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Mahoraga-owned project, credit, provider, and execution contracts that make zero-credit local operation the default and prevent speculative reasoning from becoming action authority.

**Architecture:** Add focused immutable contract modules beside the existing router and manifest validation. The project registry fixes roots and commands; credit policy removes metered providers from normal eligibility; the execution firewall is the only reasoning-to-task bridge. Existing workers and the canonical router remain intact.

**Tech Stack:** Node.js 24 ESM, `node:test`, immutable plain objects, existing manifest/router/server modules.

**Spec:** `docs/superpowers/specs/2026-08-29-mahoraga-sovereign-reasoning-design.md` and `docs/superpowers/specs/2026-08-29-mahoraga-zero-credit-autonomy-addendum.md`

## Global Constraints

- Normal objectives use `creditBudget: 0`; metered provider calls and credits consumed must both remain zero.
- Mahoraga remains bound to `127.0.0.1`; no public listener or inbound tunnel is permitted.
- Enterprise data stays in the Microsoft tenant; local-only data stays on the device.
- Callers cannot select executables, arbitrary arguments, working directories, providers, data planes, or authority roles.
- Operational state stores identifiers, hashes, counts, timestamps, and reason codes, never raw prompts, provider responses, document content, or hidden reasoning traces.
- `king-admin` is not implemented or activated in this phase.

---

### Task 1: Immutable Project Registry

**Files:**
- Create: `src/project-registry.mjs`
- Create: `test/project-registry.test.mjs`
- Modify: `mahoraga.manifest.json`

**Interfaces:**
- Consumes: `manifest.projects`, each with `id`, `root`, `dataClass`, `allowedWorkerIds`, `commandRegistry`, `maximumConcurrency`, and `normalCreditBudget`.
- Produces: `buildProjectRegistry(manifest, dependencies): ReadonlyMap<string, ProjectContract>` and `getProjectContract(registry, projectId): ProjectContract`.

- [ ] **Step 1: Write the failing registry tests**

```js
test("project registry fixes roots, commands, and a zero normal credit budget", async () => {
  const registry = await buildProjectRegistry(manifestFixture, { realpath: async (value) => value });
  const project = getProjectContract(registry, "mahoraga");
  assert.equal(project.normalCreditBudget, 0);
  assert.deepEqual(project.commandRegistry.verify, {
    executableId: "node-24",
    args: ["src/cli.mjs", "validate"],
    timeoutMs: 30000,
  });
  assert.equal(Object.isFrozen(project), true);
});

test("registry rejects overlapping roots and caller-selected command fields", async () => {
  await assert.rejects(() => buildProjectRegistry(overlappingRootsFixture), /project-root-overlap/);
  await assert.rejects(() => buildProjectRegistry(arbitraryExecutableFixture), /project-command-invalid/);
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing-module failure**

Run: `node --test test/project-registry.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/project-registry.mjs`.

- [ ] **Step 3: Implement the registry boundary**

```js
export async function buildProjectRegistry(manifest, { realpath = fsRealpath } = {}) {
  const entries = await Promise.all((manifest.projects ?? []).map((value) => normalizeProject(value, realpath)));
  assertDistinctRoots(entries);
  return freezeMap(new Map(entries.map((entry) => [entry.id, entry])));
}

export function getProjectContract(registry, projectId) {
  const project = registry.get(projectId);
  if (!project) throw contractError("project-not-registered");
  return project;
}
```

`normalizeProject()` must require `normalCreditBudget === 0`, reject unknown fields, resolve an absolute non-overlapping root, validate data class, fix worker IDs, and accept commands only when their `executableId` maps to a manifest-owned executable.

- [ ] **Step 4: Run registry and manifest tests**

Run: `node --test test/project-registry.test.mjs test/config.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the project registry**

```bash
git add src/project-registry.mjs test/project-registry.test.mjs mahoraga.manifest.json
git commit -m "feat: add sovereign project registry"
```

### Task 2: Zero-Credit Provider Policy and Receipts

**Files:**
- Create: `src/credit-policy.mjs`
- Create: `test/credit-policy.test.mjs`
- Modify: `src/capability-registry.mjs`
- Modify: `src/router.mjs`

**Interfaces:**
- Consumes: `ProjectContract`, objective mode (`normal` or `break-glass`), worker routing metadata, and observed provider usage.
- Produces: `eligibleUnderCreditPolicy(project, worker, mode): boolean`, `createCreditReceipt(input): CreditReceipt`, and router reason `normal-credit-budget-excludes-provider`.

- [ ] **Step 1: Write failing zero-credit routing tests**

```js
test("normal mode excludes every metered provider even when healthy", () => {
  const result = eligibleUnderCreditPolicy(project, { id: "primary-codex-builder", costClass: "licensed-cloud" }, "normal");
  assert.equal(result, false);
});

test("normal credit receipt requires zero provider calls and zero credits", () => {
  assert.deepEqual(createCreditReceipt({ objectiveId: "obj-1", mode: "normal", calls: [], credits: 0 }), {
    schemaVersion: 1, objectiveId: "obj-1", mode: "normal", meteredProviderCalls: 0,
    meteredCreditsConsumed: 0, verifiedZeroCredit: true,
  });
  assert.throws(() => createCreditReceipt({ objectiveId: "obj-1", mode: "normal", calls: ["codex"], credits: 1 }), /normal-credit-budget-exceeded/);
});
```

- [ ] **Step 2: Verify the tests fail because credit policy does not exist**

Run: `node --test test/credit-policy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement policy and insert it before router ranking**

```js
export function eligibleUnderCreditPolicy(project, worker, mode) {
  if (mode === "normal") return project.normalCreditBudget === 0 && !new Set(["licensed-cloud", "paid-api"]).has(worker.costClass);
  return mode === "break-glass" && worker.id === "primary-codex-builder";
}
```

In `capabilityIndex()`, expose `creditEligible` and a bounded reason. In `routeTask()`, remove ineligible candidates before reliability, latency, and cost ranking.

- [ ] **Step 4: Run credit, routing, and capability tests**

Run: `node --test test/credit-policy.test.mjs test/router.test.mjs test/config.test.mjs`

Expected: PASS with normal Codex exclusion and unchanged deterministic routing.

- [ ] **Step 5: Commit credit policy**

```bash
git add src/credit-policy.mjs src/capability-registry.mjs src/router.mjs test/credit-policy.test.mjs
git commit -m "feat: enforce zero-credit normal routing"
```

### Task 3: Reasoning Provider Contract and Execution Firewall

**Files:**
- Create: `src/reasoning-provider-contract.mjs`
- Create: `src/execution-firewall.mjs`
- Create: `test/reasoning-provider-contract.test.mjs`
- Create: `test/execution-firewall.test.mjs`

**Interfaces:**
- Consumes: provider result `{ schemaVersion, objectiveId, candidates, providerEvidence }` and converged decision `{ claimId, speculative, confidence, evidenceRefs, proposedAction }`.
- Produces: `validateReasoningProviderResult(value): ReasoningProviderResult` and `deriveExecutableDecision(input): ExecutableDecision | BlockedDecision`.

- [ ] **Step 1: Write failing strict-schema tests**

```js
test("provider output cannot assert tools, workers, or authority", () => {
  assert.throws(() => validateReasoningProviderResult({
    schemaVersion: 1, objectiveId: "obj-1", candidates: [], providerEvidence: {},
    workerId: "primary-codex-builder",
  }), /reasoning-provider-result-field-invalid/);
});

test("speculative reasoning never becomes an executable decision", () => {
  const result = deriveExecutableDecision({ decision: speculativeDecision, project, readiness, leases: {} });
  assert.deepEqual(result, { executable: false, reason: "reasoning-decision-speculative" });
});
```

- [ ] **Step 2: Run both tests and confirm missing-module failures**

Run: `node --test test/reasoning-provider-contract.test.mjs test/execution-firewall.test.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement strict normalization and firewall ordering**

`deriveExecutableDecision()` must evaluate, in order: project registration, non-speculative state, evidence presence, policy-authorized capability, data-plane match, fresh readiness, required attended/integration lease, owner-reserved action, and credit eligibility. Return the first stable reason code; never throw for an ordinary blocked decision.

```js
export function deriveExecutableDecision(input) {
  const checks = [registeredProject, convergedEvidence, policyCapability, dataPlane, readiness, authorityLease, reservedAction, creditBudget];
  for (const check of checks) {
    const reason = check(input);
    if (reason) return Object.freeze({ executable: false, reason });
  }
  return Object.freeze({ executable: true, task: buildDerivedTask(input) });
}
```

- [ ] **Step 4: Run contract and firewall tests**

Run: `node --test test/reasoning-provider-contract.test.mjs test/execution-firewall.test.mjs`

Expected: PASS, including malformed, speculative, stale, wrong-plane, and metered-provider cases.

- [ ] **Step 5: Commit the firewall**

```bash
git add src/reasoning-provider-contract.mjs src/execution-firewall.mjs test/reasoning-provider-contract.test.mjs test/execution-firewall.test.mjs
git commit -m "feat: add reasoning execution firewall"
```

### Task 4: Sovereign Status Surface

**Files:**
- Modify: `src/config.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Create: `test/sovereign-status-runtime.test.mjs`

**Interfaces:**
- Consumes: project registry summary, credit-policy summary, and reasoning-provider availability.
- Produces: authenticated `GET /api/sovereignty` with content-free state and Control Center rendering.

- [ ] **Step 1: Write the failing runtime test**

```js
test("sovereignty API reports Mahoraga primary and zero-credit normal mode", async () => {
  const response = await authenticatedGet(runtime, "/api/sovereignty");
  assert.equal(response.status, 200);
  assert.equal(response.body.normalOperator, "mahoraga");
  assert.equal(response.body.normalCreditBudget, 0);
  assert.equal(response.body.codexRole, "break-glass-only");
  assert.equal("projectRoot" in JSON.stringify(response.body), false);
});
```

- [ ] **Step 2: Run the test and confirm `404 not-found`**

Run: `node --test test/sovereign-status-runtime.test.mjs`

Expected: FAIL because `/api/sovereignty` is absent.

- [ ] **Step 3: Add the authenticated, redacted route and UI card**

Return IDs, counts, availability, normal credit budget, and bounded reason codes. Do not return absolute roots, commands, prompts, provider responses, or leases. The UI must label Codex `Dormant break-glass` and Mahoraga `Normal operator`.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test test/sovereign-status-runtime.test.mjs test/runtime.test.mjs test/control-center-intake-runtime.test.mjs`

Run: `npm run verify` (on the current Windows host, use the repository-approved bundled `pnpm.cmd run verify` fallback when `npm` is unavailable)

Expected: all tests pass; repository audit reports zero blocking failures.

- [ ] **Step 5: Commit Phase A**

```bash
git add src/config.mjs src/runtime.mjs src/server.mjs web/index.html web/app.js test/sovereign-status-runtime.test.mjs
git commit -m "feat: expose sovereign zero-credit status"
```

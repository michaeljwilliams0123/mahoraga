# Execution Recovery and Observability Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one deterministic, machine-readable certification harness that converts Mahoraga's observed routing, operations, provider, persistence, recovery, concurrency, and verification evidence into a truthful RED/AMBER/GREEN primary-controller readiness result.

**Architecture:** Build a pure readiness evaluator first, then a CLI collector that feeds it existing `operationsSnapshot`, provider readiness, and explicit evidence inputs. The evaluator never activates paid providers and never turns absence of evidence into success. Controlled fault injection lives in tests; the production command observes and scores rather than randomly breaking production.

**Tech Stack:** Node.js >=24, node:test, existing `workspace-operations.mjs`, `provider-readiness.mjs`, SQLite-backed runtime state, package scripts.

**Spec:** `docs/superpowers/specs/2026-09-14-primary-controller-readiness-design.md`

## Global Constraints

- Unauthorized paid-provider spend is forbidden.
- Destructive data loss requires owner approval.
- RED/AMBER/GREEN is risk-weighted: peripheral AMBER capabilities do not automatically block promotion.
- `GREEN` is impossible when paid fallback was observed, destructive-loss risk is unresolved, false-success evidence exists, core routing is unavailable, zero-credit answer execution is unverified, persistence is broken, or verification is contradictory.
- Unknown evidence remains unknown; the evaluator may not convert missing evidence to PASS.
- Fault injection in this plan is test-fixture controlled only.
- Runtime source additions under `src/` must be included in the governed release baseline through the repository's existing baseline refresh/verify process.

---

### Task 1: Define the readiness evidence contract as a pure evaluator

**Files:**
- Create: `src/primary-controller-readiness.mjs`
- Test: `test/primary-controller-readiness.test.mjs`

**Interfaces:**
- Produces: `evaluatePrimaryControllerReadiness(input)`.
- Input shape:

```js
{
  operations,
  providers,
  evidence: {
    zeroCreditAnswerVerified,
    unauthorizedPaidInvocationObserved,
    destructiveDataLossRisk,
    falseSuccessObserved,
    persistenceVerified,
    recoveryVerified,
    idempotencyVerified,
    leaseSafetyVerified,
    exactHeadVerified,
    canonicalDeploymentVerified,
    contentAccessVerified,
    artifactBridgeVerified,
    githubAuthenticatedReadState,
  },
  requiredCapabilities,
}
```

- Output shape:

```js
{
  schemaVersion: 1,
  status: "RED" | "AMBER" | "GREEN",
  core: { ready: boolean, blockers: string[] },
  capabilities: [{ id, status, reason }],
  blockers: string[],
  warnings: string[],
}
```

- [ ] **Step 1: Write failing tests for hard RED conditions**

Create `test/primary-controller-readiness.test.mjs` with:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePrimaryControllerReadiness } from "../src/primary-controller-readiness.mjs";

function readyInput(overrides = {}) {
  return {
    operations: { interactionReadiness: { ready: true }, verification: { state: "verified" } },
    providers: { providers: {} },
    evidence: {
      zeroCreditAnswerVerified: true,
      unauthorizedPaidInvocationObserved: false,
      destructiveDataLossRisk: false,
      falseSuccessObserved: false,
      persistenceVerified: true,
      recoveryVerified: true,
      idempotencyVerified: true,
      leaseSafetyVerified: true,
      exactHeadVerified: true,
      canonicalDeploymentVerified: true,
      contentAccessVerified: true,
      artifactBridgeVerified: true,
      githubAuthenticatedReadState: "verified",
      ...overrides,
    },
    requiredCapabilities: ["assistant.respond", "repository.inspect", "artifact.inspect"],
  };
}

test("hard safety failures force RED", () => {
  for (const evidence of [
    { unauthorizedPaidInvocationObserved: true },
    { destructiveDataLossRisk: true },
    { falseSuccessObserved: true },
  ]) {
    assert.equal(evaluatePrimaryControllerReadiness(readyInput(evidence)).status, "RED");
  }
});

test("missing core proof cannot be GREEN", () => {
  for (const evidence of [
    { zeroCreditAnswerVerified: false },
    { persistenceVerified: false },
    { recoveryVerified: false },
    { exactHeadVerified: false },
    { canonicalDeploymentVerified: false },
  ]) {
    assert.notEqual(evaluatePrimaryControllerReadiness(readyInput(evidence)).status, "GREEN");
  }
});

test("peripheral amber capability does not block a proven core", () => {
  const input = readyInput();
  input.requiredCapabilities = ["assistant.respond", "repository.inspect", "artifact.inspect", "m365.open"];
  input.providers = { providers: { microsoft365: { verified: false } } };
  const result = evaluatePrimaryControllerReadiness(input);
  assert.equal(result.core.ready, true);
  assert.notEqual(result.status, "RED");
});

test("complete core evidence can become GREEN", () => {
  assert.equal(evaluatePrimaryControllerReadiness(readyInput()).status, "GREEN");
});
```

- [ ] **Step 2: Run the test and verify module-not-found failure**

Run:

```bash
node --test --test-isolation=none test/primary-controller-readiness.test.mjs
```

Expected: FAIL because `src/primary-controller-readiness.mjs` does not exist.

- [ ] **Step 3: Implement the evaluator with explicit hard blockers**

Create `src/primary-controller-readiness.mjs`:

```js
const HARD_EVIDENCE = Object.freeze([
  ["zeroCreditAnswerVerified", "zero-credit-answer-unverified"],
  ["persistenceVerified", "persistence-unverified"],
  ["recoveryVerified", "recovery-unverified"],
  ["exactHeadVerified", "exact-head-unverified"],
  ["canonicalDeploymentVerified", "canonical-deployment-unverified"],
]);

export function evaluatePrimaryControllerReadiness(input) {
  if (!input || typeof input !== "object" || !input.evidence || !Array.isArray(input.requiredCapabilities)) {
    throw new TypeError("primary-controller-readiness-input-invalid");
  }
  const evidence = input.evidence;
  const blockers = [];
  const warnings = [];

  if (evidence.unauthorizedPaidInvocationObserved === true) blockers.push("unauthorized-paid-invocation-observed");
  if (evidence.destructiveDataLossRisk === true) blockers.push("destructive-data-loss-risk");
  if (evidence.falseSuccessObserved === true) blockers.push("false-success-observed");
  if (input.operations?.interactionReadiness?.ready !== true) blockers.push("assistant-routing-not-ready");
  for (const [key, code] of HARD_EVIDENCE) if (evidence[key] !== true) blockers.push(code);

  if (evidence.contentAccessVerified !== true) warnings.push("content-access-unverified");
  if (evidence.artifactBridgeVerified !== true) warnings.push("artifact-bridge-unverified");
  if (evidence.githubAuthenticatedReadState !== "verified") warnings.push("github-authenticated-read-not-verified");
  if (evidence.idempotencyVerified !== true) warnings.push("idempotency-unverified");
  if (evidence.leaseSafetyVerified !== true) warnings.push("lease-safety-unverified");

  const capabilities = input.requiredCapabilities.map((id) => capabilityStatus(id, input));
  const criticalCapabilityFailure = capabilities.some((item) =>
    ["assistant.respond", "repository.inspect", "artifact.inspect"].includes(item.id) && item.status === "RED");
  if (criticalCapabilityFailure) blockers.push("critical-capability-unavailable");

  const coreReady = blockers.length === 0;
  const status = blockers.length > 0 ? "RED" : warnings.length > 0 || capabilities.some((item) => item.status === "AMBER") ? "AMBER" : "GREEN";
  return Object.freeze({ schemaVersion: 1, status, core: Object.freeze({ ready: coreReady, blockers: Object.freeze([...blockers]) }), capabilities: Object.freeze(capabilities), blockers: Object.freeze([...blockers]), warnings: Object.freeze([...warnings]) });
}

function capabilityStatus(id, input) {
  if (id === "assistant.respond") return Object.freeze({ id, status: input.operations?.interactionReadiness?.ready === true ? "GREEN" : "RED", reason: input.operations?.interactionReadiness?.ready === true ? "routable" : "not-routable" });
  if (id === "repository.inspect") return Object.freeze({ id, status: input.evidence.githubAuthenticatedReadState === "verified" ? "GREEN" : "AMBER", reason: input.evidence.githubAuthenticatedReadState === "verified" ? "authenticated-read-verified" : "authenticated-read-not-verified" });
  if (id === "artifact.inspect") return Object.freeze({ id, status: input.evidence.artifactBridgeVerified === true ? "GREEN" : "AMBER", reason: input.evidence.artifactBridgeVerified === true ? "artifact-bridge-verified" : "artifact-bridge-not-verified" });
  const providerReady = providerCapabilityReady(id, input.providers?.providers ?? {});
  return Object.freeze({ id, status: providerReady ? "GREEN" : "AMBER", reason: providerReady ? "provider-verified" : "safe-degradation" });
}

function providerCapabilityReady(id, providers) {
  if (id === "m365.open") return providers.microsoft365?.verified === true || providers.microsoftQueue?.verified === true;
  if (id === "chrome.open") return providers.signedChrome?.verified === true;
  if (id === "desktop.inspect") return providers.desktop?.verified === true;
  return false;
}
```

- [ ] **Step 4: Run the evaluator tests**

Run:

```bash
node --test --test-isolation=none test/primary-controller-readiness.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit evaluator and tests**

Run:

```bash
git add src/primary-controller-readiness.mjs test/primary-controller-readiness.test.mjs
git commit -m "feat(readiness): add primary controller evaluator"
```

### Task 2: Add deterministic recovery and concurrency certification cases

**Files:**
- Modify: `test/primary-controller-readiness.test.mjs`
- Test alongside: `test/workspace-operations.test.mjs`
- Test alongside: existing task/idempotency and recovery tests discovered by `git grep`.

**Interfaces:**
- Consumes: evaluator evidence booleans plus existing runtime tests for task idempotency, integration leases, and repair incidents.
- Produces: a certification rule that cannot call the core GREEN until those behaviors have concrete passing tests.

- [ ] **Step 1: Add exact evaluator tests for concurrency evidence**

Append:

```js
test("missing concurrency proofs keep an otherwise healthy controller AMBER", () => {
  const result = evaluatePrimaryControllerReadiness(readyInput({ idempotencyVerified: false, leaseSafetyVerified: false }));
  assert.equal(result.status, "AMBER");
  assert.deepEqual(result.warnings.sort(), ["idempotency-unverified", "lease-safety-unverified"]);
});
```

- [ ] **Step 2: Discover and run the existing behavioral suites before adding duplicates**

Run:

```bash
git grep -l "idempotency-conflict\|acquireIntegrationLease\|recovery-rolled-back" -- test
```

Run each returned existing test file with:

```bash
node --test --test-isolation=none <returned-test-file>
```

Expected: PASS. If a behavior has no test, add the smallest focused regression to the existing file that owns that behavior rather than creating a duplicate subsystem test.

- [ ] **Step 3: Run evaluator plus operations suite**

Run:

```bash
node --test --test-isolation=none test/primary-controller-readiness.test.mjs test/workspace-operations.test.mjs
```

Expected: PASS.

### Task 3: Add a machine-readable readiness CLI

**Files:**
- Create: `scripts/primary-controller-readiness.mjs`
- Modify: `package.json`
- Test: `test/primary-controller-readiness-cli.test.mjs`

**Interfaces:**
- Consumes: JSON evidence file path from `MAHORAGA_READINESS_EVIDENCE`, provider readiness report from `MAHORAGA_PROVIDER_READINESS_REPORT`, operations snapshot from `MAHORAGA_OPERATIONS_SNAPSHOT`.
- Produces: JSON on stdout; exit 0 for GREEN/AMBER, exit 2 for RED, exit 1 for invalid input/runtime error.

- [ ] **Step 1: Write a CLI fixture test**

Create `test/primary-controller-readiness-cli.test.mjs` that writes three temporary JSON files representing a healthy operations snapshot, provider report, and evidence record, spawns:

```bash
node scripts/primary-controller-readiness.mjs
```

with those file paths in the three environment variables, then asserts parsed stdout has `schemaVersion === 1`, `status === "GREEN"`, and exit code 0. Add a second fixture with `unauthorizedPaidInvocationObserved: true` and assert exit code 2 and status RED.

- [ ] **Step 2: Verify the CLI test fails before implementation**

Run:

```bash
node --test --test-isolation=none test/primary-controller-readiness-cli.test.mjs
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the CLI as an evidence combiner, not a provider activator**

Create `scripts/primary-controller-readiness.mjs` that reads the three required JSON files with `readFile`, parses them, calls `evaluatePrimaryControllerReadiness`, writes exactly one JSON object plus newline, and sets `process.exitCode = result.status === "RED" ? 2 : 0`. It must not import or call provider worker execution functions.

- [ ] **Step 4: Add the package script**

Add to `package.json` scripts:

```json
"readiness:primary-controller": "node scripts/primary-controller-readiness.mjs"
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
node --test --test-isolation=none test/primary-controller-readiness-cli.test.mjs test/primary-controller-readiness.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit CLI work**

Run:

```bash
git add scripts/primary-controller-readiness.mjs package.json test/primary-controller-readiness-cli.test.mjs
git commit -m "feat(readiness): add machine readable certification command"
```

### Task 4: Add a non-destructive certification evidence collector

**Files:**
- Create: `scripts/collect-primary-controller-evidence.mjs`
- Modify: `package.json`
- Test: `test/collect-primary-controller-evidence.test.mjs`

**Interfaces:**
- Consumes: explicitly supplied URLs/JSON paths and existing local status commands.
- Produces: `state/readiness/primary-controller-evidence.json` with observations only; no paid-provider invocation and no destructive mutation.

- [ ] **Step 1: Define the collector output contract in a failing test**

The test must inject fake readers and assert this exact top-level shape:

```js
{
  schemaVersion: 1,
  generatedAt: "...",
  evidence: {
    zeroCreditAnswerVerified: false,
    unauthorizedPaidInvocationObserved: false,
    destructiveDataLossRisk: false,
    falseSuccessObserved: false,
    persistenceVerified: false,
    recoveryVerified: false,
    idempotencyVerified: false,
    leaseSafetyVerified: false,
    exactHeadVerified: false,
    canonicalDeploymentVerified: false,
    contentAccessVerified: false,
    artifactBridgeVerified: false,
    githubAuthenticatedReadState: "unknown"
  }
}
```

The fixture reader may set fields true only from injected observed evidence.

- [ ] **Step 2: Implement collector dependency injection**

Export `collectPrimaryControllerEvidence({ readers, now })` from the script module and make the CLI entrypoint call it with production readers. Production readers may inspect local files/status and configured HTTP health endpoints; they must not call a licensed language model or perform mutations.

- [ ] **Step 3: Persist the evidence under ignored runtime state**

Create `state/readiness` if needed and write `primary-controller-evidence.json` atomically using a temporary file followed by rename. Do not store secrets, cookies, raw content bytes, or access tokens.

- [ ] **Step 4: Add package command**

Add:

```json
"readiness:collect": "node scripts/collect-primary-controller-evidence.mjs"
```

- [ ] **Step 5: Run collector and evaluator tests**

Run:

```bash
node --test --test-isolation=none test/collect-primary-controller-evidence.test.mjs test/primary-controller-readiness-cli.test.mjs test/primary-controller-readiness.test.mjs
```

Expected: PASS.

### Task 5: Govern and verify the new readiness source

**Files:**
- Mirror through existing baseline tooling: `state/release-baseline/src/primary-controller-readiness.mjs`
- Generated/updated by baseline tooling as required by repository conventions.

**Interfaces:**
- Consumes: repository baseline refresh/verify workflow.
- Produces: release baseline that contains the readiness evaluator and passes full Verify.

- [ ] **Step 1: Refresh the governed release baseline**

Run:

```bash
npm run baseline:refresh
```

Expected: the baseline includes the new governed runtime source without unrelated drift.

- [ ] **Step 2: Verify baseline and full repository**

Run:

```bash
npm run baseline:verify
npm run verify
```

Expected: both pass.

- [ ] **Step 3: Commit baseline update**

Run:

```bash
git add state/release-baseline package.json src scripts test
git commit -m "chore(readiness): govern controller certification harness"
```

### Task 6: Produce the first real certification snapshot

**Files:**
- Runtime-generated: `state/readiness/primary-controller-evidence.json`
- Runtime-generated: readiness JSON on stdout or redirected outside version control.
- Create after observed proof: `docs/readiness/primary-controller-certification.md`

**Interfaces:**
- Consumes: actual current operations/provider/evidence observations after prior convergence plans deploy.
- Produces: current RED/AMBER/GREEN status with explicit blockers and warnings.

- [ ] **Step 1: Collect observations**

Run:

```bash
npm run readiness:collect
```

- [ ] **Step 2: Evaluate observations**

Set the three input paths required by the CLI to the actual collected operations/provider/evidence files, then run:

```bash
npm run readiness:primary-controller
```

Expected: valid schemaVersion 1 JSON. Do not override RED/AMBER fields manually.

- [ ] **Step 3: Write a human-readable evidence summary from the JSON result**

Create `docs/readiness/primary-controller-certification.md` containing the observed main SHA, canonical deployment identity, certification status, hard blockers, AMBER capabilities, and evidence file timestamp. It must state `GREEN` only when the machine-readable evaluator returned GREEN.

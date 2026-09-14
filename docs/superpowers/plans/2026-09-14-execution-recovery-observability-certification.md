# Execution Recovery and Observability Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one deterministic, machine-readable certification harness that converts Mahoraga's observed routing, operations, provider, persistence, recovery, concurrency, and verification evidence into a truthful RED/AMBER/GREEN primary-controller readiness result.

**Architecture:** Build a pure readiness evaluator first, then a CLI that consumes explicit observation files. The evaluator never activates providers and never converts absent evidence into success. Existing idempotency, lease, repair, and operations tests remain authoritative; controlled failure inputs live in tests, not random production chaos.

**Tech Stack:** Node.js >=24, node:test, existing `workspace-operations.mjs`, `provider-readiness.mjs`, SQLite-backed runtime state, package scripts.

**Spec:** `docs/superpowers/specs/2026-09-14-primary-controller-readiness-design.md`

## Global Constraints

- Unauthorized paid-provider spend is forbidden.
- Destructive data loss requires owner approval.
- RED/AMBER/GREEN is risk-weighted: peripheral AMBER capabilities do not automatically block promotion.
- `GREEN` is impossible when paid fallback was observed, destructive-loss risk is unresolved, false-success evidence exists, core routing is unavailable, zero-credit answer execution is unverified, persistence is unverified, recovery is unverified, exact-head verification is absent, or canonical deployment provenance is absent.
- Unknown evidence remains unknown; missing evidence never becomes PASS.
- Fault injection in this plan is fixture-controlled only.
- New governed `src/` files must enter the existing release-baseline refresh/verify process.

---

### Task 1: Implement the pure readiness evaluator

**Files:**
- Create: `src/primary-controller-readiness.mjs`
- Create: `test/primary-controller-readiness.test.mjs`

**Interfaces:**
- Produces: `evaluatePrimaryControllerReadiness(input)`.
- Input keys: `operations`, `providers`, `evidence`, `requiredCapabilities`.
- Output: `{ schemaVersion: 1, status, core, capabilities, blockers, warnings }`.

- [ ] **Step 1: Write the failing evaluator tests**

Create `test/primary-controller-readiness.test.mjs`:

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
  for (const override of [
    { unauthorizedPaidInvocationObserved: true },
    { destructiveDataLossRisk: true },
    { falseSuccessObserved: true },
  ]) assert.equal(evaluatePrimaryControllerReadiness(readyInput(override)).status, "RED");
});

test("missing core proof forces RED", () => {
  for (const override of [
    { zeroCreditAnswerVerified: false },
    { persistenceVerified: false },
    { recoveryVerified: false },
    { exactHeadVerified: false },
    { canonicalDeploymentVerified: false },
  ]) assert.equal(evaluatePrimaryControllerReadiness(readyInput(override)).status, "RED");
});

test("missing concurrency proof keeps a healthy core AMBER", () => {
  const result = evaluatePrimaryControllerReadiness(readyInput({ idempotencyVerified: false, leaseSafetyVerified: false }));
  assert.equal(result.status, "AMBER");
  assert.deepEqual([...result.warnings].sort(), ["idempotency-unverified", "lease-safety-unverified"]);
});

test("complete core evidence becomes GREEN", () => {
  assert.equal(evaluatePrimaryControllerReadiness(readyInput()).status, "GREEN");
});
```

- [ ] **Step 2: Run and verify module-not-found failure**

```bash
node --test --test-isolation=none test/primary-controller-readiness.test.mjs
```

Expected: FAIL because `src/primary-controller-readiness.mjs` does not exist.

- [ ] **Step 3: Implement the evaluator**

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
  if (!input || typeof input !== "object" || !input.evidence || !Array.isArray(input.requiredCapabilities)) throw new TypeError("primary-controller-readiness-input-invalid");
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
  const status = blockers.length > 0 ? "RED" : warnings.length > 0 || capabilities.some((item) => item.status === "AMBER") ? "AMBER" : "GREEN";
  return Object.freeze({ schemaVersion: 1, status, core: Object.freeze({ ready: blockers.length === 0, blockers: Object.freeze([...blockers]) }), capabilities: Object.freeze(capabilities), blockers: Object.freeze([...blockers]), warnings: Object.freeze([...warnings]) });
}

function capabilityStatus(id, input) {
  if (id === "assistant.respond") return Object.freeze({ id, status: input.operations?.interactionReadiness?.ready === true ? "GREEN" : "RED", reason: input.operations?.interactionReadiness?.ready === true ? "routable" : "not-routable" });
  if (id === "repository.inspect") return Object.freeze({ id, status: input.evidence.githubAuthenticatedReadState === "verified" ? "GREEN" : "AMBER", reason: input.evidence.githubAuthenticatedReadState === "verified" ? "authenticated-read-verified" : "safe-fail-closed" });
  if (id === "artifact.inspect") return Object.freeze({ id, status: input.evidence.artifactBridgeVerified === true ? "GREEN" : "AMBER", reason: input.evidence.artifactBridgeVerified === true ? "artifact-bridge-verified" : "safe-unavailable" });
  const providers = input.providers?.providers ?? {};
  const ready = id === "m365.open" ? providers.microsoft365?.verified === true || providers.microsoftQueue?.verified === true
    : id === "chrome.open" ? providers.signedChrome?.verified === true
    : id === "desktop.inspect" ? providers.desktop?.verified === true
    : false;
  return Object.freeze({ id, status: ready ? "GREEN" : "AMBER", reason: ready ? "provider-verified" : "safe-degradation" });
}
```

- [ ] **Step 4: Run evaluator tests**

```bash
node --test --test-isolation=none test/primary-controller-readiness.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit evaluator and tests**

```bash
git add src/primary-controller-readiness.mjs test/primary-controller-readiness.test.mjs
git commit -m "feat(readiness): add primary controller evaluator"
```

### Task 2: Anchor concurrency and recovery evidence to existing behavioral tests

**Files:**
- Verify: `test/runtime.test.mjs`
- Verify: `test/persisted-integration-lease.test.mjs`
- Verify: `test/objective-task-release.test.mjs`
- Verify: `test/workspace-operations.test.mjs`

**Interfaces:**
- `test/runtime.test.mjs` proves API idempotency conflict behavior.
- `test/persisted-integration-lease.test.mjs` proves persisted lease behavior.
- `test/objective-task-release.test.mjs` proves competing lease authority behavior.
- `test/workspace-operations.test.mjs` proves operations/repair observability.

- [ ] **Step 1: Run the four authoritative suites**

```bash
node --test --test-isolation=none test/runtime.test.mjs test/persisted-integration-lease.test.mjs test/objective-task-release.test.mjs test/workspace-operations.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Treat these passes as evidence inputs, not inferred runtime truth**

The later evidence collector may set `idempotencyVerified`, `leaseSafetyVerified`, and `recoveryVerified` true only when the recorded test/operational evidence corresponds to the exact source SHA being certified. A stale test result from another SHA remains false/unknown.

### Task 3: Add the machine-readable readiness CLI

**Files:**
- Create: `scripts/primary-controller-readiness.mjs`
- Modify: `package.json`
- Create: `test/primary-controller-readiness-cli.test.mjs`

**Interfaces:**
- Reads file paths from `MAHORAGA_READINESS_EVIDENCE`, `MAHORAGA_PROVIDER_READINESS_REPORT`, and `MAHORAGA_OPERATIONS_SNAPSHOT`.
- Outputs one JSON object; exits 0 for GREEN/AMBER, 2 for RED, 1 for malformed input/runtime error.

- [ ] **Step 1: Write an exact CLI test**

Create temporary files using `mkdtempSync`, `writeFileSync`, and these objects:

```js
const operations = { interactionReadiness: { ready: true }, verification: { state: "verified" } };
const providers = { providers: {} };
const evidence = {
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
  githubAuthenticatedReadState: "verified"
};
```

Spawn `node scripts/primary-controller-readiness.mjs` with the three temp-file paths in the environment and assert exit code 0, `schemaVersion === 1`, and `status === "GREEN"`. Rewrite only the evidence file with `unauthorizedPaidInvocationObserved: true`, run again, and assert exit code 2 and status RED.

- [ ] **Step 2: Run and verify missing-script failure**

```bash
node --test --test-isolation=none test/primary-controller-readiness-cli.test.mjs
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the CLI**

Create `scripts/primary-controller-readiness.mjs` that imports `readFile` and `evaluatePrimaryControllerReadiness`, reads/parses the three required files, calls the evaluator with `requiredCapabilities: ["assistant.respond", "repository.inspect", "artifact.inspect", "m365.open", "chrome.open", "desktop.inspect"]`, writes `JSON.stringify(result) + "\n"`, and sets `process.exitCode = result.status === "RED" ? 2 : 0`. Wrap the entrypoint so malformed files print a bounded `primary-controller-readiness-input-invalid` error to stderr and set exit code 1. Do not import provider workers.

- [ ] **Step 4: Add package script**

Add:

```json
"readiness:primary-controller": "node scripts/primary-controller-readiness.mjs"
```

- [ ] **Step 5: Run CLI and evaluator tests**

```bash
node --test --test-isolation=none test/primary-controller-readiness-cli.test.mjs test/primary-controller-readiness.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit CLI work**

```bash
git add scripts/primary-controller-readiness.mjs package.json test/primary-controller-readiness-cli.test.mjs
git commit -m "feat(readiness): add machine readable certification command"
```

### Task 4: Add a non-destructive evidence collector

**Files:**
- Create: `scripts/collect-primary-controller-evidence.mjs`
- Modify: `package.json`
- Create: `test/collect-primary-controller-evidence.test.mjs`

**Interfaces:**
- Produces: `collectPrimaryControllerEvidence({ observations, now })`.
- Persists: `state/readiness/primary-controller-evidence.json`.
- Does not invoke language providers or perform mutation.

- [ ] **Step 1: Write the collector test**

Use this exact injected observation object:

```js
const observations = {
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
  contentAccessVerified: false,
  artifactBridgeVerified: false,
  githubAuthenticatedReadState: "fail-closed"
};
```

Assert `collectPrimaryControllerEvidence({ observations, now: () => new Date("2026-09-14T20:00:00.000Z") })` returns `{ schemaVersion: 1, generatedAt: "2026-09-14T20:00:00.000Z", evidence: observations }` with a frozen top-level object. Add a second test that omits `zeroCreditAnswerVerified` and assert `primary-controller-evidence-invalid`.

- [ ] **Step 2: Implement strict observation validation**

The module accepts exactly the 13 evidence keys shown above, requires booleans for the 12 boolean fields, allows `githubAuthenticatedReadState` values `verified`, `fail-closed`, `unavailable`, `unknown`, freezes the result, and throws `primary-controller-evidence-invalid` otherwise.

- [ ] **Step 3: Add CLI persistence**

When executed directly, read a JSON observation file from `MAHORAGA_PRIMARY_CONTROLLER_OBSERVATIONS`, call the pure collector, create `state/readiness`, write `primary-controller-evidence.json.tmp`, then atomically rename it to `primary-controller-evidence.json`. Do not write secrets, cookies, raw private content, or tokens.

- [ ] **Step 4: Add package script and run tests**

Add:

```json
"readiness:collect": "node scripts/collect-primary-controller-evidence.mjs"
```

Run:

```bash
node --test --test-isolation=none test/collect-primary-controller-evidence.test.mjs test/primary-controller-readiness-cli.test.mjs test/primary-controller-readiness.test.mjs
```

Expected: PASS.

### Task 5: Govern and verify the readiness source

**Files:**
- Generated/updated by existing tooling: `state/release-baseline/src/primary-controller-readiness.mjs`
- Generated/updated baseline manifest content as produced by `npm run baseline:refresh`.

- [ ] **Step 1: Refresh the release baseline**

```bash
npm run baseline:refresh
```

Expected: baseline includes the new governed evaluator with no unexplained unrelated drift.

- [ ] **Step 2: Verify baseline and full repository**

```bash
npm run baseline:verify
npm run verify
```

Expected: PASS.

- [ ] **Step 3: Commit baseline and remaining collector work**

```bash
git add state/release-baseline scripts/collect-primary-controller-evidence.mjs package.json test/collect-primary-controller-evidence.test.mjs
git commit -m "chore(readiness): govern controller certification harness"
```

### Task 6: Produce the first real certification snapshot

**Files:**
- Runtime-generated: `state/readiness/primary-controller-evidence.json`
- Create after observed proof: `docs/readiness/primary-controller-certification.md`

- [ ] **Step 1: Build the observations file only from exact-head evidence**

Record the current exact Git SHA and corresponding test/CI/live-canary evidence. Set each boolean to true only when that exact source/deployment has the required proof. Set GitHub authenticated-read state to `verified`, `fail-closed`, `unavailable`, or `unknown` from the actual operator read result.

- [ ] **Step 2: Collect and evaluate**

Set `MAHORAGA_PRIMARY_CONTROLLER_OBSERVATIONS` to the observation file and run:

```bash
npm run readiness:collect
```

Set the readiness CLI's three file-path environment variables to the actual operations snapshot, provider report, and generated evidence file, then run:

```bash
npm run readiness:primary-controller
```

Expected: schemaVersion 1 JSON. Do not override RED/AMBER fields manually.

- [ ] **Step 3: Write the human-readable result**

Create `docs/readiness/primary-controller-certification.md` from the machine result, recording actual main SHA, canonical deployment ID/SHA, status, hard blockers, AMBER capabilities, and evidence timestamp. State `GREEN` only if the machine-readable evaluator returned GREEN.

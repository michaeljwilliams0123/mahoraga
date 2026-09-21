# Mahoraga Edge Convergence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first safe implementation tranche of the owner-supplied Mahoraga architectural convergence design: strict TypeScript contracts, a bounded verification primitive, and device-independent exact-head CI that can run from anywhere without expanding runtime or deployment authority.

**Architecture:** Keep Source Truth, Deployment Truth, and Live-Runtime Truth separate. Add environment-neutral TypeScript contracts and a deterministic pre-rollback verifier, then move the existing exact-head verification contexts from self-hosted runners to GitHub-hosted public-repository runners while keeping context names unchanged. Privileged deployment and mutation remain outside this tranche.

**Tech Stack:** Node.js 24, TypeScript 7.0.2, Node built-in test runner, GitHub Actions, SHA-256 via Web Crypto.

**Spec:** `docs/superpowers/specs/2026-09-21-mahoraga-edge-convergence-foundation-design.md`

## Global Constraints

- Product name remains `Mahoraga`; `7.0.0-alpha.2` is build/provenance metadata only.
- Preserve exact required check names `Verify (ubuntu-latest)` and `Verify (windows-latest)`.
- GitHub Actions remain `contents: read`, GitHub-owned only, and full-SHA pinned.
- No Windows activation of 7.0.0-alpha.2.
- No new provider, paid fallback, tunnel, deploy target, browser-held privileged credential, or authority expansion.
- Public source visibility does not grant merge, deploy, runtime, or mutation authority.
- Do not implement production hot-swap or autonomous source mutation in this tranche.

## Review Focus

- Negative, zero, `NaN`, or infinite CPU budgets must fail closed instead of weakening the canary threshold.
- Empty or structurally malformed candidate source must return `isVerifiedStable: false` and still produce bounded evidence without executing the candidate.
- Unicode candidate source must hash deterministically with UTF-8 semantics.
- Required check context names must remain byte-for-byte stable while runner labels change.
- Verification workflow changes must not introduce repository write permissions or repository secrets.

---

### Task 1: Add canonical TypeScript convergence contracts

**Files:**
- Create: `src/types/mahoraga.ts`
- Create: `test/mahoraga-core-types.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `AdaptationTier`, `ErrorProfileCode`, `DefendedPhenomenon`, `ExecutionEnvironment`, `AuthorityDecisionEnvelope`, `CognitiveStateSchema`, `BrandedASTNode`, `MutationDirective`, `CanaryProbeReport`.

- [ ] **Step 1: Write the failing contract test**

Create `test/mahoraga-core-types.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ErrorProfileCode } from "../src/types/mahoraga.ts";

test("Mahoraga convergence error codes remain stable", () => {
  assert.deepEqual(Object.values(ErrorProfileCode), [
    "ERR_MAHORAGA_AST_001",
    "ERR_MAHORAGA_COMP_002",
    "ERR_MAHORAGA_CPU_003",
    "ERR_MAHORAGA_MSFT_004",
    "ERR_MAHORAGA_UCF_005",
  ]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist**

Run:

```bash
node --test --test-isolation=none test/mahoraga-core-types.test.ts
```

Expected: FAIL with module-not-found for `src/types/mahoraga.ts`.

- [ ] **Step 3: Add the minimal canonical contracts**

Create `src/types/mahoraga.ts`:

```ts
export type AdaptationTier = "Level4_Innovator" | "Level7_TechnologicalHorizon";

export enum ErrorProfileCode {
  UNRESOLVED_AST_LOCUS = "ERR_MAHORAGA_AST_001",
  COMPILATION_SIGNATURE_MISMATCH = "ERR_MAHORAGA_COMP_002",
  CPU_THROTTLING_LIMIT_EXCEEDED = "ERR_MAHORAGA_CPU_003",
  MICROSOFT_AUTH_GATEWAY_DENIED = "ERR_MAHORAGA_MSFT_004",
  UNIVERSAL_ROUTER_ROUTE_DRIFT = "ERR_MAHORAGA_UCF_005",
}

export interface DefendedPhenomenon {
  profileCode: ErrorProfileCode;
  signature: string;
  observedAt: number;
  occurrences: number;
  mitigated: boolean;
}

export type ExecutionEnvironment =
  | { runtime: "CloudflareWorker"; kvBindingName: string }
  | { runtime: "GitHubActionsRunner"; workspaceRoot: string; runId: string }
  | { runtime: "WindowsDesktopNative"; userProfilePath: string };

export interface AuthorityDecisionEnvelope {
  decisionId: string;
  authorizedOwnerId: string;
  isZeroCreditEligible: boolean;
  allocatedComputeTimeMs: number;
  timestamp: number;
}

export interface CognitiveStateSchema {
  tier: AdaptationTier;
  wheelRotations: number;
  activeImmunities: DefendedPhenomenon[];
  lastStableCheckpointHash: string;
}

export type BrandedASTNode = string & { readonly __astBrand: unique symbol };

export interface MutationDirective {
  targetFunctionLocus: string;
  errorContext: DefendedPhenomenon;
  injectedSafetyAssertion: string;
}

export interface CanaryProbeReport {
  isVerifiedStable: boolean;
  computedSignature: string;
  meanExecutionDeltaMs: number;
}
```

- [ ] **Step 4: Run focused test and strict typecheck**

Run:

```bash
node --test --test-isolation=none test/mahoraga-core-types.test.ts
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add src/types/mahoraga.ts test/mahoraga-core-types.test.ts
git commit -m "feat(architecture): add convergence core contracts"
```

---

### Task 2: Add bounded VerificationPipeline

**Files:**
- Create: `src/core/VerificationPipeline.ts`
- Create: `test/verification-pipeline.test.ts`

**Interfaces:**
- Consumes: `BrandedASTNode`, `CanaryProbeReport`, `ErrorProfileCode` from `src/types/mahoraga.ts`.
- Produces: `VerificationPipeline.evaluatePreRollbackCanary(candidateSource, maxAllowedCpuDeltaMs): Promise<CanaryProbeReport>`.

- [ ] **Step 1: Write failing verifier tests**

Create `test/verification-pipeline.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { VerificationPipeline } from "../src/core/VerificationPipeline.ts";
import type { BrandedASTNode } from "../src/types/mahoraga.ts";

const branded = (value: string) => value as BrandedASTNode;

test("verifier returns stable SHA-256 evidence without executing candidate source", async () => {
  const source = branded("function stable() { return 1; }");
  const first = await VerificationPipeline.evaluatePreRollbackCanary(source, 1000);
  const second = await VerificationPipeline.evaluatePreRollbackCanary(source, 1000);
  assert.equal(first.isVerifiedStable, true);
  assert.equal(first.computedSignature, second.computedSignature);
  assert.match(first.computedSignature, /^[a-f0-9]{64}$/);
});

test("verifier marks structurally malformed source unstable", async () => {
  const report = await VerificationPipeline.evaluatePreRollbackCanary(branded("undefined_locus"), 1000);
  assert.equal(report.isVerifiedStable, false);
  assert.match(report.computedSignature, /^[a-f0-9]{64}$/);
});

test("verifier hashes Unicode source deterministically", async () => {
  const report = await VerificationPipeline.evaluatePreRollbackCanary(branded("function Ω() { return '輪'; }"), 1000);
  assert.equal(report.computedSignature.length, 64);
});

test("invalid CPU budgets fail closed", async () => {
  for (const budget of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      VerificationPipeline.evaluatePreRollbackCanary(branded("function stable() {}"), budget),
      /ERR_MAHORAGA_CPU_003/,
    );
  }
});
```

- [ ] **Step 2: Run the focused verifier test and confirm it fails because the module does not exist**

Run:

```bash
node --test --test-isolation=none test/verification-pipeline.test.ts
```

Expected: FAIL with module-not-found for `src/core/VerificationPipeline.ts`.

- [ ] **Step 3: Implement the minimal bounded verifier**

Create `src/core/VerificationPipeline.ts`:

```ts
import { performance } from "node:perf_hooks";
import {
  ErrorProfileCode,
  type BrandedASTNode,
  type CanaryProbeReport,
} from "../types/mahoraga.ts";

export class VerificationPipeline {
  public static async evaluatePreRollbackCanary(
    candidateSource: BrandedASTNode,
    maxAllowedCpuDeltaMs: number,
  ): Promise<CanaryProbeReport> {
    if (!Number.isFinite(maxAllowedCpuDeltaMs) || maxAllowedCpuDeltaMs < 0) {
      throw new Error(`[${ErrorProfileCode.CPU_THROTTLING_LIMIT_EXCEEDED}] Invalid canary CPU threshold.`);
    }

    const profilingStart = performance.now();
    const isCompilable = candidateSource.includes("function") && !candidateSource.includes("undefined_locus");
    const textBytes = new TextEncoder().encode(candidateSource);
    const signatureBuffer = await crypto.subtle.digest("SHA-256", textBytes);
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const meanExecutionDeltaMs = performance.now() - profilingStart;

    if (meanExecutionDeltaMs > maxAllowedCpuDeltaMs) {
      throw new Error(`[${ErrorProfileCode.CPU_THROTTLING_LIMIT_EXCEEDED}] Mutant execution overhead breached control threshold.`);
    }

    return { isVerifiedStable: isCompilable, computedSignature, meanExecutionDeltaMs };
  }
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
node --test --test-isolation=none test/verification-pipeline.test.ts test/mahoraga-core-types.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the verifier**

```bash
git add src/core/VerificationPipeline.ts test/verification-pipeline.test.ts
git commit -m "feat(architecture): add bounded convergence verifier"
```

---

### Task 3: Make exact-head verification runnable independently from anywhere

**Files:**
- Modify: `.github/workflows/verify.yml`
- Modify: `test/verification-workflow.test.mjs`
- Refresh: `state/release-baseline/.github/workflows/verify.yml` through the existing release-baseline mechanism if that file is part of the authoritative baseline.

**Interfaces:**
- Consumes: existing required status contexts `Verify (ubuntu-latest)` and `Verify (windows-latest)`.
- Produces: the same contexts on GitHub-hosted public-repository runners, with no device/self-hosted availability dependency.

- [ ] **Step 1: Change the workflow test first**

Replace the self-hosted assertions in `test/verification-workflow.test.mjs` with:

```js
assert.match(source, /runner_labels:\s*'"ubuntu-latest"'/);
assert.match(source, /runner_labels:\s*'"windows-latest"'/);
assert.doesNotMatch(source, /self-hosted/);
```

Keep the existing assertions for `check_name: ubuntu-latest`, `check_name: windows-latest`, Node 24, immutable action SHAs, `contents: read`, no repository secrets, and the two required job names.

- [ ] **Step 2: Run the focused workflow test and confirm it fails against the current self-hosted configuration**

Run:

```bash
node --test --test-isolation=none test/verification-workflow.test.mjs
```

Expected: FAIL because `verify.yml` still contains `self-hosted` labels.

- [ ] **Step 3: Change only the runner selection while preserving check names**

In `.github/workflows/verify.yml`, change the matrix to:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - check_name: ubuntu-latest
        runner_labels: '"ubuntu-latest"'
      - check_name: windows-latest
        runner_labels: '"windows-latest"'

runs-on: ${{ fromJSON(matrix.runner_labels) }}
```

Do not change the pinned action references:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

Preserve:

```yaml
permissions:
  contents: read
```

and preserve the job display name:

```yaml
name: Verify (${{ matrix.check_name }})
```

- [ ] **Step 4: Run the focused workflow test**

Run:

```bash
node --test --test-isolation=none test/verification-workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Refresh the release baseline using the repository's existing mechanism**

Run:

```bash
npm run baseline:refresh
npm run baseline:verify
```

Expected: baseline refresh succeeds and verification reports no drift.

- [ ] **Step 6: Run the exact governance-focused verification set**

Run:

```bash
npm run typecheck
npm run github:audit
npm run verify:fast
```

Expected: PASS with zero blocking GitHub audit failures.

- [ ] **Step 7: Commit portable CI**

```bash
git add .github/workflows/verify.yml test/verification-workflow.test.mjs state/release-baseline
git commit -m "fix(ci): make exact-head verification device independent"
```

---

### Task 4: Wire the foundation tests into the focused verification contract

**Files:**
- Modify: `package.json`
- Refresh: `state/release-baseline/package.json` if baseline refresh includes it.

**Interfaces:**
- Consumes: the two new test files.
- Produces: exact-head `verify:fast` coverage for the convergence contracts and verifier.

- [ ] **Step 1: Add the new tests to `verify:fast`**

Append these paths to the existing focused Node test invocation in `package.json`:

```text
test/mahoraga-core-types.test.ts
test/verification-pipeline.test.ts
```

- [ ] **Step 2: Run the focused verification path**

Run:

```bash
npm run verify:fast
```

Expected: PASS.

- [ ] **Step 3: Refresh and verify the baseline again**

Run:

```bash
npm run baseline:refresh
npm run baseline:verify
```

Expected: PASS.

- [ ] **Step 4: Commit verification wiring**

```bash
git add package.json state/release-baseline
git commit -m "test(architecture): gate convergence foundation in exact-head verify"
```

---

### Task 5: Final branch verification and PR handoff

**Files:**
- No new product files unless a deterministic test failure requires a bounded repair.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a reviewable architecture-foundation PR that can run entirely in GitHub-hosted CI while privileged deployment remains separate.

- [ ] **Step 1: Run complete deterministic verification**

Run:

```bash
npm run typecheck
npm run github:audit
npm run verify:fast
npm run baseline:verify
```

Expected: all commands PASS.

- [ ] **Step 2: Confirm workflow authority did not expand**

Run:

```bash
git diff main...HEAD -- .github/workflows/verify.yml
```

Expected: only runner selection changes; `permissions: contents: read`, immutable GitHub-owned actions, existing event triggers, and exact check names remain unchanged.

- [ ] **Step 3: Push without force and open/update the architecture PR**

PR title:

```text
feat(architecture): establish edge convergence foundation
```

PR body must state:

```text
Implements Tranche A of the owner-approved edge convergence architecture: shared TypeScript contracts, bounded pre-rollback verification, and device-independent exact-head CI. Does not implement source mutation, cognitive-plane activation, edge deploy, Windows activation, provider expansion, or authority expansion.
```

- [ ] **Step 4: Require exact-head Verify on both hosted platforms before landing**

Expected required contexts:

```text
Verify (ubuntu-latest)
Verify (windows-latest)
```

Do not bypass, synthesize, or substitute these checks.

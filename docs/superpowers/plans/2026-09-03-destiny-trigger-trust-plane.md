# Destiny Trigger Trust Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed repository trust plane for Destiny trigger identity, readiness, receipts, zero-credit preflight, and dispatch admission.

**Architecture:** Keep the existing trusted envelope validator and exact-head merge gates unchanged. Add a separate trust module and non-secret config, a zero-model health CLI, and a readiness admission check at dispatch creation. Receipt handling is observational and monotonic; it never replaces Verify Mahoraga or relay validation.

**Tech Stack:** Node.js 24 ESM, node:test, JSON configuration, existing GitHub Actions verification.

**Spec:** `docs/superpowers/specs/2026-09-03-destiny-trigger-trust-plane-design.md`

## Global Constraints

- Normal cloud/model spend ceiling remains `$0`; no paid fallback.
- Health/preflight code must not invoke a model or external network.
- Unknown/stale/unconfigured readiness fails closed for new Destiny dispatch creation.
- Exact-head Ubuntu + Windows Verify Mahoraga remains mandatory before merge.
- Existing relay validation remains repository-envelope validation only.
- Do not modify self-evolution/core governance, release authority, production activation, or external credentials.

---

### Task 1: Versioned trust manifest and readiness evaluator

**Files:**
- Create: `config/destiny-trigger-trust.json`
- Create: `src/destiny-trigger-trust.mjs`
- Test: `test/destiny-trigger-trust.test.mjs`

**Interfaces:**
- Produces: `validateDestinyTriggerTrustManifest(manifest)`, `evaluateDestinyTriggerReadiness(manifest, observation, { now })`, `validateDestinyTriggerReceipt(manifest, receipt)`, `reduceDestinyReceiptLifecycle(manifest, correlation, receipts, { now })`, `summarizeDestinyTriggerHealth(manifest, readiness, lifecycle)`.

- [ ] **Step 1: Write failing tests** for unconfigured fail-closed state, dedicated actor distinct from owner, exact repository/trigger match, freshness expiry, zero-credit requirement, full hash/head validation, monotonic receipt transitions, duplicate suppression, conflicting delivery rejection, and terminal-state rejection.
- [ ] **Step 2: Run focused test** with `node --test --test-isolation=none test/destiny-trigger-trust.test.mjs`; expect module-not-found/failing assertions.
- [ ] **Step 3: Implement minimal module and initial config**. Initial config uses `receiptTrust.mode="unconfigured"`, repository `michaeljwilliams0123/mahoraga`, owner `michaeljwilliams0123`, `zeroCreditRequired=true`, and a bounded readiness freshness ceiling.
- [ ] **Step 4: Re-run focused test**; expect all trust/readiness/receipt tests to pass.
- [ ] **Step 5: Commit** with `feat: add Destiny trigger trust contract`.

### Task 2: Zero-model readiness CLI

**Files:**
- Create: `scripts/destiny-trigger-health.mjs`
- Test: `test/destiny-trigger-health.test.mjs`

**Interfaces:**
- Consumes: trust manifest + optional observation JSON.
- Produces: one JSON line containing `ready`, `reason`, `status`, actor/fingerprint metadata, `observedAt`, and `zeroCreditEligible`; exit code `0` only when ready, otherwise `1`; malformed input exits `2`.

- [ ] **Step 1: Write failing spawn tests** proving no observation is non-ready, stale/non-zero-credit evidence is non-ready, valid dedicated-actor evidence is ready, and malformed input is rejected.
- [ ] **Step 2: Run focused test** and confirm failure before implementation.
- [ ] **Step 3: Implement CLI using only local file reads and the trust module**; no fetch, HTTP, child model process, or external command execution.
- [ ] **Step 4: Re-run focused test** and confirm pass.
- [ ] **Step 5: Commit** with `feat: add zero-credit Destiny trigger preflight`.

### Task 3: Fail-closed dispatch admission

**Files:**
- Modify: `scripts/destiny-codex-dispatch.mjs`
- Test: `test/destiny-codex-script.test.mjs`

**Interfaces:**
- `create` gains required `--readiness-file <path>` for creation of a new dispatch envelope.
- Existing envelope/idempotency inspection remains allowed without a model invocation, but a new file is not written unless readiness evaluates `ready=true`.

- [ ] **Step 1: Add failing source/behavior tests** asserting `create` loads the trust manifest, requires a readiness file for new dispatches, calls the evaluator, and throws `destiny-trigger-not-ready:<reason>` before writing when not ready.
- [ ] **Step 2: Run focused Destiny script tests** and confirm failure.
- [ ] **Step 3: Implement readiness admission before `writeFile`** while preserving current deterministic dispatch creation, idempotency conflict behavior, and `validate`/`validate-pr` paths.
- [ ] **Step 4: Re-run `test/destiny-codex-script.test.mjs` and `test/destiny-codex-dispatch.test.mjs`**; expect pass.
- [ ] **Step 5: Commit** with `fix: fail closed on unknown Destiny trigger readiness`.

### Task 4: Naming and assurance documentation

**Files:**
- Create: `docs/DESTINY-EVENT-DISPATCH-LANE.md`
- Modify: `docs/GITHUB-CODEX-COORDINATION.md`
- Test: `test/destiny-trigger-docs.test.mjs`

**Interfaces:**
- Documentation distinguishes `Destiny Event Dispatch Lane` from `Destiny Cipher Relay` and states exactly which evidence proves validation, external delivery, execution identity, and readiness.

- [ ] **Step 1: Write failing documentation test** checking required names and boundaries.
- [ ] **Step 2: Run test** and confirm failure.
- [ ] **Step 3: Add/update docs** with current historical PR #40 proof, current fail-closed readiness semantics, and no-credit health behavior.
- [ ] **Step 4: Re-run documentation test** and confirm pass.
- [ ] **Step 5: Commit** with `docs: separate Destiny event dispatch from cipher relay`.

### Task 5: Full verification and PR integration

**Files:**
- No new source files unless verification exposes a defect.

- [ ] **Step 1: Run/obtain `npm run verify` on the exact branch head** through Verify Mahoraga.
- [ ] **Step 2: Require Ubuntu and Windows success on the same exact SHA.**
- [ ] **Step 3: Review changed files for protected/self-evolution scope and confirm none of the excluded governance areas changed.**
- [ ] **Step 4: Open PR referencing issue #85 and document that external Destiny identity remains unconfigured and therefore live dispatch creation is intentionally fail-closed.**
- [ ] **Step 5: Merge only with expected exact head SHA after successful dual-OS verification.**
- [ ] **Step 6: Re-run Verify Mahoraga on merged `main` and update issue #85 with completed vs external remaining layers.**

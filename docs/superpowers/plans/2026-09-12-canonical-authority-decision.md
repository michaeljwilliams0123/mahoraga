# Canonical AuthorityDecision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project Mahoraga's existing owner, provider, cost, routing, and execution evidence into one immutable `AuthorityDecision` contract that drives router allow/hold/deny outcomes without weakening any existing gate.

**Architecture:** Add a small projection module; do not replace existing evaluators. `src/router.mjs` continues to obtain owner, provider, credit-free, billing, and ranked-route evidence, then passes that evidence plus task/candidate metadata into the canonical projector. Legacy sub-decisions move under `authorityDecision.evidence` so the canonical envelope is the routing decision while underlying gates remain independently testable.

**Tech Stack:** Node.js 24 ESM, `node:test`, existing Mahoraga routing/authority/resource-economy modules.

**Spec:** `docs/superpowers/specs/2026-09-12-personal-sovereign-evolution-design.md`

## Global Constraints

- Preserve owner root sovereignty, exact-head verification, rollback, canary, provenance, and branch protection.
- Preserve zero-incremental-cost routing by default; do not add automatic paid fallback.
- Keep control-plane code in Node ESM `.mjs`.
- Reuse current owner authority, provider selection, resource-economy, and routing evaluators; do not create a parallel policy engine.
- Every route result must expose one immutable `authority-decision-v1` envelope, including waiting results.
- Decision precedence: explicit owner/root denial or revocation => `deny`; confirmation/provider/quota/lease/freshness/routing gaps => `hold`; all admitted gates => `allow`.
- Keep credentials and private content out of commits and diagnostics.

---
### Task 1: Define the canonical projection contract

**Files:**
- Create: `src/authority-decision.mjs`
- Create: `test/authority-decision.test.mjs`
- Mirror after green: `state/release-baseline/src/authority-decision.mjs`

**Interfaces:**
- Consumes: `{ ownerGrant, task, candidate, ownerDecision, providerDecision, creditFreeDecision, billingDecision, context, legacyReason }`.
- Produces: `createAuthorityDecision(input)` returning deeply frozen `{ schemaVersion: 1, kind: "authority-decision-v1", decision, reasonCodes, owner, request, provider, execution, timing, evidence }`.

- [ ] **Step 1: Write failing unit tests** proving an admitted deterministic route projects `allow`, explicit owner denial projects `deny`, and provider/quota/confirmation gaps project `hold`; assert all required spec keys exist even when values are null.
- [ ] **Step 2: Run RED** with `node --test --test-isolation=none test/authority-decision.test.mjs`; expected failure is module/function missing.
- [ ] **Step 3: Implement minimal projector** with deterministic reason precedence and deep freezing. Preserve raw legacy sub-decisions only under `evidence`.
- [ ] **Step 4: Run GREEN** with the same command; expected result is all authority-decision tests passing.
- [ ] **Step 5: Commit** `test: define canonical authority decision contract` plus the minimal implementation once green.

### Task 2: Make the router consume the canonical decision

**Files:**
- Modify: `src/router.mjs`
- Modify: `test/router.test.mjs`
- Mirror after green: `state/release-baseline/src/router.mjs`

**Interfaces:**
- Consumes: existing `creditFreeDecision`, `providerDecision`, ranked candidates, `billingDecision`, and `resolveCapabilityAuthority(...)` output.
- Produces: every route result includes `authorityDecision`; `authorityDecision.decision` controls routable vs waiting outcome while legacy route `status/reason/worker/recoveryPlan` remain compatible.
- [ ] **Step 1: Write failing router tests** for: deterministic route exposes canonical `allow`; owner grant removal yields canonical `deny`; missing platform authority yields canonical `hold`; owner confirmation yields canonical `hold`; zero-credit billing/quota rejection yields canonical `hold` while preserving the existing external reason.
- [ ] **Step 2: Run RED** with `node --test --test-isolation=none test/router.test.mjs`; expected failures are missing/new canonical fields, not unrelated routing regressions.
- [ ] **Step 3: Integrate the projector** into `createTaskRouter`. Build one envelope for early holds and selected-candidate outcomes; use `authorityDecision.decision` for the go/hold/deny branch. Keep existing recovery planning and outward `reason` compatibility.
- [ ] **Step 4: Run GREEN** on `test/authority-decision.test.mjs` and `test/router.test.mjs` together.
- [ ] **Step 5: Run nearby regression tests**: `test/power-platform-ucf.test.mjs`, `test/resource-economy.test.mjs`, and any zero-credit provider/router tests found by repository search.
- [ ] **Step 6: Commit** `feat(authority): unify router decision envelope`.

### Task 3: Synchronize governed release baseline

**Files:**
- Modify/create only files emitted by the repository baseline refresh for this slice.

- [ ] **Step 1: Run** `npm run baseline:verify`; expected result before refresh is drift limited to the new/changed governed authority/router files.
- [ ] **Step 2: Run** `npm run baseline:refresh`.
- [ ] **Step 3: Inspect `git status --short` and `git diff --check`**; restore any generated steward/report side effects unrelated to this slice.
- [ ] **Step 4: Re-run** `npm run baseline:verify`; expected PASS.
- [ ] **Step 5: Commit** `chore(release): refresh authority decision baseline`.

### Task 4: Full verification and governed integration

- [ ] **Step 1: Run** `npm run verify` once at the exact branch head; expected exit code 0.
- [ ] **Step 2: Confirm clean diff hygiene** with `git diff --check` and inspect final changed-file list for unrelated work.
- [ ] **Step 3: Push** `feat/canonical-authority-decision` and open a PR to `main` describing RED→GREEN evidence and compatibility behavior.
- [ ] **Step 4: Require exact-head `Verify Mahoraga` success on Ubuntu and Windows. Do not retry Codex review or spend credits.
- [ ] **Step 5: Do not merge in this slice unless the owner separately authorizes that PR after exact-head checks.

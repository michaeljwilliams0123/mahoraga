# Exact-SHA Railway Production Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual owner-only GitHub Actions lane that exact-deploys current verified `main` to canonical Railway production with fail-closed rollback and zero model calls.

**Architecture:** `.github/workflows/railway-promote.yml` supplies only GitHub context and the project-scoped Railway secret to `src/railway-promotion.mjs`. The Node controller owns fixed production IDs, exact-main/check validation, Railway GraphQL mutation/polling, public readiness probes, rollback, and bounded receipts. The workflow and controller are release-baseline essentials.

**Tech Stack:** Node.js 24 ESM, `node:test`, GitHub Actions, GitHub REST API, Railway GraphQL Public API, native `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-14-railway-exact-sha-promotion-design.md`

## Global Constraints

- Canonical repository is `michaeljwilliams0123/mahoraga`, branch `main` only.
- No caller-selected SHA, Railway resource, URL, command, provider, or model.
- Canonical checks are exactly `Verify (ubuntu-latest)` and `Verify (windows-latest)` on target SHA.
- Railway auth is project-scoped secret `RAILWAY_PROJECT_TOKEN`; never print or persist it.
- Only `MAHORAGA_EXPECTED_GIT_SHA` may be mutated before deployment, with `skipDeploys: true`.
- Deploy and rollback use `serviceInstanceDeployV2(..., commitSha:)` only.
- Public success requires `/api/live` and `/api/ready` HTTP 200, exact ready `gitSha`, and `modelInvocations === 0`.
- Merging this feature must not dispatch production; first dispatch remains a separate explicit owner release boundary.

---
### Task 1: Pure promotion authority and probe contract

**Files:**
- Create: `src/railway-promotion.mjs`
- Create: `test/railway-promotion.test.mjs`

**Interfaces:**
- Produces `RAILWAY_PROMOTION_TARGET`, `REQUIRED_VERIFY_CONTEXTS`, `evaluatePromotionAuthority(input)`, `validateCommitSha(value)`, `validatePublicProbe(kind, response, targetSha)`, and `boundedPromotionReceipt(input)`.
- `evaluatePromotionAuthority` consumes GitHub environment identity, current-main SHA, and commit-bound check-run records; returns the admitted target SHA or throws a stable fail-closed code.

- [ ] **Step 1: Write failing tests** for owner/main/repository binding, latest exact check selection, malformed SHA rejection, exact live/ready proof, nonzero model invocation rejection, and secret-free receipt fields.
- [ ] **Step 2: Run RED** with `node --test --test-isolation=none test/railway-promotion.test.mjs`; failures must be missing exports/module behavior, not fixture errors.
- [ ] **Step 3: Implement minimal pure contract** with fixed canonical constants and no network calls.
- [ ] **Step 4: Run GREEN** on `test/railway-promotion.test.mjs` and `git diff --check`.
- [ ] **Step 5: Commit** `test(railway): lock exact promotion authority contract`.

### Task 2: Railway/GitHub execution controller and rollback

**Files:**
- Modify: `src/railway-promotion.mjs`
- Modify: `test/railway-promotion.test.mjs`

**Interfaces:**
- Produces `executeRailwayPromotion({ env, fetchImpl, sleep, now }) -> Promise<receipt>`.
- GitHub reads: current `main` ref and exact-SHA check runs.
- Railway writes: one expected-SHA upsert plus exact deploy; rollback repeats the same two bounded mutations with previous successful commit.

- [ ] **Step 1: Add RED fake-fetch tests** proving already-current no-op, exact target mutation sequence, terminal deployment failure rollback, wrong served SHA rollback, and deploy mutation uncertainty reconciliation.
- [ ] **Step 2: Run RED** and verify failures identify missing execution behavior.
- [ ] **Step 3: Implement fixed API clients** for GitHub REST and `https://backboard.railway.com/graphql/v2`; project token uses `Project-Access-Token` only.
- [ ] **Step 4: Implement bounded polling and rollback**; never retry a returned write response, normalize Railway errors to stable code/trace metadata, and keep receipt content-free.
- [ ] **Step 5: Run GREEN**, `git diff --check`, and commit `feat(railway): add exact-sha promotion controller`.
### Task 3: Owner-only GitHub Actions promotion lane

**Files:**
- Create: `.github/workflows/railway-promote.yml`
- Create: `test/railway-promotion-workflow.test.mjs`

**Interfaces:**
- Workflow has `workflow_dispatch` only, no inputs, `contents: read` and `checks: read`, owner-only job condition, pinned checkout/setup-node actions, and `RAILWAY_PROJECT_TOKEN` secret.
- Workflow checks out `${{ github.sha }}` with `persist-credentials: false`, invokes `node src/railway-promotion.mjs`, and appends only the bounded JSON receipt to the job summary.

- [ ] **Step 1: Write RED workflow-contract tests** for trigger, no inputs, owner gate, permissions, fixed script invocation, project-token secret, no push/schedule/workflow_run, and no arbitrary Railway/SHA environment inputs.
- [ ] **Step 2: Run RED** with `node --test --test-isolation=none test/railway-promotion-workflow.test.mjs`.
- [ ] **Step 3: Create minimal workflow** matching the approved authority boundary; do not add automatic triggers or deployment inputs.
- [ ] **Step 4: Run GREEN** for workflow contract plus controller tests and `git diff --check`.
- [ ] **Step 5: Commit** `build(railway): add owner-gated exact promotion workflow`.

### Task 4: Govern the promotion lane in repair/release baseline

**Files:**
- Modify: `src/repair.mjs`
- Create/update: `state/release-baseline/.github/workflows/railway-promote.yml`
- Create/update: `state/release-baseline/src/railway-promotion.mjs`
- Modify: `state/release-baseline/src/repair.mjs`
- Test: existing release-baseline and GitHub audit suites

**Interfaces:**
- `ESSENTIAL_FILES` includes the new workflow and controller so baseline verification/self-repair cannot silently omit deployment authority code.

- [ ] **Step 1: Add RED assertions** if existing baseline tests do not automatically fail for missing essential copies.
- [ ] **Step 2: Add the two essential paths** to `src/repair.mjs`.
- [ ] **Step 3: Run `npm.cmd run baseline:refresh`** and review that only governed copies/manifested essential changes are produced.
- [ ] **Step 4: Run `npm.cmd run baseline:verify`**, focused repair/audit tests, and `git diff --check`.
- [ ] **Step 5: Commit** `chore(railway): govern production promotion baseline`.
### Task 5: Full verification and PR delivery

**Files:**
- Modify only if verification exposes a legitimate defect within this feature scope.

- [ ] **Step 1: Run focused suite**: `node --test --test-isolation=none test/railway-promotion.test.mjs test/railway-promotion-workflow.test.mjs`.
- [ ] **Step 2: Run `npm.cmd run baseline:verify` and `npm.cmd run verify`**; require exit 0 and no paid/model invocation.
- [ ] **Step 3: Run `git diff --check` and inspect `git status --short`**; exclude generated report churn unrelated to the feature.
- [ ] **Step 4: Fetch current `origin/main` and reconcile without force-push** if main advanced; rerun focused/full gates after any refresh.
- [ ] **Step 5: Push `feat/railway-exact-sha-promotion` and open one non-draft PR** documenting exact head, local verification, zero-model constraint, and separate production-dispatch boundary.
- [ ] **Step 6: Require fresh exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`**; address real review findings test-first.
- [ ] **Step 7: Merge only under normal protected-main policy**. Do not dispatch `.github/workflows/railway-promote.yml` in this task.

## Plan Self-Review

- Spec coverage: every authority, deployment, rollback, receipt, governance, testing, and release-boundary requirement maps to Tasks 1-5.
- Placeholder scan: no deferred implementation placeholders remain.
- Type/interface consistency: Tasks 1-2 define the controller exports consumed by Task 3 and tests; Task 4 governs those exact paths.
- Scope: one subsystem only - exact protected-main to canonical Railway production promotion.
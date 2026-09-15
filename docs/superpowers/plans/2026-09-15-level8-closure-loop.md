# Level 8 Closure Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Level 8 Waves 9-10 as a safe composition layer over Mahoraga's existing evolution and unattended-runtime owners.

**Architecture:** Add a pure Evolution Laboratory decision module upstream of the existing evolution controller, then add a content-minimized Entity Heartbeat receipt builder that observes the authoritative unattended cycle outputs. Integrate one receipt into the current unattended cycle without duplicating growth, research, dispatch, deployment, or memory mutation.

**Tech Stack:** Node.js 24 ESM, `node:test`, SHA-256 via `node:crypto`, existing Mahoraga release-baseline/repair system.

**Spec:** `docs/superpowers/specs/2026-09-15-level8-closure-loop-design.md`

## Global Constraints

- Start from exact fetched `origin/main` SHA `c40ce6c283014b79f0b87a393c62e8d72b3be8ac`.
- No stale branch cherry-pick.
- No paid provider, public tunnel, production activation, or release-boundary weakening.
- All new runtime receipts remain `creditCost: 0`, `paidFallback: false`, `providerRequired: false`.
- Existing `evolution-controller.mjs`, `growth-compounding-loop.mjs`, and `research-assimilation-loop.mjs` retain authority.
- New production files must be mirrored in `state/release-baseline/src/` and covered by immutable repair verification.

---
### Task 1: Evolution Laboratory v2

**Files:**
- Create: `test/evolution-laboratory.test.mjs`
- Create: `src/evolution-laboratory.mjs`
- Create: `state/release-baseline/src/evolution-laboratory.mjs`

**Interfaces:**
- Produces: `createEvolutionExperiment(input, { observedAt })`
- Produces: `validateEvolutionExperiment(value)`
- Produces: `evaluateEvolutionExperiment(value, { verificationSatisfied })`

- [ ] **Step 1: Write failing laboratory tests** covering canonical creation/validation, tamper rejection, negative result, verification hold, and verified positive `graduation-ready` with `controllerEligible: true`.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/evolution-laboratory.test.mjs` and verify RED because `src/evolution-laboratory.mjs` is absent.
- [ ] **Step 3: Implement the minimal pure module.** Canonicalize exact keys, require `isolated: true`, metric values in `[0,1]`, a canonical ISO timestamp, verification in `exact-head|contract-suite|interactive-test|manual-gate`, and fingerprint the exact canonical core with SHA-256.
- [ ] **Step 4: Re-run focused tests** and require all laboratory tests green.
- [ ] **Step 5: Mirror the production module** to the release baseline and commit the task.

### Task 2: Entity Heartbeat v2 receipt

**Files:**
- Create: `test/entity-heartbeat.test.mjs`
- Create: `src/entity-heartbeat.mjs`
- Create: `state/release-baseline/src/entity-heartbeat.mjs`

**Interfaces:**
- Produces: `createEntityHeartbeatReceipt(input)`
- Produces: `validateEntityHeartbeatReceipt(value)`
- Consumes only bounded projections/digests from existing authoritative components; it performs no external writes.

- [ ] **Step 1: Write failing heartbeat tests** for initial observation, material delta against a previous receipt, bounded counts/digests, zero-credit enforcement, exact-key validation, and fingerprint tamper rejection.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/entity-heartbeat.test.mjs` and verify RED because the module is absent.
- [ ] **Step 3: Implement minimal receipt creation/validation** with canonical hashes and strict collection bounds. Do not embed raw prompts, responses, research content, memory statements, or objective descriptions.
- [ ] **Step 4: Re-run focused heartbeat tests** and require green.
- [ ] **Step 5: Mirror the production module** to the release baseline and commit the task.
### Task 3: Integrate one closure receipt into the unattended cycle

**Files:**
- Modify: `src/unattended-credit-free-cycle.mjs`
- Modify: `state/release-baseline/src/unattended-credit-free-cycle.mjs`
- Modify: `test/unattended-credit-free-cycle.test.mjs`

**Interfaces:**
- Consumes: `createEntityHeartbeatReceipt(...)` and optional laboratory evaluations.
- Produces: `cycle.entityHeartbeat` and `asHeartbeatCliReceipt(cycle).unattended.entityHeartbeat`.
- Existing cycle fields and authority semantics remain unchanged.

- [ ] **Step 1: Add failing integration tests** proving a single entity heartbeat is emitted, objective/memory/research/dispatch counts are derived from the existing cycle outputs, the prior receipt drives material-delta evidence, and zero-credit boundaries remain intact.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/unattended-credit-free-cycle.test.mjs test/entity-heartbeat.test.mjs test/evolution-laboratory.test.mjs` and verify the new integration assertions fail for the missing field while the unit tests remain green.
- [ ] **Step 3: Add the smallest integration** after existing research, growth, and foundry admission complete. The entity receipt observes those outputs; it must not rerun them.
- [ ] **Step 4: Re-run the focused integration suite** and require green.
- [ ] **Step 5: Mirror the modified unattended-cycle file** to release baseline and commit the task.

### Task 4: Immutable repair coverage and complete verification

**Files:**
- Modify: `src/repair.mjs`
- Modify: `state/release-baseline/src/repair.mjs`
- Modify: `test/repair.test.mjs`

**Interfaces:**
- Repair inventory must include `src/evolution-laboratory.mjs` and `src/entity-heartbeat.mjs` using the existing exact baseline restore mechanism.

- [ ] **Step 1: Add failing repair assertions** requiring both closure-loop modules in the protected production file set.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/repair.test.mjs` and verify RED because the new files are not protected.
- [ ] **Step 3: Add both paths to repair inventory**, mirror the repair module, and run the repair test green.
- [ ] **Step 4: Run focused closure verification:** `node --test --test-isolation=none test/evolution-laboratory.test.mjs test/entity-heartbeat.test.mjs test/unattended-credit-free-cycle.test.mjs test/repair.test.mjs test/evolution-controller.test.mjs test/level8-compounding-growth.test.mjs test/research-assimilation-loop.test.mjs`.
- [ ] **Step 5: Run** `npm.cmd run baseline:verify`, `git diff --check`, then full `npm.cmd run verify`.
- [ ] **Step 6: Only if every gate is clean**, push the feature branch and open a PR against current `main`; do not merge until exact-head Ubuntu and Windows Verify are both successful.
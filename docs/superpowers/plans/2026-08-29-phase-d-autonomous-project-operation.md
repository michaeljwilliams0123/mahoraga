# Phase D Autonomous Project Operation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Mahoraga complete real registered-project work unattended—inspect, patch, verify, sequence, checkpoint, resume, and roll back—without ChatGPT/Codex credits.

**Architecture:** Add a typed action kernel whose executable roots and commands come only from the immutable project registry. A durable background service advances objective state through leases and content-free checkpoints. Mutation is transactional: validate base, checkpoint, apply, verify, commit receipt or restore.

**Tech Stack:** Node.js 24 ESM, existing SQLite layer, repository worker, supervisor, authenticated loopback API, and `node:test` temporary repositories.

**Spec:** Sovereign reasoning design and zero-credit autonomy addendum dated 2026-08-29.

## Global Constraints

- No generic shell, caller-selected executable, arbitrary arguments, arbitrary working directory, or unrestricted path input.
- Only registry-owned immutable command IDs and normalized project-relative allowlisted paths reach execution.
- Every mutation has a base digest, recoverable checkpoint, deterministic verification, bounded receipt, and automatic rollback on failure.
- Background execution pauses at reserved actions and never invents new authority.
- Normal objectives finish with zero metered calls and zero credits consumed.

### Task 1: Typed Project Action Contract

**Files:**
- Create: `src/project-action-contract.mjs`
- Create: `test/project-action-contract.test.mjs`

**Interfaces:** `validateProjectAction(value, project): ProjectAction` for `project.inspect`, `project.patch`, `project.verify`, and `workflow.run`.

- [ ] Write tests for exact action schemas, normalized relative paths, allowlists, base digest, unified-diff validation, immutable command IDs, bounded workflow length, unknown-field rejection, traversal, symlink escape, executable/args/cwd injection, and reserved actions.
- [ ] Run the focused test and confirm missing-module failure.
- [ ] Implement strict frozen normalization. A workflow contains typed actions only and cannot recursively include `workflow.run`.
- [ ] Run focused tests; require stable reason codes for every rejection.
- [ ] Commit with `git commit -m "feat: define sovereign project actions"`.

### Task 2: Checkpointed Project Action Worker

**Files:**
- Create: `src/project-checkpoint.mjs`
- Create: `src/project-action-worker.mjs`
- Create: `test/project-action-worker.test.mjs`
- Modify: `src/repository-worker.mjs`

**Interfaces:** `executeProjectAction({ objective, action, project, lease }, dependencies): Promise<ActionReceipt>`; `createCheckpoint()` and `restoreCheckpoint()`.

- [ ] In a temporary registered Git project, write failing tests that inspect an allowlisted file, apply a real unified diff with matching base digest, run a registry-owned verification command, and produce a content-free zero-credit receipt.
- [ ] Add failure tests for stale digest, escaping path, failed verification, timeout, and interrupted mutation; assert byte-for-byte restoration and no untracked checkpoint residue.
- [ ] Run the focused test and confirm missing modules.
- [ ] Implement exact-root resolution, checkpoint before write, patch application without shell interpolation, command lookup by registry ID, bounded child process, postcondition evidence, and rollback in `finally` on every non-success terminal state.
- [ ] Run focused tests plus `node --test test/executable-boundary.test.mjs test/verification-workflow.test.mjs`.
- [ ] Commit with `git commit -m "feat: execute checkpointed project actions"`.

### Task 3: Durable Workflow and Background Objective Service

**Files:**
- Create: `src/project-workflow.mjs`
- Create: `src/background-objective-service.mjs`
- Create: `test/background-objective-service.test.mjs`
- Modify: `src/database.mjs`
- Modify: `src/supervisor.mjs`

**Interfaces:** `runProjectWorkflow(objective, dependencies)`; service methods `submit`, `pause`, `resume`, `cancel`, `tick`, and `recover`.

- [ ] Write tests for ordered steps, bounded retry, exclusive objective lease, concurrency ceiling, restart recovery, expired-lease recovery, owner-decision pause, provider-unavailable pause, deterministic continuation without local reasoner, rollback failure escalation, and zero-credit completion.
- [ ] Run the focused test and observe missing schema/service failures.
- [ ] Add append-only objective events and checkpoint metadata containing identifiers, hashes, state, attempts, timestamps, and reason codes only. Recover only from a verified checkpoint and never repeat a committed external effect.
- [ ] Run focused tests plus `node --test test/database.test.mjs test/runtime.test.mjs`.
- [ ] Commit with `git commit -m "feat: add resumable background objectives"`.

### Task 4: Mahoraga Project Portfolio Surface and Real-Task Gate

**Files:**
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Create: `test/project-portfolio-runtime.test.mjs`
- Create: `test/zero-credit-real-task.test.mjs`

**Interfaces:** Authenticated project/objective endpoints for submit, status, pause, resume, cancel, and owner decision; no endpoint accepts raw executable fields.

- [ ] Write API authorization/redaction tests and an end-to-end test that submits a real temporary project patch-and-verify workflow, observes completion after a service tick/restart, validates changed content, and asserts `meteredProviderCalls === 0` and `meteredCreditsConsumed === 0`.
- [ ] Add a second end-to-end test whose verifier fails and assert automatic byte-for-byte rollback plus a failed receipt.
- [ ] Run both tests and confirm absent routes/service wiring.
- [ ] Add the portfolio UI with progress, bounded evidence, pause reason, next owner decision, rollback state, and credit receipt; never render absolute roots, commands, patches, or raw provider content.
- [ ] Run focused tests, full repository verify, inactive-runtime smoke, and the rollback drill. Commit with `git commit -m "feat: operate real projects without credits"`.

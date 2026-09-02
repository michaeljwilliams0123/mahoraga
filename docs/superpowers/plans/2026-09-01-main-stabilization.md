# Mahoraga Main Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Mahoraga 7 `main` to an exact-head green state by fixing autonomous objective authority binding, preserving all current sophistication, and leaving the self-evolution stack untouched.

**Architecture:** Keep objective planning durable and declarative, but move child execution authority to the Supervisor release boundary. Chat intake captures an immutable repository base plus deterministic writable scope; the Supervisor acquires/reuses a bounded integration lease, derives task policy, persists the child task, and prepares the Codex Builder session before dispatch.

**Tech Stack:** Node.js 24, `node:test`, SQLite (`node:sqlite`), Git, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-01-main-stabilization-design.md`

## Global Constraints

- Do not modify `src/evolution-controller.mjs` or its tests/contracts.
- Do not change automatic update/evolution authority in `mahoraga.manifest.json`.
- Do not change repository visibility.
- Preserve the six-node autonomous objective graph.
- Preserve existing protected-root integration checks.
- Merge only after exact-head Windows and Ubuntu GitHub verification is green.

---

### Task 1: Lock the autonomous execution contract with failing tests

**Files:**
- Modify: `test/autonomy-orchestrator.test.mjs`
- Modify: `test/chat-runtime.test.mjs`

**Interfaces:**
- Consumes: `buildAutonomyObjective`, `/api/chat`
- Produces: regression expectations for exact base commit, deterministic allowed paths, and objective creation without authority exceptions.

- [ ] **Step 1: Extend the orchestrator test** to pass an execution contract and assert every `codex.execute` child retains the exact `baseCommit` and `allowedPaths` while no fixed lease ID is stored.
- [ ] **Step 2: Extend the chat runtime test** to assert an interface action produces an objective whose Codex definitions have a valid 40-64 character base SHA and include `cloud`, `src`, and `test` write scopes.
- [ ] **Step 3: Run the focused tests** and confirm they fail against the current implementation because the execution contract is absent and objective reconciliation throws `Codex Builder base commit is invalid.`

### Task 2: Add deterministic autonomous write-scope selection

**Files:**
- Create: `src/autonomy-execution-scope.mjs`
- Create: `test/autonomy-execution-scope.test.mjs`

**Interfaces:**
- Produces: `autonomyAllowedPaths(message: string): readonly string[]`

- [ ] **Step 1: Write tests** for default runtime work, interface work, docs work, provider/manifest work, and release/script work. Assert `.github/workflows` is never returned.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement the minimal deterministic classifier** using bounded keyword groups and a default `src` + `test` scope.
- [ ] **Step 4: Verify GREEN.**

### Task 3: Capture the exact repository base through the repository boundary

**Files:**
- Modify: `src/repository-worker.mjs`
- Modify: `test/repository-worker.test.mjs` if an existing suitable test file is present; otherwise create `test/repository-head.test.mjs`.

**Interfaces:**
- Produces: `readRepositoryHead(): Promise<string>` returning a validated full commit SHA from fixed `git -C ROOT rev-parse HEAD`.

- [ ] **Step 1: Write a failing test** asserting a full hexadecimal commit SHA is returned.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Export the fixed-command helper** without exposing caller-selected executable or arguments.
- [ ] **Step 4: Verify GREEN.**

### Task 4: Persist immutable base/scope in autonomous objective definitions

**Files:**
- Modify: `src/autonomy-orchestrator.mjs`
- Modify: `src/server.mjs`
- Modify: `test/autonomy-orchestrator.test.mjs`
- Modify: `test/chat-runtime.test.mjs`

**Interfaces:**
- `buildAutonomyObjective({ ..., executionContract: { baseCommit, allowedPaths } })`
- `createAutonomousConversation*` receive and forward `executionContract`.

- [ ] **Step 1: Use the failing tests from Task 1.**
- [ ] **Step 2: In `/api/chat` objective intake**, obtain the exact head with `readRepositoryHead()` and scope with `autonomyAllowedPaths(body.content)`; never accept these authority fields from the caller.
- [ ] **Step 3: Validate and freeze the execution contract** in the orchestrator, and copy `baseCommit`/`allowedPaths` onto each `codex.execute` child.
- [ ] **Step 4: Verify the focused orchestrator and chat-intake behavior.**

### Task 5: Route objective child release through policy and lease/session authority

**Files:**
- Modify: `src/database.mjs`
- Modify: `src/supervisor.mjs`
- Modify: `test/database.test.mjs` and/or `test/supervisor.test.mjs`

**Interfaces:**
- `RuntimeDatabase.reconcileObjectives({ submitObjectiveTask? })`
- Supervisor supplies a task submitter that returns a persisted task or `null` when a competing integration lease makes release temporarily unavailable.

- [ ] **Step 1: Write tests** proving a custom objective submitter is used, `null` leaves the child planned, and a returned task marks the child released.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add the optional submitter seam** without changing default database-only behavior used by existing deterministic tests.
- [ ] **Step 4: In Supervisor child release**, derive every objective child through `deriveTaskPolicy` + `policyTaskInput`.
- [ ] **Step 5: For `codex.execute`**, reuse a covering `primary-local-codex` lease or acquire a fresh maximum-duration lease. If another Primary owns the lease, return `null` and retry later. Persist via `submitPolicyTask`, then call `createCodexBuilderSession` before the task can be claimed.
- [ ] **Step 6: Verify focused database/supervisor tests.**

### Task 6: Refresh repository truth without changing self-evolution

**Files:**
- Modify: `docs/PRODUCTION-STATUS.md`
- Create: `docs/verification/7.0.0-alpha.1-main-stabilization.md`

**Interfaces:**
- Produces: human-readable exact-head repository status distinguishing GitHub verification from live Windows runtime evidence.

- [ ] **Step 1: Record the pre-fix PR #76 regression and the exact root cause.**
- [ ] **Step 2: Record the stabilization branch/PR and final exact verified SHA after CI is green.**
- [ ] **Step 3: State explicitly that GitHub does not prove the currently running Windows process/version.**
- [ ] **Step 4: Do not rewrite evolution-controller release receipts or activation semantics.**

### Task 7: Use GitHub-native enforcement and clean stale backlog

**Files:**
- Repository settings: branch protection/ruleset if the connected GitHub interface supports mutation.
- GitHub issues: stale/superseded issue set identified in the September 1 audit.

**Interfaces:**
- Produces: `main` requiring successful Mahoraga verification when supported; stale issues closed with supersession rationale.

- [ ] **Step 1: Attempt to enable a required-check rule for `Verify Mahoraga` on `main` using the connected GitHub setting interface.** If no mutation action exists, do not fake enforcement; record the exact limitation in the PR and verification note.
- [ ] **Step 2: Close clearly stale 3.x deployment issue #9 as superseded by the 7.0 line.**
- [ ] **Step 3: Review #31-#33 and overlapping answer-quality review issues #35/#36/#54 against current code; close only those proven superseded/duplicate.**
- [ ] **Step 4: Do not close #51 solely because it is vague if it still represents an unresolved user request; relabel/rewrite only if necessary.

### Task 8: Exact-head verification and merge

**Files:** none unless CI reveals a new root cause.

- [ ] **Step 1: Run focused tests and `npm run verify:conversation-plane` through GitHub Actions.**
- [ ] **Step 2: Require complete `npm run verify` on Windows and Ubuntu.**
- [ ] **Step 3: Inspect the PR diff and confirm no self-evolution file changed.**
- [ ] **Step 4: Inspect GitHub-native review/check results.**
- [ ] **Step 5: Merge only the exact verified head.**
- [ ] **Step 6: Re-read `main`, the workflow status, and open issue state after merge before declaring completion.**

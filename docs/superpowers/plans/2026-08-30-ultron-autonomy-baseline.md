# Mahoraga Ultron Autonomy Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary Mahoraga conversation create and execute structured autonomous objectives, automatically integrate eligible self-authored pull requests, and hand successful main changes to verified self-update.

**Architecture:** Add a pure autonomy-policy module and pure objective-graph builder, connect them to the existing conversation API, then add a metadata-only GitHub integration workflow backed by a deterministic merge-policy CLI. Reuse existing objective reconciliation, workers, receipts, release packaging, canary activation, and rollback.

**Tech Stack:** Node.js 24 ESM, `node:test`, SQLite-backed existing runtime, GitHub Actions, GitHub CLI/API.

**Spec:** `docs/superpowers/specs/2026-08-30-ultron-autonomy-baseline-design.md`

## Global Constraints

- `mahoraga.manifest.json` remains canonical.
- No unrestricted shell or caller-selected executable enters the supervisor.
- Automatic integration applies only to same-repository Mahoraga branches targeting current `main`.
- Protected root paths cannot be automatically integrated.
- One full `npm run verify` run occurs after focused red/green cycles.
- No provider response body or private chain-of-thought is persisted as debate evidence.
- Existing update checkpoint, canary, and rollback requirements remain mandatory.

---

### Task 1: Canonical autonomy policy

**Files:**
- Create: `src/autonomy-policy.mjs`
- Modify: `mahoraga.manifest.json`
- Modify: `src/config.mjs`
- Test: `test/autonomy-policy.test.mjs`

**Interfaces:**
- Produces: `validateAutonomyPolicy(value)` and `autonomyPolicySnapshot(manifest)`.
- Produces manifest fields consumed by Tasks 2-4.

- [ ] **Step 1: Write the failing test**

Assert baseline mode is `ultron`, conversation/debate/automatic integration are enabled, branch prefixes and protected paths are exact non-overlapping repository paths, concurrency is 1-2, and rollback/canary flags cannot be false.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-isolation=none test/autonomy-policy.test.mjs`

Expected: failure because `src/autonomy-policy.mjs` and manifest policy do not exist.

- [ ] **Step 3: Implement minimal policy**

Return a frozen normalized object. Reject unknown fields, unsafe paths, wildcard branch prefixes, disabled rollback/canary, public-listener permission, and automatic protected-root mutation.

- [ ] **Step 4: Verify GREEN**

Run the focused test and confirm zero failures.

### Task 2: Conversation-to-debate objective graph

**Files:**
- Create: `src/autonomy-orchestrator.mjs`
- Modify: `src/server.mjs`
- Test: `test/autonomy-orchestrator.test.mjs`
- Test: `test/control-center-intake-runtime.test.mjs`

**Interfaces:**
- Consumes: `autonomyPolicySnapshot(manifest)`.
- Produces: `buildAutonomyObjective({ conversationId, message, dataClass, taskArea, requestedMode })`.
- Produces API result `{ message, objective }` for qualifying conversation posts.

- [ ] **Step 1: Write failing graph tests**

Assert exact nodes `propose`, `challenge`, `synthesize`, `implement`, `verify`, `integrate`; exact dependency ordering; maximum two parallel initial lanes; `codex.execute` for reasoning/build work; `repository.verify` for verification; and `merge-after-verify` in integration criteria.

- [ ] **Step 2: Verify RED**

Run both focused test files. Expected failure: missing orchestrator and no objective in message response.

- [ ] **Step 3: Implement graph and route integration**

When a user message has `requiresResponse: true` and policy conversation activation is enabled, persist the message, create the objective through `database.createObjective`, and return both. Keep `requiresResponse: false` behavior unchanged. Use a stable idempotency/correlation token derived from the message ID, not message content.

- [ ] **Step 4: Verify GREEN**

Run both focused test files and confirm zero failures.

### Task 3: Deterministic automatic merge policy

**Files:**
- Create: `src/autonomous-integration.mjs`
- Create: `scripts/autonomous-integration.mjs`
- Create: `.github/workflows/autonomous-integration.yml`
- Modify: `src/github-audit.mjs`
- Test: `test/autonomous-integration.test.mjs`
- Test: `test/github-audit.test.mjs`

**Interfaces:**
- Consumes: normalized autonomy policy plus GitHub workflow/PR metadata.
- Produces: `evaluateAutonomousIntegration(input, policy)` returning `{ eligible, reason, pullRequestNumber, headSha }`.
- CLI accepts a JSON metadata file and emits one bounded JSON decision.

- [ ] **Step 1: Write failing policy tests**

Cover eligible same-repository branch, failed/stale workflow, fork, draft, wrong base, changed main, conflict, ineligible prefix, protected path, and root-governance mutation.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-isolation=none test/autonomous-integration.test.mjs test/github-audit.test.mjs`

Expected: missing module/workflow failures.

- [ ] **Step 3: Implement policy, CLI, and workflow**

Use `workflow_run` for `Verify Mahoraga`, `pull-requests: write`, and `contents: write`. Do not check out PR code. Query workflow-associated PR metadata and changed files with GitHub API, evaluate locally against trusted main policy, then run `gh pr merge --squash --delete-branch` only for `eligible: true`. Serialize with one non-cancelling concurrency group.

- [ ] **Step 4: Verify GREEN**

Run the focused tests and confirm the audit accepts the new intentionally write-capable workflow only when it matches the exact trusted pattern.

### Task 4: Automatic release handoff and completion verification

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/autonomous-integration.yml`
- Modify: `docs/GITHUB-OPERATIONS.md`
- Modify: `README.md`
- Test: `test/update-contract.test.mjs`
- Test: `test/github-operations-docs.test.mjs`

**Interfaces:**
- Consumes: successful autonomous merge SHA.
- Produces: reusable release workflow call for stable channel after successful main verification.

- [ ] **Step 1: Write failing release-handoff tests**

Assert automatic integration records merged SHA, main verification remains required before release, release packages exact main SHA, and release workflow cannot activate a device.

- [ ] **Step 2: Verify RED**

Run focused update/docs tests. Expected failure because automatic release handoff is absent.

- [ ] **Step 3: Implement reusable release handoff and concise docs**

Allow `release.yml` through `workflow_call` with `stable` input while preserving owner-only manual dispatch. Trigger it only after successful main verification associated with an autonomous merge. Keep attestation and immutable archive behavior unchanged.

- [ ] **Step 4: Verify focused GREEN**

Run focused update/docs tests and confirm zero failures.

- [ ] **Step 5: Run the single full gate**

Run: `npm run verify`

Expected: manifest, coordination, repository audit, and all Node tests pass with zero failures.

- [ ] **Step 6: Commit and push**

Commit the autonomy core to `upgrade/ultron-autonomy-baseline-20260830`, push it, create a pull request, and let the Windows/Linux verification matrix settle before integration.


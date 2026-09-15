# Recipient-Bound Teams Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recipient-bound, attended, single-attempt Microsoft Teams `communication.send` capability with verified UI Automation and content-free receipts.

**Architecture:** Extend the existing desktop worker with one fixed Teams-specific side-effect path. Structured intake vaults `{recipient,message}` inside the existing requested-outcome content channel; readiness uses a manual canary mode so startup never sends, while the first explicit attended single-attempt send may bootstrap/refresh its own canary after verified completion.

**Tech Stack:** Node.js 24 ESM, node:test, PowerShell + Windows UI Automation, SQLite task/readiness state, Mahoraga manifest/router/supervisor.

**Spec:** `docs/superpowers/specs/2026-09-14-recipient-bound-teams-send-design.md`

## Global Constraints

- No broadcast, directory discovery, inferred recipient, Graph credentials, generic UIA, blind Enter, or caller-selected shell/script.
- `communication.send` is attended/local, deterministic-cost, single-attempt, and has no fallback worker.
- Startup/readiness refresh must never send a message.
- Raw recipient/message/window/chat/accessibility content must never enter receipts or logs.
- Existing desktop/read/planner behavior must remain unchanged.
- Full `npm run verify`, `git diff --check`, and exact-head Ubuntu + Windows Verify are required before merge.

---

### Task 1: Register manual-canary communication capability

**Files:** `mahoraga.manifest.json`, `src/config-legacy.mjs`, `src/capability-readiness.mjs`, `test/config.test.mjs`, `test/capability-readiness.test.mjs`

**Interfaces:** Produces manifest capability `communication.send`, canary mode `manual`, and a narrowly bounded readiness bootstrap rule for attended single-attempt tasks.
- [ ] Write failing tests that require the desktop worker to advertise `communication.send`, require canary mode `manual`, and reject any unknown canary mode.
- [ ] Write failing readiness tests proving ordinary writes still require a fresh canary, while only attended `communication.send` tasks with an authority session and `maximumAttempts: 1` may pass `never`/`stale` bootstrap readiness.
- [ ] Run `node --test test/config.test.mjs test/capability-readiness.test.mjs` and confirm RED for the new contract.
- [ ] Add the manifest/config/readiness minimum implementation.
- [ ] Re-run the focused tests and require GREEN.
- [ ] Commit: `feat(teams): register manual send readiness boundary`.

### Task 2: Add structured recipient intake and single-attempt policy

**Files:** `src/task-policy.mjs`, `test/task-policy.test.mjs`, `test/database.test.mjs`

**Interfaces:** Consumes `communication.send`; produces a task whose `requestedOutcome` is a JSON execution envelope with exactly `recipient` and `message`, and whose maximum attempts is always one.

- [ ] Write failing policy tests for explicit recipient + message, missing/broad recipient rejection, attended-session requirement, forced `maximumAttempts: 1`, and unchanged non-send task behavior.
- [ ] Write/extend an idempotency test proving reuse of the same send task key returns the existing task instead of creating a second side effect candidate.
- [ ] Run `node --test test/task-policy.test.mjs test/database.test.mjs` and confirm RED.
- [ ] Add `recipient` to bounded public intake only for `communication.send`; serialize `{recipient,message}` into requested outcome and force one attempt.
- [ ] Re-run focused tests and require GREEN.
- [ ] Commit: `feat(teams): bind recipient and single-attempt send policy`.

### Task 3: Implement fixed Teams UI Automation send

**Files:** `src/desktop-worker.mjs`, `test/desktop-worker.test.mjs`

**Interfaces:** Consumes fixed JSON envelope `{recipient,message}`; produces verified/content-free receipt metadata with hashes and bounded booleans/reason code only.
- [ ] Write failing tests for positive verified send; non-Windows rejection; malformed/broad envelope; recipient mismatch; draft mismatch; missing/disabled Send; post-send failure; and receipt metadata containing no raw recipient/message/window/chat text.
- [ ] Run `node --test test/desktop-worker.test.mjs` and confirm RED specifically because `communication.send` is unsupported.
- [ ] Add one fixed `TEAMS_SEND_SCRIPT` using Windows UI Automation. Pass recipient/message only through process environment. Require one `ms-teams` window, exact recipient binding, exact draft readback, native Send invocation, and post-send empty composer/same-recipient proof.
- [ ] Normalize only hashes, booleans, counts, action/application identifiers, and bounded reason code into receipt metadata.
- [ ] Re-run `node --test test/desktop-worker.test.mjs` and require GREEN.
- [ ] Commit: `feat(teams): execute verified recipient-bound send`.

### Task 4: Route execution and promote verified completion to canary

**Files:** `src/worker-process.mjs`, `src/supervisor.mjs`, `src/receipt-registry.mjs`, `test/receipt-registry.test.mjs`, `test/supervisor.test.mjs`

**Interfaces:** Routes `communication.*` only to the desktop executor, registers receipt family `communication`, skips manual startup canaries, and records a fresh canary only after a verified real send completion.

- [ ] Write failing receipt test proving `communication.send` has its own family and rejects content-bearing evidence.
- [ ] Write failing supervisor/worker contract tests proving manual canaries are skipped at startup and a successful `communication.send` completion refreshes readiness while failure does not.
- [ ] Run focused tests and confirm RED.
- [ ] Add `communication` receipt family, worker dispatch, manual-canary skip, and verified-completion readiness update.
- [ ] Re-run focused tests and require GREEN.
- [ ] Commit: `feat(teams): persist verified send readiness evidence`.

### Task 5: Preserve planner safety and document the capability

**Files:** `test/conversation-capability-planner.test.mjs`, `docs/PROVIDER-ADAPTER-CONTRACTS.md`, `src/repair.mjs`, `state/release-baseline/mahoraga.manifest.json`, `state/release-baseline/src/capability-readiness.mjs`, `state/release-baseline/src/config-legacy.mjs`, `state/release-baseline/src/desktop-worker.mjs`, `state/release-baseline/src/receipt-registry.mjs`, `state/release-baseline/src/supervisor.mjs`, `state/release-baseline/src/task-policy.mjs`, `state/release-baseline/src/worker-process.mjs`.
- [ ] Extend planner regression coverage so broad Teams sends remain unavailable and ordinary Microsoft reads are unaffected. Do not infer a recipient from free-form text in this phase.
- [ ] Document structured `communication.send`, attended requirement, recipient binding, single-attempt semantics, manual canary bootstrap, and receipt privacy.
- [ ] Add `src/desktop-worker.mjs` to `ESSENTIAL_FILES`, then refresh exactly the listed release-baseline mirrors after source behavior is final.
- [ ] Run planner/docs/baseline focused tests and require GREEN.
- [ ] Commit: `docs(teams): document bounded communication send`.

### Task 6: Full verification and protected integration

**Files:** no new behavior; inspect the complete branch diff.

- [ ] Run `git diff --check`.
- [ ] Run all focused Teams/policy/readiness/receipt/supervisor tests again from the committed tree.
- [ ] Run `npm.cmd run verify`; require 0 failures and healthy repository/protection/baseline checks.
- [ ] Fetch `origin/main`; if the base advanced, rebase without force-pushing published history and rerun the full gate.
- [ ] Push `feat/issue-376-teams-send`, create/update the PR linked to #376, and document the exact test evidence.
- [ ] Require exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` success, no unresolved blocking reviews, and current-base freshness.
- [ ] Merge only through protected auto-merge or permitted squash fallback; do not bypass repository rules.
- [ ] Keep the live attended send smoke test separate from merge unless an explicit harmless recipient/message is owner-designated at execution time.

## Self-review

The plan covers every approved design requirement: separate send capability, explicit recipient, vaulted message envelope, native Send invocation, post-send verification, single-attempt/idempotency, content-free receipt family, non-side-effecting startup, manual canary bootstrap/refresh, broad-recipient protection, and exact-head verification. No paid/model route or generic automation surface is introduced.
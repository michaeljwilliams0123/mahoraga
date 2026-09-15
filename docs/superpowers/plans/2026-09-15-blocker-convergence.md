# Mahoraga Blocker Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the live Mahoraga blockers without weakening zero-credit, authentication, provenance, or rollback controls.

**Architecture:** Repair capability discovery at the source, preserve optional-provider fail-closed semantics, and use the existing exact-head promotion path. Environment-only integrations are repaired on the live host; source changes happen only in this isolated exact-main worktree.

**Tech Stack:** Node.js 24, node:test, PowerShell/Windows, GitHub Actions, Railway, SQLite.

**Spec:** Live runtime evidence and issues #455, #377, #376.

## Global Constraints

- Product identity remains `Mahoraga`.
- Never convert zero-credit admission into a paid fallback.
- Keep owner-session HMAC, replay, CSRF, same-origin, and secret-redaction controls intact.
- Required merges must pass exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`.
- Do not write mutable runtime state into the verification worktree.
- Prefer existing installed applications over installing duplicate runtimes.

---

### Task 1: Restore Codex Desktop CLI discovery

**Files:** `src/question-model.mjs`, primary-Codex provider discovery source, matching release-baseline mirrors, focused tests.

- [ ] Add a failing test proving a bounded Codex Desktop path under `%LOCALAPPDATA%\\OpenAI\\Codex\\bin\\<version>\\codex.exe` is discovered when `codex` is absent from PATH.
- [ ] Run the focused test and confirm the expected discovery failure.
- [ ] Implement the minimal bounded path discovery shared by question-model and builder probes.
- [ ] Re-run focused tests and the authoritative verification suite.
- [ ] Commit the isolated fix.
### Task 2: Restore signed-Chrome and Google readiness

**Files:** `src/signed-chrome-worker.mjs`, release-baseline mirror, signed-Chrome/Google tests.

- [ ] Add a failing test for Chrome discovery when Program Files exists but the worker environment omits `ProgramFiles`/`LOCALAPPDATA`.
- [ ] Verify the test fails for the current implementation.
- [ ] Add bounded well-known Windows Chrome paths without allowing arbitrary caller paths.
- [ ] Verify signed-Chrome and Google health tests and full Verify.
- [ ] Commit independently.

### Task 3: Unblock zero-credit answering safely

**Files:** zero-credit manifest/provider wiring and focused admission tests only if a genuine zero-dollar backend can be verified.

- [ ] Inventory existing authenticated/free provider options without reading secret values.
- [ ] If a true zero-dollar OpenAI-compatible endpoint is available, configure it and run `assistant.health` before any answer canary.
- [ ] If no verified-zero backend exists, preserve fail-closed behavior and record the external authentication/configuration boundary instead of fabricating green status.
- [ ] Keep licensed Codex as a separately classified fallback, never as zero-credit evidence.

### Task 4: Microsoft and Teams integration readiness

- [ ] Re-probe PAC availability and authenticated Microsoft surface.
- [ ] Prefer existing M365 attended capability when PAC is unavailable; do not fake Power Platform discovery.
- [ ] Keep PR #521 draft until its fixed Teams executor is safe, bounded, recipient-specific, and exact-head green.
- [ ] Record the precise external-auth or executable blocker if it cannot be completed without account interaction.

### Task 5: Promotion and production convergence

- [ ] Verify Railway deploys the exact post-merge main SHA and public health/readiness stay green.
- [ ] Verify port 4783 converges to exact main with fresh canaries.
- [ ] Use the repository's existing governed convergence controls for 4782 only after candidate verification.
- [ ] Preserve rollback evidence and do not treat retired/noncanonical Railway services as production authority.
- [ ] Post status-only continuity updates to the relevant PRs/issues.

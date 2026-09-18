# Canonical Entry and Credit Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Railway workspace the effortless Mahoraga entry point, remove routine relay pairing from cloud use, preserve bounded licensed escalation, and correct Windows/rollback presentation.

**Architecture:** Keep Railway as the server-capable workspace and GitHub `main` as source authority. Same-origin owner sessions are primary; Cloudflare signed assertions and encrypted relay remain authenticated alternatives. Zero-credit remains default and licensed providers remain explicit, bounded escalation with persistent quota/backoff controls.

**Tech Stack:** Node 24 ESM, Next.js App Router, TypeScript, SQLite, GitHub Actions, Railway.

**Spec:** `docs/superpowers/specs/2026-09-15-canonical-entry-credit-escalation-design.md`

## Global Constraints
- Do not touch runtime ports 4783 or 4792.
- Do not weaken owner auth, CSRF/replay protection, AuthorityDecision, protected tests, release baseline, or evidence semantics.
- Do not create an automatic licensed retry loop.
- Vercel remains retired.

---

### Task 1: Canonical repository and Pages entry
**Files:** `README.md`, `.github/workflows/pages.yml`, `scripts/build-pages-static.mjs`, matching tests/baseline mirrors.
- [ ] Write RED tests requiring the canonical Railway URL and a static Pages launcher/redirect contract.
- [ ] Implement the minimal launcher while keeping server-only runtime routes excluded from static export.
- [ ] Update README owner entry copy and test the Pages build helper.
- [ ] Commit.
### Task 2: Same-origin owner session without normal pairing
**Files:** `cloud-app/lib/cloud-owner-gateway.ts`, `cloud-app/components/workspace.tsx`, `cloud-app/components/workspace/chat-view.tsx`, owner/session contract tests.
- [ ] Write RED tests proving a request with no cookie and no signed assertion returns `cloud-owner-auth-required` before assertion-secret lookup.
- [ ] Preserve signed-assertion validation when assertion headers are present.
- [ ] Change normal cloud UI fallback to owner sign-in/status; keep pairing under Advanced/recovery only.
- [ ] Run owner/session/UI contract tests and commit.

### Task 3: Bounded ChatGPT/Codex escalation
**Files:** `cloud-app/components/workspace.tsx`, `cloud-app/components/workspace/chat-view.tsx`, provider docs/tests as required.
- [ ] Preserve `zero-codex` as the first request policy.
- [ ] Keep `licensed-approved` as a one-turn answer escalation exposed only after zero-credit unavailability.
- [ ] Surface that Codex/Workspace Agent are bounded licensed lanes and that quota/backoff suppresses repeated attempts.
- [ ] Ensure build/ship quick actions do not silently switch to licensed execution.
- [ ] Run cloud/chat/runtime routing tests and commit.

### Task 4: Active Windows versus legacy rollback
**Files:** `cloud-app/components/workspace.tsx`, `cloud-app/components/cockpit/CommandCockpit.tsx`, cloud session contract/tests.
- [ ] Write RED copy/contract tests that prohibit presenting `3.6.0` as the active Windows runtime.
- [ ] Label `3.6.0` only as a legacy rollback predecessor and prefer observed runtime version/provenance for active state.
- [ ] Preserve the fallback compatibility contract until a separately governed rollback migration changes it.
- [ ] Run focused UI/session tests and commit.

### Task 5: Protected mirrors and integration
**Files:** `state/release-baseline/**` for every protected file changed.
- [ ] Refresh byte-identical governed mirrors only for protected production files changed by Tasks 1-4.
- [ ] Run focused tests, PowerShell/static-export checks as applicable, then `npm.cmd run verify`.
- [ ] Review diff for secrets, port 4783/4792 changes, auth widening, or automatic paid fallback.
- [ ] Push branch, open PR, require exact-head Verify, and merge only when green.

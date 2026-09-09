# Signed Browser Live Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped attended signed-Chrome/Google Workspace lane canonical, observable, and evidence-backed.

**Architecture:** Keep the existing `signed-chrome` and `google-workspace` workers. Extend sanitized provider readiness and gap audit so runtime truth matches the effective manifest, while preserving no-CDP/no-profile-export boundaries.

**Tech Stack:** Node.js 24, ESM, node:test, PowerShell readiness probe.

**Spec:** `docs/superpowers/specs/2026-09-08-signed-browser-live-readiness-design.md`

## Global Constraints
- GitHub `main` remains authoritative.
- No CDP/DevTools listener, profile export, cookie/token read, or public tunnel.
- Provider readiness cannot persist paths, URLs, page content, credentials, prompts, or model output.
- Canonical Ubuntu and Windows Verify remain the only merge gates; Vercel is non-blocking.

### Task 1: Red tests for canonical/browser readiness
**Files:** Modify `test/google-workspace-signed-chrome.test.mjs`, `test/provider-readiness.test.mjs`, `test/gap-audit.test.mjs`.
- [ ] Add assertions for `browser.signedSessionEnabled`, signedChrome/googleWorkspace readiness, Google connector readiness, and closed signed-browser gap.
- [ ] Run the three tests and confirm they fail for the missing readiness/config behavior.

### Task 2: Minimal implementation
**Files:** Modify `mahoraga.manifest.json`, `src/provider-readiness.mjs`, `scripts/provider-readiness.mjs`, `src/gap-audit.mjs` plus release baseline mirrors.
- [ ] Enable the canonical signed-session flag and require the existing signed-Chrome contract to close the audit gap.
- [ ] Add bounded signedChrome/googleWorkspace provider states and probes; derive Google connector readiness from them.
- [ ] Refresh the release baseline and run the focused tests green.

### Task 3: Live proof and integration
- [ ] Run `npm run providers:probe` on Windows and verify signedChrome/Google Workspace readiness without activation side effects.
- [ ] Run `npm run gap:audit`, full `npm test`, `npm run baseline:verify`, `git diff --check`, and authenticated `npm run verify`.
- [ ] Commit, push, open PR, require Ubuntu + Windows Verify, and merge only the exact verified head.
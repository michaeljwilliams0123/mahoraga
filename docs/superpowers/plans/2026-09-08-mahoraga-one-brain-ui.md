# Mahoraga One Brain UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a premium chat-first Mahoraga UI with voice, brain-connected quick actions, and brain-routed code shipping.

**Architecture:** Keep the browser as a thin client. Extend only presentation and RuntimeRelay-facing intents; execution remains inside the paired core and existing conversation gateway. One-click actions submit bounded natural-language owner intents through the same core path rather than adding direct GitHub/browser authority.

**Tech Stack:** Next.js 16, React 19, TypeScript, RuntimeRelay WebSocket client, Web Speech APIs when supported, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-mahoraga-one-brain-ui-design.md`

## Global Constraints
- GitHub `main` remains authoritative.
- Browser never receives GitHub credentials or arbitrary command execution authority.
- No Codex code review.
- Vercel remains non-blocking.
- No paid fallback.
- Existing artifact size/security limits remain unchanged.

---

### Task 1: Brain-connected action model

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Test: `cloud-app/test/singular-ui-contract.test.mjs`

**Interfaces:**
- Produces `runQuickAction(action)` that submits bounded Build/Report/Handoff/Create/Ship intents through `submitCore`.
- Ship uses `mode: "act"` without direct GitHub APIs.

- [ ] Write failing source-contract tests for six quick actions and no direct GitHub API usage.
- [ ] Run `npm.cmd test -- singular-ui-contract.test.mjs` and observe RED.
- [ ] Implement minimal action definitions and brain-routed submission.
- [ ] Re-run focused tests to GREEN.

### Task 2: Mahoraga One chat shell

**Files:**
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Modify: `cloud-app/components/workspace/workspace-shell.tsx`
- Modify: `cloud-app/app/globals.css`
- Test: `cloud-app/test/singular-ui-contract.test.mjs`

**Interfaces:**
- Consumes quick actions and brain status from Task 1.
- Produces chat-first navigation, quick-action rail, compact brain status, and advanced drill-down affordance.

- [ ] Write failing UI contract tests for Chat/Work/Files/Advanced hierarchy and quick-action labels.
- [ ] Run focused tests and observe RED.
- [ ] Implement the minimal shell and responsive styles.
- [ ] Re-run focused tests to GREEN.

### Task 3: Voice chat controls

**Files:**
- Create: `cloud-app/lib/voice-chat.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Test: `cloud-app/test/voice-chat-contract.test.mjs`

**Interfaces:**
- `createVoiceController(...)` uses browser SpeechRecognition when available and speechSynthesis for read-aloud.
- Unsupported browsers remain fully usable by typing.

- [ ] Write failing contract tests for voice support detection, start/stop dictation, and read-aloud hooks.
- [ ] Run focused tests and observe RED.
- [ ] Implement progressive-enhancement voice support with no remote voice provider.
- [ ] Re-run focused tests to GREEN.

### Task 4: Premium visual language and work cards

**Files:**
- Modify: `cloud-app/app/globals.css`
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Modify: `cloud-app/components/workspace/workspace-shell.tsx`
- Test: `cloud-app/test/singular-ui-contract.test.mjs`

**Interfaces:**
- Preserves existing RuntimeRelay and task semantics while changing only presentation.
- Uses original abstract energy/graffiti motifs; no copyrighted character art or logos.

- [ ] Add failing source-contract checks for the new Mahoraga One labels and removal of primary-level worker/route jargon.
- [ ] Run focused tests and observe RED.
- [ ] Implement white/silver surfaces, responsive layout, work cards, and advanced disclosure.
- [ ] Re-run focused tests to GREEN.

### Task 5: Verification and release readiness

**Files:**
- Update docs only if behavior changes from the spec.

- [ ] Run `npm.cmd verify` in `cloud-app`.
- [ ] Run root focused conversation/relay/workspace tests.
- [ ] Run full `npm.cmd test` and `npm.cmd run verify` before completion.
- [ ] Run `git diff --check` and inspect `git status`.
- [ ] Commit only the tested head; open a PR and require the normal Ubuntu/Windows verification gates before merge.

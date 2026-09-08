# Mahoraga Twin Federation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic twin-federation contract that lets two Mahoraga runtime identities clone configuration, exchange presence/update/handoff/receipt events, converge on shared GitHub state, and suppress event echo loops.

**Architecture:** GitHub remains authoritative code truth; the existing Cloudflare relay is the low-latency transport and GitLab remains an execution/assurance plane. The first slice is transport-neutral and exposes pure contracts plus a small coordinator so the same event semantics can later ride the relay, GitLab pipeline inputs, or another native plugin connection.

**Tech Stack:** Node.js 24 ESM, Node built-in test runner, existing Mahoraga manifest/runtime conventions.

**Spec:** `docs/superpowers/specs/2026-09-08-twin-federation-design.md`

## Global Constraints

- GitHub `michaeljwilliams0123/mahoraga` remains authoritative.
- Twin updates never directly overwrite `main`.
- Twin descriptors/events contain no credentials or provider tokens.
- Duplicate/stale events are not re-applied.
- `twin.review` is repository analysis/evidence, not a Codex PR review request.
- Vercel is not a completion requirement.

---

### Task 1: Define twin descriptors and clone bootstrap

**Files:**
- Test: `test/twin-federation.test.mjs`
- Create: `src/twin-federation.mjs`

**Interfaces:**
- Produces `createTwinDescriptor(input, options)`.
- Produces `cloneTwinDescriptor(parent, input, options)`.
- Produces `validateTwinDescriptor(value)`.

- [ ] **Step 1: Write failing tests** proving a valid primary descriptor, deterministic clone inheritance, distinct peer IDs, normalized capabilities, exact GitHub repository binding, and rejection of credentials/unknown fields.
- [ ] **Step 2: Run the focused test** with `node --test --test-isolation=none test/twin-federation.test.mjs` and require RED because the module is absent.
- [ ] **Step 3: Implement the minimal descriptor contract** with schema version 1 and immutable returned values.
- [ ] **Step 4: Run the focused test** and require PASS.
- [ ] **Step 5: Commit** `feat: add twin clone descriptor contract`.

### Task 2: Add immutable twin events and echo suppression

**Files:**
- Modify: `test/twin-federation.test.mjs`
- Modify: `src/twin-federation.mjs`

**Interfaces:**
- Produces `createTwinEvent(input)`.
- Produces `validateTwinEvent(value)`.
- Produces `createTwinInbox({ peerId, maximumEventIds })` returning `{ accept(event), snapshot() }`.

- [ ] **Step 1: Add failing tests** for presence/update/handoff/receipt events, deterministic event IDs, target filtering, duplicate acceptance without re-application, and stale per-origin sequence suppression.
- [ ] **Step 2: Run focused tests** and require RED for missing event/inbox behavior.
- [ ] **Step 3: Implement canonical SHA-256 event IDs and bounded inbox state** with highest sequence per origin and recent-event tracking.
- [ ] **Step 4: Run focused tests** and require PASS.
- [ ] **Step 5: Commit** `feat: add twin event and dedupe contract`.

### Task 3: Add convergence and reciprocal work planning

**Files:**
- Modify: `test/twin-federation.test.mjs`
- Modify: `src/twin-federation.mjs`

**Interfaces:**
- Produces `classifyTwinConvergence({ localCommit, event })` -> `in-sync | fast-forward-candidate | reconciliation-required | candidate-review`.
- Produces `createTwinHandoff({ origin, target, capability, baseCommit, headCommit, objective, sequence, createdAt })`.
- Supported capabilities: `twin.analyze`, `twin.review`, `twin.build`.

- [ ] **Step 1: Add failing tests** for same-head convergence, update candidate classification, divergent heads requiring reconciliation, and the three handoff capability values.
- [ ] **Step 2: Run focused tests** and require RED.
- [ ] **Step 3: Implement the minimal convergence/handoff helpers** without network access or repository mutation.
- [ ] **Step 4: Run focused tests** and require PASS.
- [ ] **Step 5: Commit** `feat: coordinate reciprocal twin work`.

### Task 4: Enable the prepared federation capability in the manifest

**Files:**
- Modify: `mahoraga.manifest.json`
- Modify: `test/twin-federation.test.mjs`

**Interfaces:**
- Existing `featureFlags.a2aFederation` becomes `true` only after Tasks 1-3 are green.

- [ ] **Step 1: Add a failing manifest contract test** requiring `featureFlags.a2aFederation === true` and confirming runtime `maximumDevices >= 2` support is already present through the relay contract.
- [ ] **Step 2: Run focused test** and require RED while the flag is false.
- [ ] **Step 3: Flip only `featureFlags.a2aFederation` to `true`**; do not broaden unrelated manifest privileges.
- [ ] **Step 4: Run focused test and `npm run verify`** and require PASS.
- [ ] **Step 5: Commit** `feat: enable prepared twin federation capability`.

### Task 5: Open exact-head PR and verify

**Files:** none

- [ ] **Step 1:** Open a PR from `feature/twin-federation-20260908` to `main`.
- [ ] **Step 2:** Confirm exact PR head SHA.
- [ ] **Step 3:** Require relevant Ubuntu and Windows `Verify Mahoraga` checks on that exact head to succeed.
- [ ] **Step 4:** Inspect changed files/diff directly; do not request Codex review.
- [ ] **Step 5:** Merge only the verified exact head under the repository's current integration policy.

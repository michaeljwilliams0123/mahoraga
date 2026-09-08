# Twin Delegation Mesh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare two Mahoraga replicas to clone the same authoritative GitHub state, exchange idempotent analysis/build/review events, converge on canonical GitHub updates, and expose a transport-neutral path for GitLab and ChatGPT fallback coordination.

**Architecture:** GitHub remains the single code authority. Replica-to-replica influence travels through a typed twin event protocol and pluggable transport, while each clone runs an independent coordinator with its own replica ID. The first canary uses an in-memory transport and exact SHA observations; GitLab/relay transports can be attached later without changing coordinator semantics.

**Tech Stack:** Node.js 24 ESM, node:test, crypto SHA-256, existing Mahoraga runtime/test conventions.

**Spec:** `docs/superpowers/specs/2026-09-08-twin-delegation-mesh-design.md`

## Global Constraints

- GitHub `michaeljwilliams0123/mahoraga` remains authoritative for accepted code.
- GitLab project `85885826` remains the first external execution/assurance plane.
- ChatGPT fallback uses supported scheduled/plugin pull behavior, not consumer-UI automation or plan-limit bypass.
- No Codex code review route is introduced.
- No Vercel completion dependency is introduced.
- Replica events never contain credentials or unrestricted executable shell text.
- Default event hop budget is 8; contract maximum is 16.
- Duplicate, self-origin replay, sequence rollback, and hop exhaustion must stop derivation.
- This slice does not directly mutate another replica's Git worktree.

---

### Task 1: Twin event contract

**Files:**
- Create: `test/twin-event-contract.test.mjs`
- Create: `src/twin-event-contract.mjs`

**Interfaces:**
- Produces: `createTwinEvent(input)`, `validateTwinEvent(value)`, `deriveTwinEvent(parent, input)`, `TwinEventContractError`.
- Event IDs are deterministic SHA-256 digests over canonical JSON without `eventId`.

- [ ] **Step 1: Write failing contract tests** for a valid presence event, deterministic IDs, unknown fields, invalid replica IDs, invalid SHA values, payload secrets, maximum hops above 16, hop exhaustion, and tampered `eventId`.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/twin-event-contract.test.mjs` and confirm RED because `src/twin-event-contract.mjs` does not exist.
- [ ] **Step 3: Implement the minimal contract** using `node:crypto`, stable key ordering, exact-field validation, bounded JSON payload validation, and immutable return values.
- [ ] **Step 4: Run the focused test and require PASS.**
- [ ] **Step 5: Commit** `feat: add twin event contract`.

### Task 2: Replica coordinator

**Files:**
- Create: `test/twin-replica-coordinator.test.mjs`
- Create: `src/twin-replica-coordinator.mjs`

**Interfaces:**
- Consumes: validated twin events from Task 1.
- Produces: `createTwinReplicaCoordinator({ replicaId, repository, initialHeadSha, now })` with methods `publish()`, `apply()`, `observeCanonicalHead()`, and `snapshot()`.

- [ ] **Step 1: Write failing tests** proving duplicate replay is ignored, self-origin replay is ignored, per-peer sequence rollback is rejected, presence is recorded, request kinds return typed actions, and both replicas can observe the same canonical SHA.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/twin-replica-coordinator.test.mjs` and confirm RED for the missing module.
- [ ] **Step 3: Implement the minimal coordinator** with processed-event IDs, peer sequence cursors, peer presence, canonical-head observation, and typed action projections.
- [ ] **Step 4: Run Tasks 1-2 focused tests and require PASS.**
- [ ] **Step 5: Commit** `feat: add twin replica coordinator`.

### Task 3: Transport-neutral twin link and two-replica canary

**Files:**
- Create: `test/twin-link-canary.test.mjs`
- Create: `src/twin-link.mjs`
- Create: `scripts/twin-link-canary.mjs`

**Interfaces:**
- Produces: `createInMemoryTwinTransport()` with `publish(event)` and `poll({ replicaId, afterSequence })`.
- Produces: `runTwinLinkCanary({ initialHeadSha, nextHeadSha, now })`.

- [ ] **Step 1: Write a failing canary test** that creates Alpha and Beta, exchanges presence -> build request -> build result -> review request -> review result, advances the canonical head for both, replays prior events, and asserts convergence without duplicate actions.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/twin-link-canary.test.mjs` and confirm RED.
- [ ] **Step 3: Implement the in-memory transport and canary** using only the public event/coordinator interfaces.
- [ ] **Step 4: Add CLI output** that prints a concise JSON receipt containing replica IDs, event count, duplicate suppression count, and final shared head SHA.
- [ ] **Step 5: Run Tasks 1-3 focused tests and require PASS.**
- [ ] **Step 6: Commit** `feat: add twin link canary`.

### Task 4: Clone bootstrap plan

**Files:**
- Create: `test/twin-clone-plan.test.mjs`
- Create: `src/twin-clone-plan.mjs`
- Create: `scripts/twin-clone-plan.mjs`

**Interfaces:**
- Produces: `createTwinClonePlan({ replicaId, repositoryUrl, targetDirectory, baseSha, createdAt })`.
- The plan contains fixed argv arrays for canonical Git operations; it does not accept caller-supplied shell text.

- [ ] **Step 1: Write failing tests** for canonical repository URL, exact SHA, relative/sibling target directory, deterministic argv shape, unique replica ID, and rejection of shell metacharacter injection or alternate repository origins.
- [ ] **Step 2: Run** `node --test --test-isolation=none test/twin-clone-plan.test.mjs` and confirm RED.
- [ ] **Step 3: Implement immutable clone planning** and a CLI that prints the plan as JSON for the selected exact GitHub head.
- [ ] **Step 4: Run Tasks 1-4 focused tests and require PASS.**
- [ ] **Step 5: Commit** `feat: add twin clone bootstrap plan`.

### Task 5: Manifest and operator documentation

**Files:**
- Modify: `mahoraga.manifest.json`
- Modify: `.gitignore`
- Create: `docs/TWIN-DELEGATION-MESH.md`
- Create: `test/twin-manifest-contract.test.mjs`

**Interfaces:**
- Adds `twinMesh` policy with `enabled`, `defaultMaximumHops`, `maximumHops`, `maximumReplicas`, `canonicalRepository`, and `chatgptFallbackMode`.
- Enables `featureFlags.a2aFederation` only after all focused tests pass.

- [ ] **Step 1: Write failing manifest tests** requiring maximum replicas >= 2, default hops 8, ceiling 16, canonical repository exact match, and fallback mode `scheduled-plugin-pull`.
- [ ] **Step 2: Run the manifest contract test and confirm RED.**
- [ ] **Step 3: Add the policy**, set `featureFlags.a2aFederation=true`, ignore runtime twin state under `state/twin/`, and document the operator flow including the already-created ChatGPT condition-watch fallback.
- [ ] **Step 4: Refresh the protected release baseline using the repository's existing baseline tooling if verification requires mirrored files.**
- [ ] **Step 5: Run** `npm run verify` and require PASS.
- [ ] **Step 6: Commit** `feat: enable twin delegation mesh canary`.

## Completion Gate

- [ ] Focused twin tests all pass.
- [ ] `npm run verify` passes on the exact branch head.
- [ ] GitHub exact-head Ubuntu and Windows verification succeed on the PR.
- [ ] No Codex review request/comment/reaction is created.
- [ ] No Vercel result is required or used as completion evidence.
- [ ] The PR demonstrates two logical replicas converging on one canonical GitHub SHA and suppressing replay/echo loops.

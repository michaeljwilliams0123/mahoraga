# Self-Evolution Candidate Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `self.evolve` a routable Mahoraga capability that creates a contained self-change candidate and publishes the exact candidate commit to a GitHub PR through the existing trusted integration plane.

**Architecture:** Extend the existing sovereign GitHub producer with a publisher for already-created candidate commits. Add a `self.evolve` wrapper that calls the current self-extension lane, validates its candidate evidence, and invokes that publisher. Wire the capability onto the existing Primary Codex Builder worker without widening the Codex subprocess authority.

**Tech Stack:** Node.js 24+, ESM `.mjs`, built-in `node:test`, Git CLI, GitHub CLI, existing Mahoraga runtime.

**Spec:** `docs/superpowers/specs/2026-09-08-self-evolution-candidate-publication-design.md`

## Global Constraints

- Base is exact `origin/main` commit `980ef9a2edba9929f59cb1f8de2dc5a4aefc6b35` unless main advances before integration.
- Codex subprocess remains `workspace-write`, `approvalPolicy=never`, network disabled, ephemeral, and candidate-worktree-only.
- Git publication is PR-only and never merges directly.
- Existing trust-plane denylist remains authoritative.
- Required verification remains exact-head Ubuntu and Windows `Verify Mahoraga`; no Codex review and no Vercel gate.
- New essential runtime files must be mirrored into `state/release-baseline`.

---

### Task 1: Publish an existing contained candidate

**Files:** Modify `src/sovereign-candidate-producer.mjs`; modify `test/sovereign-candidate-producer.test.mjs`.

**Interfaces:** Produce `createGitHubNativeCandidatePublisher({ root, runCommand })` returning `publishCandidate({ baseSha, headSha, branchName, changedFiles, title, summary })`.
- [ ] Write a failing test where a locally present descendant commit is published by exact SHA to `feature/sovereign-evolution-objective-one`, followed by `gh pr create`, PR readback, and Verify dispatch.
- [ ] Run `node --test --test-isolation=none test/sovereign-candidate-producer.test.mjs` and confirm RED because the publisher export does not exist.
- [ ] Implement the publisher using fixed `git`/`gh` argument arrays: confirm `origin/main === baseSha`, verify the head commit exists and descends from base, recompute exact changed files, push only the exact SHA, create/reuse the PR, validate readback, dispatch Verify, return the existing content-free candidate receipt.
- [ ] Add and pass stale-main, path-mismatch, and conflicting-remote-head cases.
- [ ] Run the focused candidate-producer test to GREEN.

### Task 2: Add the `self.evolve` worker capability

**Files:** Create `src/self-evolution-worker.mjs`; create `test/self-evolution-worker.test.mjs`.

**Interfaces:** Produce `executeSelfEvolutionCapability(capability, task, worker, dependencies)` for capability `self.evolve`. `task.evolutionCapability` is exactly `self.patch` or `self.enhance`.

- [ ] Write a failing test that injects a verified self-extension candidate receipt and asserts publication receives its immutable base/head/changed-path evidence.
- [ ] Run `node --test --test-isolation=none test/self-evolution-worker.test.mjs` and confirm RED because the module does not exist.
- [ ] Implement the minimal wrapper: validate task fields, call `executeSelfExtensionCapability`, refuse publication unless the candidate is verified/passed/clear and base-bound, derive a bounded `feature/sovereign-evolution-*` branch, call the publisher, and return `providerReceipt` plus content-free `selfEvolution` metadata.
- [ ] Add failure tests proving unverified/quarantined candidates never call the publisher and unsupported evolution capabilities fail closed.
- [ ] Run the focused test to GREEN.

### Task 3: Expose self-evolution through the live capability graph

**Files:** Modify `mahoraga.manifest.json`, `src/worker-process.mjs`, `src/receipt-registry.mjs`, `test/self-extension-wiring.test.mjs`, and focused receipt/routing tests.

- [ ] Write failing tests requiring `primary-codex-builder.capabilities` to include `self.evolve`, a provider-derived canary for it, worker-process dispatch to `executeSelfEvolutionCapability`, and a receipt family that validates its existing Codex containment evidence.
- [ ] Run the focused tests and confirm RED on the missing capability/wiring.
- [ ] Add `self.evolve` to the existing worker, dispatch it through `self-evolution-worker.mjs`, map the `self` receipt family to Codex containment, and apply the Codex candidate evidence validator to `self.evolve` success receipts.
- [ ] Run focused manifest, routing, worker, and receipt tests to GREEN.
### Task 4: Release baseline and repository integration

**Files:** Refresh corresponding `state/release-baseline` mirrors and update essential-file registration if required by baseline verification.

- [ ] Run `npm.cmd run baseline:refresh` after all production changes are green.
- [ ] Run focused self-evolution, candidate-producer, manifest, worker, receipt, delegated-work, and baseline tests.
- [ ] Run `npm.cmd run verify` with the authenticated GitHub token available only for the live-protection probe; require zero failures.
- [ ] Inspect `git diff --check` and `git diff --name-status origin/main...HEAD` and verify no unrelated files changed.
- [ ] Commit the implementation on `feature/self-evolution-orchestrator-20260908` and push normally.
- [ ] Open a normal PR to `main` without Codex review traffic. Observe the existing exact-head GitHub Verify and autonomous-integration workflow; do not bypass the protected path or merge rules.

## Self-review

The plan reuses the existing candidate worktree, self-extension lane, GitHub-native producer, Verify workflow, and autonomous integration rather than adding a second routing or merge authority. The only new runtime surface is `self.evolve`; generation remains inside the existing Codex containment boundary while Git publication stays in trusted deterministic code.
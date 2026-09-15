# Collective AGI Convergence Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make topology authority machine-readable and deliver an auditable first Collective-AGI cognitive loop using Mahoraga's existing memory, objective, routing, and evolution foundations.

**Architecture:** Extend existing deterministic contracts rather than adding another brain. Platform lifecycle truth blocks retired/ambiguous infrastructure; cognitive individuals retain bounded private identity/memory while the Collective exchanges only explicit position and lesson receipts.

**Tech Stack:** Node.js 24 ESM, node:test, existing Mahoraga schemas/receipts, GitHub Actions, Railway, GitLab assurance.

**Spec:** `docs/superpowers/specs/2026-09-15-collective-agi-convergence-wave-1-design.md`

## Global Constraints

- Existing GitHub/Railway authority contracts remain fail-closed.
- No provider/display name may become an authority key.
- No persisted hidden chain-of-thought.
- Personality never widens authority or data access.
- No paid fallback is introduced.
- Production remains cloud-primary; PC is optional edge/bootstrap.
- Every production behavior change follows RED -> GREEN -> full Verify.

---

### Task 1: Platform lifecycle truth

**Files:** Create `config/platform-lifecycle.json`, `src/platform-lifecycle.mjs`, `test/platform-lifecycle.test.mjs`; update retirement documentation and baseline mirrors.
- [ ] Write tests proving one canonical resource per authority role, retired resources cannot route, and display-name changes do not change canonical identity.
- [ ] Run focused tests and confirm RED because lifecycle contracts do not exist.
- [ ] Implement strict lifecycle registry validation and canonical lookup by logical/provider IDs.
- [ ] Run focused tests GREEN and remove stale provider text that contradicts the registry.

### Task 2: Cognitive individual contract

**Files:** Create `src/cognitive-individual.mjs`, `test/cognitive-individual.test.mjs`.

- [ ] Write tests for stable individuality, bounded personality traits, private episodic refs, explicit sharing policy, immutable fingerprint, and authority non-escalation.
- [ ] Verify RED.
- [ ] Implement the minimal schema/validator/profile constructor and public deliberation projection.
- [ ] Verify GREEN.

### Task 3: Collective deliberation and metacognition

**Files:** Create `src/collective-cognition.mjs`, `src/metacognition.mjs`, tests with matching names.

- [ ] Write RED tests for complementary participant selection, material-dissent preservation, evidence-aware synthesis, confidence calibration, known-unknown tracking, and hold decisions.
- [ ] Implement bounded position/deliberation receipts and metacognitive assessment without private reasoning traces.
- [ ] Verify focused GREEN tests.

### Task 4: World model and transfer/generalization

**Files:** Create `src/cognitive-world-model.mjs`, `src/transfer-generalization.mjs`, tests with matching names.

- [ ] Write RED tests for deterministic counterfactual transitions, uncertainty propagation, cross-domain held-out trials, source-domain regression limits, and non-hard-coded promotion decisions.
- [ ] Implement contracts and evaluators; keep learned latent models provider-optional.
- [ ] Verify focused GREEN tests.
### Task 5: Unified cognitive loop

**Files:** Create `src/cognitive-loop.mjs`, `test/cognitive-loop.test.mjs`; integrate only through existing objective/router contracts.

- [ ] Write RED tests for perceive -> remember -> assess -> deliberate -> plan -> predict -> decide -> store receipts.
- [ ] Require explicit evidence, authority-preserving decisions, and bounded public traces only.
- [ ] Implement the minimal orchestration layer using existing memory/world/planner modules.
- [ ] Verify focused GREEN tests.

### Task 6: Runtime admission and regression gates

**Files:** Modify existing manifest/worker/receipt contracts only after pure cognitive modules are green; update release baseline.

- [ ] Add RED route/admission tests for deterministic cognitive capabilities.
- [ ] Wire capabilities without creating a second supervisor or arbitrary shell path.
- [ ] Add Evolution Lab regression metrics for diversity, dissent retention, confidence calibration, transfer, and authority preservation.
- [ ] Run focused suites, `npm run baseline:refresh`, then full `npm run verify`.
- [ ] Commit in bounded slices, push the branch, open a PR, and allow existing exact-head integration policy to govern merge.

### Task 7: External convergence

- [ ] Reconcile GitLab private-repository assurance authentication without making GitLab primary CI.
- [ ] Retire remaining Vercel project integrations/status producers when the provider surface permits deletion.
- [ ] Verify Railway production exposes only the canonical runtime and preserve the existing persistent volume.
- [ ] Leave active PR preview infrastructure intact until its PR lifecycle completes.
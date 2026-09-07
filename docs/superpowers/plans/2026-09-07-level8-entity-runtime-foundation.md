# Level 8 Entity Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement Level-8 Waves 1–4 as one independently mergeable foundation chunk: Entity Constitution, Workforce Twin, Capability Lattice, and Objective Economy.

**Architecture:** Add four deterministic ESM modules with strict schemas and one focused contract suite. The modules remain model-independent and side-effect-free; later waves can persist and route their outputs through existing autonomy/database contracts without creating a second authority plane.

**Tech Stack:** Node.js 24+, ESM `.mjs`, built-in `node:test`, existing Mahoraga Verify workflow.

**Spec:** `docs/superpowers/specs/2026-09-07-level8-entity-runtime-design.md`

## Global Constraints

- GitHub main is authoritative; no direct main write.
- TDD: prove RED on the feature branch before implementation.
- Required Ubuntu and Windows exact-head verification are the merge gates.
- No Codex code review or automated PR comments/reactions.
- Vercel is observational only.
- All four modules must work with zero frontier-model credits.
- Stable IDs, bounded input, deterministic ordering, canonical timestamps, immutable outputs.
- No network calls, provider calls, shell execution, or credential handling in this foundation chunk.

---

### Task 1: RED contract suite

**Files:**
- Create: `test/entity-runtime-foundation.test.mjs`

**Interfaces:**
- Expects `createEntityConstitution`, `validateEntityConstitution`.
- Expects `createWorkforceTwin`, `mergeWorkforceTwin`, `validateWorkforceTwin`.
- Expects `createCapabilityProfile`, `compareCapabilityProfiles`.
- Expects `createObjectiveCandidate`, `scoreObjective`, `reconcileObjectiveEconomy`.

- [ ] Write focused tests for deterministic schemas, provenance precedence, capability dimensions, objective scoring/coalescing/revival, and zero-credit/no-provider behavior.
- [ ] Push RED commit.
- [ ] Open PR and capture required Verify failure caused by missing modules, not syntax or unrelated baseline failure.

### Task 2: Entity Constitution + Workforce Twin

**Files:**
- Create: `src/entity-constitution.mjs`
- Create: `src/workforce-twin.mjs`

- [ ] Implement strict constructors/validators.
- [ ] Sort set-like arrays deterministically.
- [ ] Freeze returned records recursively.
- [ ] Preserve workforce provenance with precedence `owner-explicit > connected-evidence > entity-inference`.
- [ ] Do not allow inferred duplicate records to replace explicit owner records.
- [ ] Push implementation commit and verify focused suite progress.

### Task 3: Capability Lattice + Objective Economy

**Files:**
- Create: `src/capability-lattice.mjs`
- Create: `src/objective-economy.mjs`

- [ ] Implement exact enum validation for all ten capability dimensions.
- [ ] Implement profile comparison with per-dimension deltas and `broadensAuthority`.
- [ ] Implement objective candidate origin/state validation and deterministic SHA-256 fingerprinting.
- [ ] Implement weighted score: mission alignment 20, impact 20, urgency 15, confidence 10, dependency readiness 5, reversibility 5, cost efficiency 10, capability readiness 10, evidence quality 5.
- [ ] Implement duplicate coalescing by fingerprint, terminal completed/retired behavior, deferred revival only when readiness or urgency increases, and deterministic ordering.
- [ ] Push implementation commit.

### Task 4: Verification and integration

- [ ] Confirm focused suite passes.
- [ ] Confirm full repository Verify passes on the exact candidate head on Ubuntu and Windows.
- [ ] Confirm no provider/model call is introduced by the four modules.
- [ ] Confirm PR head is unchanged after green evidence.
- [ ] Merge only the exact verified head under existing autonomous integration policy.
- [ ] Re-read main after merge and record merge SHA before the next wave starts.

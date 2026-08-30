# Phase B Transient Reasoning Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mahoraga a bounded divergent-convergent reasoning loop that finds adjacent-domain connections, challenges alternatives, and returns supported decisions without persisting private reasoning or granting execution authority.

**Architecture:** Build pure stages around the existing expert registry, then compose them in one transient engine. A deterministic provider drives tests. The authenticated loopback API returns concise rationale cards; only the execution firewall may convert a converged recommendation into a task.

**Tech Stack:** Node.js 24 ESM, `node:test`, existing expert registry, authenticated loopback HTTP, and Control Center.

**Spec:** `docs/superpowers/specs/2026-08-29-mahoraga-sovereign-reasoning-design.md` and `docs/superpowers/specs/2026-08-29-mahoraga-zero-credit-autonomy-addendum.md`.

## Global Constraints

- Keep prompts, candidate prose, provider responses, and private reasoning in memory only and clear them at completion or timeout.
- Persist only identifiers, hashes, counts, confidence bands, timestamps, and stable reason codes.
- Produce three to seven materially distinct candidates and select no more than five experts.
- Never dispatch from a speculative candidate or expose raw chain-of-thought.
- Normal credit budget remains zero.

### Task 1: Question Model and Expert Mesh

**Files:**
- Create: `src/question-model.mjs`
- Create: `src/expert-mesh.mjs`
- Create: `test/question-model.test.mjs`
- Create: `test/expert-mesh.test.mjs`
- Modify: `src/expert-skill-registry.mjs`

**Interfaces:** `buildQuestionModel(input): QuestionModel`; `composeExpertMesh({ questionModel, registry, limit = 5 }): ExpertSelection[]`.

- [ ] Write tests proving facts require evidence, assumptions remain separate, unknown fields fail, mesh size is bounded, redundant experts are penalized, and a relevant adjacent expert can be selected without exact keyword overlap.
- [ ] Run `node --test test/question-model.test.mjs test/expert-mesh.test.mjs`; confirm missing-module failures.
- [ ] Implement strict frozen question models and deterministic expert scoring over direct relevance, complementary methods, blind spots, data eligibility, and redundancy.
- [ ] Run the focused tests plus `node --test test/expert-skill-registry.test.mjs`; require zero failures.
- [ ] Commit with `git commit -m "feat: add bounded expert composition"`.

### Task 2: Divergence and Connection Graph

**Files:**
- Create: `src/reasoning-candidates.mjs`
- Create: `src/connection-graph.mjs`
- Create: `test/reasoning-candidates.test.mjs`
- Create: `test/connection-graph.test.mjs`

**Interfaces:** `generateReasoningCandidates({ questionModel, expertMesh, provider, budget }): Promise<ReasoningCandidate[]>`; `buildConnectionGraph({ questionModel, candidates }): ConnectionGraph`.

- [ ] Write tests for three-to-seven candidates, distinct reasoning modes, falsification conditions, explicit speculation, fixed deadline/count budgets, allowed edge types, orphan evidence rejection, and unsupported causal-cycle rejection.
- [ ] Run both focused tests and confirm they fail for missing modules.
- [ ] Implement schema-first provider normalization and a frozen graph using only `supports`, `contradicts`, `causes`, `depends-on`, `analogous-to`, `precedes`, `shares-constraint`, and `explains` edges.
- [ ] Run both focused tests; require malformed provider output to be discarded with bounded error codes.
- [ ] Commit with `git commit -m "feat: add divergent reasoning graph"`.

### Task 3: Critique, Convergence, and Engine

**Files:**
- Create: `src/reasoning-critic.mjs`
- Create: `src/reasoning-synthesis.mjs`
- Create: `src/reasoning-engine.mjs`
- Create: `test/reasoning-engine.test.mjs`

**Interfaces:** `critiqueReasoningCandidates({ questionModel, candidates, graph }): Criticism[]`; `synthesizeReasoningDecision({ questionModel, candidates, criticisms, graph }): ReasoningDecision`; `reasonAboutObjective(input, dependencies): Promise<ReasoningResult>`.

- [ ] Write tests for contradiction, circularity, hidden data-plane changes, duplicated ideas, alternative explanations, high-confidence falsification, answer-first synthesis, uncertainty, evidence map, and transient cleanup after success, timeout, and malformed output.
- [ ] Run `node --test test/reasoning-engine.test.mjs`; confirm missing-module failure.
- [ ] Implement the orchestrator with a single deadline and bounded candidate budget. Return rationale cards containing claim, evidence references, assumptions, confidence, alternatives, and falsification—not hidden reasoning traces.
- [ ] Run the focused test plus `node --test test/answer-quality.test.mjs test/execution-firewall.test.mjs`.
- [ ] Commit with `git commit -m "feat: add transient reasoning engine"`.

### Task 4: Authenticated Mahoraga Reasoning Surface

**Files:**
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Create: `test/reasoning-runtime.test.mjs`

**Interfaces:** Authenticated `POST /api/reason` accepts an authorized objective reference and bounded context; authenticated `GET /api/reason/:objectiveId` returns content-free status or the ephemeral result while active.

- [ ] Write runtime tests for authentication, request limits, answer-first output, zero-credit receipt, no database content leakage, expiry, and refusal to dispatch speculative conclusions.
- [ ] Run `node --test test/reasoning-runtime.test.mjs`; confirm the route is absent.
- [ ] Add routes and a Control Center rationale-card view labeled `Advisory until verified`; do not add a raw prompt or transcript history view.
- [ ] Run focused runtime tests, `node --test test/runtime.test.mjs test/control-center-intake-runtime.test.mjs`, then the repository verify command.
- [ ] Commit with `git commit -m "feat: expose transient sovereign reasoning"`.

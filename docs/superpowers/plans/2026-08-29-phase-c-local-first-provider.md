# Phase C Local-First Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a verified loopback local model Mahoraga''s normal generative provider while preserving deterministic work and guaranteeing no silent metered fallback.

**Architecture:** Extend the existing local reasoner provider with a strict transient client and capability-specific canary. Readiness is based on the exact reason operation, not a generic model-list probe. Failure removes local generative eligibility while deterministic workers continue.

**Tech Stack:** Node.js 24 ESM, loopback HTTP, LM Studio-compatible Responses endpoint, and `node:test` fixture server.

**Spec:** Sovereign reasoning design and zero-credit autonomy addendum dated 2026-08-29.

## Global Constraints

- Allow only configured loopback hosts; reject redirects, proxies, non-loopback resolution, and caller-selected endpoints.
- Do not persist prompts or raw responses, including logs and error objects.
- A local-provider failure must never cause paid fallback.
- Deterministic objectives remain runnable when the local model is unavailable.

### Task 1: Strict Transient Reasoner Client

**Files:**
- Create: `src/transient-reasoner-client.mjs`
- Create: `test/transient-reasoner-client.test.mjs`
- Modify: `src/local-reasoner-provider.mjs`

**Interfaces:** `createTransientReasonerClient(config, dependencies)` and `client.reason(request): Promise<ValidatedProviderResult>`.

- [ ] Write fixture-server tests for `http://127.0.0.1:1234/v1/responses`, deadline cancellation, size limits, redirect rejection, malformed JSON, unknown fields, log redaction, and buffer disposal.
- [ ] Run the focused test and confirm the client module is missing.
- [ ] Implement fixed endpoint construction, abort deadline, maximum response bytes, strict schema validation through `validateReasoningProviderResult()`, and content-free errors.
- [ ] Run focused tests plus `node --test test/local-reasoner-provider.test.mjs`.
- [ ] Commit with `git commit -m "feat: add transient local reasoner client"`.

### Task 2: Capability-Specific Canary and Readiness

**Files:**
- Modify: `src/provider-readiness.mjs`
- Modify: `src/worker-process.mjs`
- Modify: `src/config.mjs`
- Modify: `mahoraga.manifest.json`
- Create: `test/local-reasoner-canary.test.mjs`

**Interfaces:** `probeLocalReasoningCapability({ client, deadlineAt }): Promise<ReadinessEvidence>` with provider-derived evidence for `reasoning.generate`.

- [ ] Write tests proving `/v1/models` success alone is insufficient, the exact transient reason request is required, stale evidence is rejected, and canary content never reaches persistence.
- [ ] Run the new test and observe failure against current generic readiness.
- [ ] Implement a deterministic content-free canary with freshness TTL and reason codes `local-reasoner-ready`, `local-reasoner-unavailable`, `local-reasoner-malformed`, and `local-reasoner-stale`.
- [ ] Run the focused test plus `node --test test/provider-readiness.test.mjs test/config.test.mjs`.
- [ ] Commit with `git commit -m "feat: verify local reasoning capability"`.

### Task 3: Local-First Selection and Graceful Degradation

**Files:**
- Modify: `src/reasoning-engine.mjs`
- Modify: `src/router.mjs`
- Modify: `src/runtime.mjs`
- Create: `test/local-first-reasoning.test.mjs`

**Interfaces:** Provider selection returns `{ providerId, reasonCode }` or `reasoning-provider-unavailable`; it never returns a metered provider in normal mode.

- [ ] Write tests for healthy local selection, unavailable-local waiting, deterministic task continuation, normal Codex exclusion even when healthy, and zero-credit receipts in every normal outcome.
- [ ] Run focused tests and confirm current selection does not meet the contract.
- [ ] Connect readiness, project data class, transient capability, and credit policy before invoking the provider. Mark model-dependent objectives waiting; leave deterministic workflows eligible.
- [ ] Run `node --test test/local-first-reasoning.test.mjs test/router.test.mjs test/runtime.test.mjs`, then the full repository verify command.
- [ ] Commit with `git commit -m "feat: enable zero-credit local-first reasoning"`.

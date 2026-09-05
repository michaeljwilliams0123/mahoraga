# Single Mahoraga Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fuse Mahoraga's local runtime, cloud execution, and browser app into one logical product and one authoritative control core on version `7.0.0-alpha.2`.

**Architecture:** Keep the Node ESM runtime under `src/` as the sole orchestration authority. The Vercel app becomes a thin encrypted client, and cloud model/browser functions become bounded capabilities invoked by the core rather than alternate task-routing brains. Port 4783 remains a canary instance of the same product version; 4782 remains authoritative until promotion receipts are complete.

**Tech Stack:** Node.js 24 ESM, `node:sqlite`, existing AES-GCM content vault, existing P-256/HKDF/AES-GCM relay, Next.js 16 / React 19 / TypeScript 7 cloud app, GitHub Actions Ubuntu + Windows verification.

**Spec:** `docs/superpowers/specs/2026-09-05-single-mahoraga-core-design.md`

## Global Constraints

- Target product version is exactly `7.0.0-alpha.2`.
- One authoritative conversation/task orchestration path: `Conversation Gateway -> UCCP/Policy/Router -> Capability -> Verification -> Receipt/Vault`.
- `cloud-app/` remains the sole browser UI but may not independently choose final model, tool set, task graph, approval policy, route, or final answer.
- Runtime listeners remain loopback-only. Never expose 4782/4783 publicly and never add a Vercel-to-localhost rewrite, wildcard CORS, public tunnel, or generic proxy.
- Runtime tokens/keys remain runtime state and are never stored in Git or SQLite.
- Content-bearing durable local writes go through the encrypted content vault; SQLite stores bounded references/evidence only.
- Never persist or stream raw private chain-of-thought.
- No Codex code review or review traffic. Vercel workspace verification may run but is not a PR-completion requirement.
- Required merge verification remains exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`.
- PR #166 vault containment is a prerequisite and must be merged or equivalently incorporated before fusion code lands.

---

## Phase A — Product identity and anti-split-brain authority

### Task 1: Land the UCCP vault-containment prerequisite

**Files:** Existing PR #166 only.

**Interfaces:**
- Consumes: PR #166 head `f0fabb3fae8dcf78c9498e390b0200b34639c4c4` with green exact-head verification.
- Produces: main with `createAdminCognitivePlane({ contentVault })` and metadata-only UCCP SQLite/telemetry writes.

- [ ] Re-read PR #166 head SHA, mergeability, and required Ubuntu/Windows checks.
- [ ] Merge PR #166 with the expected head SHA; do not request Codex review.
- [ ] Read the resulting `main` SHA and verify the merge contains `src/state/core-plane.mjs`, `src/state/schema.mjs`, `src/runtime.mjs`, their tests, and the release-baseline runtime mirror.
- [ ] Create the fusion implementation branch from that exact new `main` SHA.

### Task 2: Create one canonical product identity contract

**Files:**
- Create: `config/product-identity.json`
- Create: `src/product-identity.mjs`
- Create: `scripts/product-identity.mjs`
- Create: `test/product-identity.test.mjs`
- Modify: `package.json`
- Modify: `cloud-app/package.json`
- Modify: `cloud-app/package-lock.json`
- Modify: `mahoraga.manifest.json`
- Modify: `test/config.test.mjs`
- Refresh affected files under `state/release-baseline/` when they are in `ESSENTIAL_FILES`.

**Interfaces:**
- Produces: `loadProductIdentity()` returning `{ schemaVersion: 1, product: "Mahoraga", version: "7.0.0-alpha.2" }` and `assertProductIdentityMirrors(...)` for deterministic validation.

- [ ] Write `test/product-identity.test.mjs` first. It must assert root package, cloud app package, cloud app lockfile root entry, manifest, and `config/product-identity.json` all equal `7.0.0-alpha.2`; mutate one mirror in-memory and assert validation fails with `product-version-divergence`.
- [ ] Run the focused test and capture RED because the contract file/module do not yet exist and current versions diverge.
- [ ] Implement `src/product-identity.mjs` with exact-key validation, semver-like bounded version validation, and mirror comparison. Do not read environment secrets.
- [ ] Add `scripts/product-identity.mjs validate` and include `node scripts/product-identity.mjs validate` in root `npm run verify` before repository audits.
- [ ] Create `config/product-identity.json` and update root package, cloud app package/lockfile, and manifest to `7.0.0-alpha.2`.
- [ ] Update `test/config.test.mjs` to expect `7.0.0-alpha.2`.
- [ ] Run focused identity/config tests and ensure GREEN.
- [ ] Refresh only required release-baseline mirrors and run `npm run baseline:verify`.
- [ ] Commit as `feat: establish one Mahoraga product identity`.

### Task 3: Replace product-like subversions with compatibility revisions

**Files:**
- Modify: `mahoraga.manifest.json`
- Modify: `src/config.mjs`
- Modify: `test/config.test.mjs`
- Modify consumers found by repository search for `.versions` and `worker.version`.
- Refresh manifest/config release-baseline mirrors.

**Interfaces:**
- Produces manifest `protocols` with exact keys `apiProtocol`, `taskSchema`, `workerContract`, `relayProtocol`, `capabilityRegistrySchema`.
- Worker entries expose `implementationRevision`, never a Mahoraga product `version`.

- [ ] Add failing config tests asserting `manifest.versions` is absent, `manifest.protocols` has the exact compatibility keys, every worker has `implementationRevision`, and any legacy worker `version` field is rejected.
- [ ] Run `node --test --test-isolation=none test/config.test.mjs` and capture RED.
- [ ] Update the manifest: remove `versions`; add bounded protocol revisions; rename worker `version` to `implementationRevision` without changing worker behavior.
- [ ] Update `validateManifest()` to require exact allowed protocol keys and `implementationRevision`; reject legacy `versions` and worker `version` fields so split identity cannot return silently.
- [ ] Update every source/test consumer discovered by search.
- [ ] Run config/router/supervisor/worker focused tests and ensure GREEN.
- [ ] Refresh required release-baseline mirrors and verify them.
- [ ] Commit as `refactor: separate product identity from protocol revisions`.

### Task 4: Add a static anti-split-brain repository contract

**Files:**
- Create: `src/single-core-contract.mjs`
- Create: `test/single-core-contract.test.mjs`
- Modify: `scripts/github-audit.mjs` only if the existing audit architecture cleanly supports the new deterministic check; otherwise keep the contract in `npm run verify` via its focused test.

**Interfaces:**
- Produces: `auditSingleCoreSources({ files }) -> { ok, violations }`.

- [ ] Write failing tests that identify these authority leaks in browser-app sources: direct authoritative `DefaultChatTransport({ api: "/api/chat" })`, UI route-mode ownership (`RouteMode`, `conversationRoute`), and a browser-facing `/api/chat` route that calls `streamText()` to produce a completed Mahoraga answer.
- [ ] Add negative fixtures showing provider implementation code may still call `streamText()` inside a bounded worker endpoint; the audit should prohibit orchestration surfaces, not the provider library itself.
- [ ] Implement the deterministic source audit with a fixed inspected-path allowlist, bounded findings, and no network access.
- [ ] Run focused tests GREEN.
- [ ] Commit as `test: enforce one Mahoraga orchestration authority`.

---

## Phase B — Cloud/app convergence into the core

### Task 5: Extend the encrypted runtime relay around core runs and identity

**Files:**
- Modify: `src/relay-runtime.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `test/relay-runtime.test.mjs`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

**Interfaces:**
- Add UI client methods `run(input)`, `events(runId, afterEventId)`, `cancel(runId)`, and `identity()`.
- Add relay action `identity` returning bounded `{ product, version, environment, candidate, commit }` with no secrets.

- [ ] Write failing relay tests for `identity`, `run`, event replay, and cancel through the existing encrypted frame path.
- [ ] Write a cloud contract test that rejects state-changing calls when `identity.version !== 7.0.0-alpha.2`.
- [ ] Implement `identity` dispatch on runtime side from core-owned product/manifest state; derive `candidate` from runtime port/state, not a second version.
- [ ] Implement the TypeScript client methods without changing the fixed relay origin or cryptography.
- [ ] Make mutating client methods require a successful compatible identity handshake.
- [ ] Run relay and cloud contract tests GREEN.
- [ ] Commit as `feat: bind app relay to core run and product identity`.

### Task 6: Make the browser workspace a thin core client

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/test/cloud-contract.test.mjs`
- Modify: `cloud-app/app/api/health/route.ts`

**Interfaces:**
- All user objectives call `RuntimeRelay.run()`.
- UI renders authoritative progress from `RuntimeRelay.events()` plus core messages/receipts.

- [ ] Replace existing cloud-contract assertions with RED assertions that `RouteMode`, `conversationRoute`, and direct `DefaultChatTransport` are absent and that objective submission requires a paired compatible core.
- [ ] Run cloud tests and capture RED against the current dual route implementation.
- [ ] Remove UI ownership of `efficient` versus `cloud` routing. Keep only connection/environment presentation state.
- [ ] Submit every conversation turn through the core run path, use run events for progress/terminal state, and retrieve final content only from core-owned message/vault interfaces.
- [ ] If the core disconnects, retain read-only rendered history and disable new state-changing submission; do not call `/api/chat` as fallback.
- [ ] Change `/api/health` to report app/provider readiness and product identity, not a separate cloud routing policy.
- [ ] Run `npm --prefix cloud-app run typecheck` and cloud tests GREEN.
- [ ] Commit as `refactor: make cloud app a core-owned conversation client`.

### Task 7: Extract the cloud model into an authenticated bounded worker

**Files:**
- Create: `cloud-app/lib/cloud-worker-contract.ts`
- Create: `cloud-app/app/api/worker/execute/route.ts`
- Create: `cloud-app/test/cloud-worker-contract.test.mjs`
- Create: `src/cloud-model-worker.mjs`
- Create: `test/cloud-model-worker.test.mjs`
- Modify: `cloud-app/lib/runtime-config.ts`
- Modify: `cloud-app/.env.example`
- Modify: `mahoraga.manifest.json`
- Modify: `src/worker-process.mjs`
- Modify: `src/config.mjs` adapter validation as needed.

**Interfaces:**
- Core outbound request: `{ schemaVersion:1, requestId, capability, requestedOutcome, dataClass, issuedAt, expiresAt, nonce }` plus HMAC headers.
- Cloud result: bounded `{ schemaVersion:1, requestId, outcome, answer, evidence, providerHealth }`; raw reasoning is forbidden.
- Runtime secret `MAHORAGA_CLOUD_WORKER_SECRET` is env/local runtime state only; Vercel copy is project secret. It is never committed or persisted in SQLite.

- [ ] Write RED tests for exact request/result schemas, maximum sizes, expiration, nonce/replay behavior, HMAC verification, wrong secret, body tampering, and forbidden reasoning/raw fields.
- [ ] Implement the TypeScript cloud worker contract using Web Crypto/Node crypto as appropriate and constant-time verification.
- [ ] Move GPT-5.6 Sol provider configuration, context budgets, and optional web-search execution from authoritative `/api/chat` into the worker endpoint. The endpoint returns bounded worker output only and never declares a global run complete.
- [ ] Implement `src/cloud-model-worker.mjs` as fixed-HTTPS outbound invocation with timestamp/nonce/idempotency, HMAC signing, timeout/size bounds, and no public inbound local listener.
- [ ] Add a `cloud-model` worker declaration using the existing core capability registry. Start fail-closed/unroutable until configured readiness evidence exists; do not issue a paid model health call simply to prove readiness.
- [ ] Route `assistant.respond` and `research.web` execution through the worker process adapter when selected by core policy.
- [ ] Ensure durable cloud answer content enters the local content vault before any SQLite reference when persistence is required.
- [ ] Run focused core/cloud worker tests GREEN.
- [ ] Commit as `feat: expose cloud intelligence as a Mahoraga worker`.

### Task 8: Converge general task intent and capability routing

**Files:**
- Modify: `src/task-intent.mjs`
- Modify: `src/router.mjs` only if necessary for the worker's normal readiness/cost policy.
- Modify: `test/task-intent.test.mjs`
- Modify: `test/router.test.mjs`

**Interfaces:**
- General questions map to `assistant.respond` when an admitted worker exists; otherwise return the existing bounded provider-gap/wait outcome.
- Web research maps to `research.web` when available.

- [ ] Write RED tests proving a general question is routed through the core capability graph and that local-only data cannot route to a cloud worker whose declared data classes exclude it.
- [ ] Add intent contracts for general assistant and web research without changing specific repository/browser/M365 intent precedence.
- [ ] Ensure the central router—not the UI—selects among admitted assistant providers based on cost mode, readiness, data class, reliability, and availability.
- [ ] Run task-intent/router/conversation-gateway tests GREEN.
- [ ] Commit as `feat: route all conversation intelligence through one capability graph`.

### Task 9: Retire the authoritative cloud-only chat route

**Files:**
- Delete or convert: `cloud-app/app/api/chat/route.ts`
- Modify: `cloud-app/test/cloud-contract.test.mjs`
- Modify: `cloud-app/components/workspace.tsx` if residual imports remain.

**Interfaces:** No browser-callable route may independently produce a final Mahoraga answer.

- [ ] Add a RED static contract asserting the browser app no longer has an authoritative `/api/chat` stream path.
- [ ] Remove the route if no compatibility consumer remains; otherwise make it return a bounded `410 core-required` response with no model invocation.
- [ ] Verify all model invocation now lives only under the bounded worker endpoint.
- [ ] Run cloud typecheck/tests/build and the root single-core audit GREEN.
- [ ] Commit as `refactor: retire the cloud-only Mahoraga brain`.

---

## Phase C — UCCP/operator convergence and promotion proof

### Task 10: Expose one bounded core/operator snapshot

**Files:**
- Create: `src/core-operator-snapshot.mjs`
- Modify: `src/relay-runtime.mjs`
- Modify: `src/runtime.mjs`
- Create: `test/core-operator-snapshot.test.mjs`

**Interfaces:**
- `createCoreOperatorSnapshot(...)` returns product/version/commit/environment, capability readiness, active run/task metadata, bounded UCCP lease metadata, watchdog/canary status, and legal waits. It never returns vault plaintext, token material, private reasoning, or browser history.

- [ ] Write RED tests for exact allowed fields and explicit rejection/absence of private content keys.
- [ ] Implement snapshot composition from existing authoritative sources.
- [ ] Add relay action `operator-state` protected by the existing paired encrypted session.
- [ ] Run focused tests GREEN.
- [ ] Commit as `feat: project one core state to operator surfaces`.

### Task 11: Render unified operator state in the app

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

**Interfaces:** App shows the connected core's version/commit/environment and bounded UCCP/watchdog state.

- [ ] Write RED UI contract assertions for one product version badge, core commit, candidate/production badge, lease freshness, current worker/capability, verification state, and canary/watchdog status.
- [ ] Implement read-only operator projection. Do not grant Vercel direct local rollback authority.
- [ ] Keep rollback execution core/local-owned; UI may display rollback receipt/status and may request a core-owned authenticated action only if an existing owner authority contract supports it safely.
- [ ] Run cloud typecheck/tests/build GREEN.
- [ ] Commit as `feat: surface unified Mahoraga operator state`.

### Task 12: Create a deterministic 4783 candidate canary and rollback receipt

**Files:**
- Create: `scripts/candidate-canary.mjs`
- Create: `test/candidate-canary.test.mjs`
- Modify: `package.json` to add `candidate:canary`.
- Add verification documentation/receipt schema under `docs/verification/` if existing repository patterns require it.

**Interfaces:**
- `npm run candidate:canary` performs a bounded local drill and writes/prints a content-free receipt containing version, candidate port, production-port health before/after, lease freshness, injected-canary result, rollback result, restart result, timestamps, and hashes/IDs only.

- [ ] Write RED tests around the canary state machine using injected process/health/watchdog functions so CI never kills a real runtime.
- [ ] Implement a safe test hook to trip the candidate watchdog without creating forbidden files in the authoritative checkout. The injected condition must be candidate-scoped and unavailable on the normal 4782 production path.
- [ ] Verify the drill asserts 4782 health before and after, observes a 4783 lease, trips three consecutive watchdog failures, observes candidate rollback/quarantine, and verifies a clean candidate restart.
- [ ] Never include tokens, vault content, private reasoning, or environment secrets in the receipt.
- [ ] Run focused test GREEN. Actual live Windows `npm run candidate:canary` remains a required promotion gate and must not be claimed successful until executed on the real runtime.
- [ ] Commit as `test: add unified 4783 canary and rollback drill`.

### Task 13: Final exact-head verification and promotion decision

**Files:** Documentation/status/release metadata only after all preceding code is green and live canary evidence exists.

- [ ] Run focused tests for all new identity, relay, cloud worker, routing, operator, and canary contracts.
- [ ] Run `npm run verify:conversation-plane`.
- [ ] Run full `npm run verify` and ensure release baseline is synchronized.
- [ ] Open the fusion PR and require exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` to pass. Do not request Codex review and do not treat Vercel as a merge requirement.
- [ ] Run the real local `npm run candidate:canary` against 4783 and attach the bounded receipt to the PR/verification record.
- [ ] Verify the app pairs to the same candidate and reports the exact same `7.0.0-alpha.2` and commit identity.
- [ ] Only after those receipts exist, promote the unified build to canonical 4782 and mark the former 3.6.0 installation as rollback artifact only. Keep 4783 as future candidate lane rather than a separate version.
- [ ] Verify post-promotion 4782 health and one app-originated run through the single gateway before declaring fusion complete.

---

## Plan self-review

- **Spec coverage:** All six migration waves, single version, single authority, relay containment, cloud-worker extraction, capability convergence, UCCP/operator projection, candidate rollback, and promotion are mapped to Tasks 1–13.
- **No placeholders:** No TBD/TODO or undefined implementation step remains. The only intentionally deferred fact is the outcome of the real Windows canary, which is an external runtime verification gate rather than unimplemented code.
- **Type consistency:** Relay `identity/run/events/cancel/operator-state`, cloud worker request/result schemas, `loadProductIdentity`, `auditSingleCoreSources`, and `createCoreOperatorSnapshot` are defined before downstream use.
- **Safety consistency:** No step exposes loopback, moves local secrets to Vercel/Git/SQLite, creates a second supervisor, fabricates Destiny identity, or uses Codex for code review.

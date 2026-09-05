# UCCP Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add candidate-only UCCP persistence, containment watchdog, authenticated telemetry, and HMAC automation primitives without creating a second authority or touching the 4782 baseline state.

**Architecture:** The existing Mahoraga runtime remains authoritative. A 4783 runtime uses separate candidate state and starts an in-process UCCP plane. UCCP persists bounded decision summaries in a dedicated WAL database, streams authenticated local telemetry through the existing HTTP server, and can request a candidate-scoped rollback that is forbidden from resetting the authoritative checkout.

**Tech Stack:** Node.js 24 ESM, `node:sqlite`, Node HTTP/SSE, Node crypto HMAC, PowerShell, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-05-uccp-containment-design.md`

## Global Constraints

- Runtime host remains exactly `127.0.0.1`.
- Port `4782` behavior and durable state remain unchanged.
- UCCP starts only on resolved port `4783`.
- Raw hidden chain-of-thought is never persisted or streamed.
- No wildcard CORS and no Vercel rewrite to localhost.
- Automatic repository reset is allowed only inside an explicitly marked candidate worktree.
- Root verification remains `npm run verify`.
- Codex is not used for code review.

---

### Task 1: Persistent UCCP state

**Files:**
- Create: `src/state/schema.mjs`
- Create: `test/uccp-state.test.mjs`

**Interfaces:**
- Produces: `openUccpStateStore({ file })` returning `{ recordLease, latestLease, listActiveLeases, health, close }`.

- [ ] **Step 1: Write failing tests** asserting the module exists, WAL mode is active, a structured lease survives close/reopen, expired leases are excluded, and raw `thought`/`chainOfThought` keys are rejected.
- [ ] **Step 2: Run** `node --test test/uccp-state.test.mjs` and confirm the new assertions fail because the state store is not implemented.
- [ ] **Step 3: Implement** the minimal `node:sqlite` store with WAL, `synchronous=FULL`, busy timeout, schema/index creation, bounded JSON validation, and close/reopen durability.
- [ ] **Step 4: Run** `node --test test/uccp-state.test.mjs` and confirm PASS.
- [ ] **Step 5: Commit** the state store and tests.

### Task 2: Cognitive plane and telemetry contracts

**Files:**
- Create: `src/relay/pga-status.mjs`
- Create: `src/state/core-plane.mjs`
- Create: `test/uccp-core-plane.test.mjs`
- Create: `test/pga-status.test.mjs`

**Interfaces:**
- Consumes: UCCP state store from Task 1.
- Produces: `createPgaTelemetryRegistry()`, `handlePgaTelemetryStream(req,res,registry)`, and `createAdminCognitivePlane({ runtimeContext, stateStore, telemetryRegistry, intervalMs })`.

- [ ] **Step 1: Write failing tests** for bounded telemetry shape, no `currentThoughtChain` field, lease persistence, and SSE headers without wildcard CORS.
- [ ] **Step 2: Run** the two focused test files and confirm expected assertion failures.
- [ ] **Step 3: Implement** registry, SSE handler, and the propose/challenge/synthesis summary loop using only bounded structured summaries.
- [ ] **Step 4: Run** both focused tests and confirm PASS.
- [ ] **Step 5: Commit** cognitive plane and telemetry code.

### Task 3: Containment watchdog and rollback

**Files:**
- Create: `src/state/watchdog.mjs`
- Create: `scripts/emergency-rollback.ps1`
- Create: `test/uccp-watchdog.test.mjs`

**Interfaces:**
- Produces: `ContainmentWatchdog` with injected `check` and `rollback` functions.

- [ ] **Step 1: Write failing tests** proving one transient failure does not rollback, consecutive failures do, stop cancels monitoring, and port values other than 4783 are rejected.
- [ ] **Step 2: Run** `node --test test/uccp-watchdog.test.mjs` and confirm failure.
- [ ] **Step 3: Implement** the 500 ms debounced watchdog and candidate-scoped PowerShell rollback. The script requires `.mahoraga-candidate` before any git reset/clean.
- [ ] **Step 4: Run** the focused test and confirm PASS.
- [ ] **Step 5: Commit** watchdog and rollback code.

### Task 4: Runtime/CLI isolation and SSE route

**Files:**
- Modify: `src/runtime.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/server.mjs`
- Modify: `package.json`
- Create: `test/uccp-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 2 cognitive plane/registry and Task 3 watchdog.
- Produces: candidate path resolver and authenticated `GET /api/v1/pga/stream` route.

- [ ] **Step 1: Write failing tests** proving 4783 resolves candidate database/UCCP paths while 4782 keeps the manifest path, CLI accepts `MAHORAGA_RUNTIME_PORT=4783`, and the stream route requires existing local authentication.
- [ ] **Step 2: Run** the focused tests and confirm expected failures.
- [ ] **Step 3: Implement** runtime candidate isolation before database construction, start/stop UCCP with runtime lifecycle, add the authenticated stream route, and add `test:alpha`/candidate scripts without changing Node `>=24`.
- [ ] **Step 4: Run** focused tests and confirm PASS.
- [ ] **Step 5: Commit** integration code.

### Task 5: HMAC/n8n boundary and full verification

**Files:**
- Create: `src/relay/n8n-interceptor.mjs`
- Create: `deploy/secondary-host/n8n/uccp-event-monitor.json`
- Create: `test/n8n-interceptor.test.mjs`

**Interfaces:**
- Produces: `signN8nPayload(payload, secret)` and `verifyN8nSignature(payload, signature, secret)`.

- [ ] **Step 1: Write failing tests** for valid signatures, wrong signatures, malformed hex, and missing secrets.
- [ ] **Step 2: Run** `node --test test/n8n-interceptor.test.mjs` and confirm failure.
- [ ] **Step 3: Implement** timing-safe HMAC helpers and a valid inactive n8n workflow template that receives POSTed bounded telemetry; do not open an inbound Mahoraga listener.
- [ ] **Step 4: Run** `npm run test:alpha` and `npm run verify`.
- [ ] **Step 5: Open a PR** and require the canonical Ubuntu + Windows verification checks before merge.
# Unified Conversation and Evolution Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the staged cloud composer with one versioned conversation surface that can submit, stream, cancel, replay, and verify Mahoraga runs locally or through a ciphertext-only outbound relay, while adding bounded provider, evidence, memory, and self-evolution contracts.

**Architecture:** `cloud/` is the canonical static application for both GitHub Pages and the loopback server. A runtime-owned conversation gateway writes content-free run metadata to SQLite, exposes authenticated v2 APIs and SSE, and delegates execution through the existing task policy, router, supervisor, receipt, update, and rollback boundaries. Remote use adds P-256 ECDH/AES-GCM end-to-end frames through a host-neutral relay that sees only owner-bound routing metadata and ciphertext.

**Tech Stack:** Node.js 24 ESM, `node:sqlite`, Node/Web WebCrypto, HTTP/SSE, WebSocket relay contracts, plain browser JavaScript, GitHub Actions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-30-unified-conversation-evolution-plane-design.md`

## Global Constraints

- Keep the runtime bound to `127.0.0.1`; the relay must never proxy a caller-selected URL, host, port, filesystem path, browser target, or command.
- Keep credentials, provider tokens, conversation plaintext, model responses, and raw connector/plugin payloads out of Git, run-event persistence, coordination records, relay plaintext, and public diagnostics.
- Preserve existing worker isolation, task idempotency, leases, heartbeats, exact-head verification, immutable artifacts, canary activation, rollback, and stop/override controls.
- Use additive schema/version contracts and retain API v1 for one release.
- Use fixed programs, argument arrays, declared paths, manifest-declared providers, and bounded request/response/time limits; never construct a shell command from model or UI text.
- Adapt MIT concepts only; use n8n and AutoGPT as architectural references and do not copy their restricted platform implementations.
- Run focused tests after each task and one full `npm run verify` at the final exact head.

## File map

- `src/run-event-contract.mjs`: validates versioned, content-free run and event envelopes.
- `src/database.mjs`: persists conversation runs, monotonic run events, observations, candidates, and terminal receipts.
- `src/conversation-gateway.mjs`: owns run intake, cancellation, replay, capability projection, and improvement status.
- `src/relay-client.mjs`: creates pairings and authenticates encrypted frames with monotonic counters.
- `relay/core.mjs`: ciphertext-only, owner/origin-bound session broker with TTL, size, rate, and device limits.
- `relay/cloudflare-worker.mjs`: Cloudflare Worker/Durable Object reference adapter over the host-neutral broker.
- `src/openclaw-adapter.mjs`: provider-neutral message and stream normalization without tool authority.
- `src/mcp-host-manager.mjs`: discovers only manifest-declared provider tools and validates schemas/limits.
- `src/evidence-compiler.mjs`: creates confined, token-aware repository evidence packs with hashes and line provenance.
- `src/bounded-execution.mjs`: validates worker budgets, child inheritance, and cancellation propagation.
- `src/observational-memory.mjs`: keeps recent raw turns plus content-free observation references without summarizing authority/evidence.
- `src/generated-code-safety.mjs`: parses generated-source metadata and rejects prohibited process/network/environment/filesystem surfaces.
- `src/evolution-controller.mjs`: advances a confined candidate through plan, worktree, verification, PR, CI, deployment, canary, activation, or rollback receipts.
- `src/server.mjs`, `src/runtime.mjs`: serve canonical cloud assets and wire v2 APIs/SSE into existing control-session authority.
- `src/task-intent.mjs`, `src/task-receipt.mjs`, `src/router.mjs`: add conversation/improvement intents and bounded routing evidence.
- `mahoraga.manifest.json`, `src/config.mjs`: declare relay, MCP providers, execution budgets, observation limits, and contract versions.
- `cloud/index.html`, `cloud/app.js`, `cloud/styles.css`: connection/pairing/session UI, streamed event timeline, cancel/retry, capabilities, and improvement state.
- `docs/DESTINY-CODEX-RELAY.md`: operator/deployment and privacy-boundary documentation.
- `test/*.test.mjs`: focused contract, crypto, gateway, confinement, safety, UI, and end-to-end equivalence coverage.

---

### Task 1: Durable run and event contracts

**Files:**
- Create: `src/run-event-contract.mjs`
- Modify: `src/database.mjs`
- Create: `test/run-event-contract.test.mjs`
- Create: `test/conversation-run-database.test.mjs`

**Interfaces:**
- Produces: `validateRunEvent(event)`, `terminalRunType(type)`, `RuntimeDatabase.createConversationRun(input)`, `appendRunEvent(runId, type, payload)`, `listRunEvents(runId, { afterEventId, limit })`, `cancelConversationRun(runId)`, and `getConversationRun(runId)`.
- Persists: `conversation_runs` and `run_events`; event payloads allow hashes, sizes, states, codes, IDs, counts, booleans, and timestamps but reject plaintext fields such as `text`, `content`, `prompt`, `response`, and `transcript`.

- [ ] **Step 1: Write failing schema and persistence tests**

```js
test("run events replay monotonically without persisting text", (t) => {
  const db = databaseFixture(t);
  const run = db.createConversationRun({ sessionId: "ses-local", conversationId: conversation.id, idempotencyKey: "run-1" });
  const first = db.appendRunEvent(run.id, "run-start", { requestedBytes: 42, requestSha256: "a".repeat(64) });
  const second = db.appendRunEvent(run.id, "worker-started", { workerId: "local-core" });
  assert.deepEqual(db.listRunEvents(run.id, { afterEventId: first.eventId }).map((event) => event.eventId), [second.eventId]);
  assert.throws(() => db.appendRunEvent(run.id, "text-delta", { text: "private" }), /run-event-payload/);
});
```

- [ ] **Step 2: Run the focused tests and confirm missing-module/method failures**

Run: `node --test --test-isolation=none test/run-event-contract.test.mjs test/conversation-run-database.test.mjs`

- [ ] **Step 3: Add the additive tables, normalizers, validators, idempotency check, indexes, terminal-state enforcement, and bounded replay window**

- [ ] **Step 4: Run the focused tests and existing database tests**

Run: `node --test --test-isolation=none test/run-event-contract.test.mjs test/conversation-run-database.test.mjs test/database.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add src/run-event-contract.mjs src/database.mjs test/run-event-contract.test.mjs test/conversation-run-database.test.mjs
git commit -m "feat: add durable conversation run events"
```

### Task 2: Runtime conversation gateway and SSE

**Files:**
- Create: `src/conversation-gateway.mjs`
- Modify: `src/server.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/task-intent.mjs`
- Modify: `src/task-receipt.mjs`
- Modify: `src/router.mjs`
- Create: `test/conversation-gateway.test.mjs`
- Create: `test/conversation-gateway-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1 run/database APIs and existing `sanitizeTaskIntake`, `deriveTaskPolicy`, `capabilityIndex`, supervisor routes, and task receipts.
- Produces: `createConversationGateway({ database, manifest, supervisor, submitTask, now })` with `createRun`, `cancelRun`, `replay`, `capabilities`, `getImprovement`, `subscribe`, and `close`.
- HTTP: authenticated `POST /api/v2/runs`, `POST /api/v2/runs/:runId/cancel`, `GET /api/v2/runs/:runId/events`, `GET /api/v2/capabilities`, and `GET /api/v2/improvements/:candidateId`.

- [ ] **Step 1: Write failing direct-gateway tests**

```js
test("one foreground run per conversation and cancellation are durable", () => {
  const first = gateway.createRun({ sessionId: "ses-local", conversationId, content: "Verify system health", idempotencyKey: "r1" });
  assert.throws(() => gateway.createRun({ sessionId: "ses-local", conversationId, content: "Second", idempotencyKey: "r2" }), /foreground-run-active/);
  assert.equal(gateway.cancelRun(first.id).state, "cancelled");
  assert.equal(gateway.replay(first.id, 0).at(-1).type, "run-cancelled");
});
```

- [ ] **Step 2: Write failing loopback API/SSE tests using the existing control-session bootstrap**

```js
const accepted = await fetch(`${base}/api/v2/runs`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify(input) });
assert.equal(accepted.status, 202);
const events = await fetch(`${base}/api/v2/runs/${run.id}/events?after=0`, { headers: { cookie, accept: "text/event-stream" } });
assert.match(await events.text(), /event: run-start/);
```

- [ ] **Step 3: Implement gateway intake, authoritative intent/routing, task/run correlation, event projection, cancellation, replay, and fixed public errors**

- [ ] **Step 4: Wire v2 routes behind the existing cookie/bearer and same-origin mutation checks; keep v1 routes unchanged**

- [ ] **Step 5: Run gateway, security, intent, router, and receipt tests**

Run: `node --test --test-isolation=none test/conversation-gateway.test.mjs test/conversation-gateway-runtime.test.mjs test/server-security-runtime.test.mjs test/task-intent.test.mjs test/task-receipt.test.mjs test/router.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/conversation-gateway.mjs src/server.mjs src/runtime.mjs src/task-intent.mjs src/task-receipt.mjs src/router.mjs test/conversation-gateway*.test.mjs
git commit -m "feat: expose runtime-owned conversation gateway"
```

### Task 3: Pairing crypto and ciphertext-only relay

**Files:**
- Create: `src/relay-client.mjs`
- Create: `relay/core.mjs`
- Create: `relay/cloudflare-worker.mjs`
- Create: `test/relay-client.test.mjs`
- Create: `test/relay-core.test.mjs`

**Interfaces:**
- Produces: `createPairingOffer({ now, ttlMs })`, `acceptPairingOffer(offer)`, `deriveRelaySession(privateKey, peerPublicKey, context)`, `sealFrame(session, payload)`, and `openFrame(session, frame)` using P-256 ECDH, HKDF-SHA-256, AES-256-GCM, and monotonically increasing counters.
- Produces: `createRelayBroker({ ownerIdentity, allowedOrigin, limits, now })` with `pairLocal`, `pairRemote`, `forward`, `replay`, and `revokeDevice`; only ciphertext and bounded routing metadata enter the broker.

- [ ] **Step 1: Write failing crypto tests for expiry, counter replay, tampering, and bidirectional decrypt**

```js
const local = await createPairingOffer({ now: () => 0, ttlMs: 300_000 });
const remote = await acceptPairingOffer(local.publicOffer, { now: () => 1 });
const sender = await deriveRelaySession(local.privateKey, remote.publicKey, local.context);
const receiver = await deriveRelaySession(remote.privateKey, local.publicKey, local.context);
const frame = await sealFrame(sender, { type: "run", bytes: 12 });
assert.deepEqual(await openFrame(receiver, frame), { type: "run", bytes: 12 });
await assert.rejects(() => openFrame(receiver, frame), /relay-counter-replay/);
```

- [ ] **Step 2: Write failing broker tests for exact owner, Pages origin, frame/rate/device/session limits, five-minute reconnect TTL, and generic-proxy field rejection**

- [ ] **Step 3: Implement WebCrypto pairing/frame functions with fixed AAD containing protocol, session, direction, and counter**

- [ ] **Step 4: Implement the host-neutral broker and Cloudflare Durable Object adapter without logging or parsing plaintext**

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/relay-client.test.mjs test/relay-core.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/relay-client.mjs relay test/relay-client.test.mjs test/relay-core.test.mjs
git commit -m "feat: add encrypted outbound relay contract"
```

### Task 4: Bounded provider and MCP discovery

**Files:**
- Create: `src/openclaw-adapter.mjs`
- Create: `src/mcp-host-manager.mjs`
- Modify: `mahoraga.manifest.json`
- Modify: `src/config.mjs`
- Create: `test/openclaw-adapter.test.mjs`
- Create: `test/mcp-host-manager.test.mjs`

**Interfaces:**
- Produces: `createOpenClawAdapter({ providerId, send })` with `start(messages, context)` and normalized `text-delta`, `reasoning-summary`, `tool-request`, `completed`, and `failed` stream events; tool requests remain proposals.
- Produces: `createMcpHostManager({ declarations, transports })` with `refresh()`, `listTools()`, and `invoke(capabilityId, input, context)`; no call accepts a transport URL or executable.
- Manifest declaration fields: `id`, `transportKind`, fixed `endpoint` or `executableIdentity`, `toolAllowlist`, `resourceAllowlist`, `dataClasses`, `permissionClass`, `spendingClass`, `credentialReference`, `readinessProbe`, `canary`, `maximumRequestBytes`, `maximumResponseBytes`, `timeoutMs`.

- [ ] **Step 1: Write failing adapter and discovery tests**

```js
assert.throws(() => manager.refresh({ endpoint: "https://caller.example" }), /caller-transport-forbidden/);
await manager.refresh();
assert.equal(manager.listTools().find((tool) => tool.schemaValid === false).routable, false);
await assert.rejects(() => manager.invoke("undeclared.tool", {}, context), /mcp-tool-unavailable/);
```

- [ ] **Step 2: Implement provider normalization with bounded message/stream sizes and no authority-bearing tool execution**

- [ ] **Step 3: Implement declared transport discovery, JSON-schema shape validation, allowlists, readiness/canary state, and fixed invocation limits**

- [ ] **Step 4: Extend manifest validation and add one disabled example declaration with a non-secret credential reference**

- [ ] **Step 5: Run provider, manifest, routing, and focused tests**

Run: `node --test --test-isolation=none test/openclaw-adapter.test.mjs test/mcp-host-manager.test.mjs test/config.test.mjs test/readiness-routing.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/openclaw-adapter.mjs src/mcp-host-manager.mjs src/config.mjs mahoraga.manifest.json test/openclaw-adapter.test.mjs test/mcp-host-manager.test.mjs
git commit -m "feat: add declared provider discovery"
```

### Task 5: Evidence compiler, execution budgets, and observational memory

**Files:**
- Create: `src/evidence-compiler.mjs`
- Create: `src/bounded-execution.mjs`
- Create: `src/observational-memory.mjs`
- Modify: `mahoraga.manifest.json`
- Modify: `src/config.mjs`
- Create: `test/evidence-compiler.test.mjs`
- Create: `test/bounded-execution.test.mjs`
- Create: `test/observational-memory.test.mjs`

**Interfaces:**
- Produces: `compileEvidencePack({ root, selectedPaths, limits, revision })` returning only `{ structuralDigest, files: [{ path, sha256, sizeBytes, lineStart, lineEnd, content? }], totals }`.
- Produces: `validateExecutionBudget`, `deriveChildBudget`, and `createCancellationScope`; children inherit deny rules and receive explicit allow rules.
- Produces: `buildMemoryWindow({ recentTurns, observations, immutableEvidence, limits })`; summaries cannot replace approval, authority, receipt, exact tool-result, or deployment evidence records.

- [ ] **Step 1: Write failing evidence tests with traversal, symlink escape, secret filename/content, binary, and oversized fixtures**

- [ ] **Step 2: Write failing budget tests proving child depth/cycles/tokens/spend cannot exceed the parent and cancellation reaches descendants**

- [ ] **Step 3: Write failing memory tests proving old raw text is replaced by hashes/observations while authority and evidence stay exact**

- [ ] **Step 4: Implement lexical plus realpath confinement, deterministic ordering, exclusions, token estimates, and provenance hashes**

- [ ] **Step 5: Implement immutable budget/cancellation and memory-window contracts; add exact manifest limits**

- [ ] **Step 6: Run focused and config tests**

Run: `node --test --test-isolation=none test/evidence-compiler.test.mjs test/bounded-execution.test.mjs test/observational-memory.test.mjs test/config.test.mjs`

- [ ] **Step 7: Commit**

```bash
git add src/evidence-compiler.mjs src/bounded-execution.mjs src/observational-memory.mjs src/config.mjs mahoraga.manifest.json test/evidence-compiler.test.mjs test/bounded-execution.test.mjs test/observational-memory.test.mjs
git commit -m "feat: bound evidence context and worker memory"
```

### Task 6: Generated-code safety and confined evolution controller

**Files:**
- Create: `src/generated-code-safety.mjs`
- Create: `src/evolution-controller.mjs`
- Modify: `src/database.mjs`
- Create: `test/generated-code-safety.test.mjs`
- Create: `test/evolution-controller.test.mjs`

**Interfaces:**
- Produces: `inspectGeneratedExtension({ language, source, manifest, candidateRoot })` returning a content-free decision and reason codes; reject dynamic evaluation, arbitrary imports/processes/sockets/environment access, dangerous traversal, and out-of-root filesystem paths.
- Produces: `createEvolutionController({ database, repository, verifier, deployer, updater })` with `request`, `advance`, `status`, and `receipt`; adapters receive structured argument arrays and exact repository refs only.
- Persists: candidate base/head, allowed paths, state, PR/CI/Pages/local artifact/canary/rollback IDs and hashes, never source or model transcript.

- [ ] **Step 1: Write failing static-safety tests for `eval`, `Function`, `child_process`, sockets, unrestricted environment, Python `subprocess`, traversal, and safe fixed APIs**

- [ ] **Step 2: Write failing evolution tests proving the active runtime cannot be the candidate root, changed paths are enforced, CI must match the exact head, activation requires immutable artifact plus canary, and failure emits rollback**

- [ ] **Step 3: Implement source/metadata separation, language-aware lexical checks, exact extension manifest validation, schemas, and fixed public errors**

- [ ] **Step 4: Implement the candidate state machine and content-free durable receipts over injected repository/deployment/update adapters**

- [ ] **Step 5: Run focused, update, artifact, and autonomous-integration tests**

Run: `node --test --test-isolation=none test/generated-code-safety.test.mjs test/evolution-controller.test.mjs test/update-contract.test.mjs test/local-artifact-store.test.mjs test/autonomous-integration.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add src/generated-code-safety.mjs src/evolution-controller.mjs src/database.mjs test/generated-code-safety.test.mjs test/evolution-controller.test.mjs
git commit -m "feat: confine conversational self-evolution"
```

### Task 7: Canonical cloud/loopback application

**Files:**
- Modify: `src/server.mjs`
- Modify: `src/runtime.mjs`
- Modify: `cloud/index.html`
- Modify: `cloud/app.js`
- Modify: `cloud/styles.css`
- Modify: `test/cloud-workspace.test.mjs`
- Modify: `test/control-center-source.test.mjs`
- Create: `test/canonical-cloud-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 2 v2 APIs and Task 3 relay frame functions.
- Produces: one UI asset identity on Pages and loopback, direct same-origin loopback transport, paired-relay transport, offline preview, session selection, streamed event timeline, cancel/retry, capability state, pairing, and improvement progress.

- [ ] **Step 1: Replace staged-workspace tests with failing canonical-version, authenticated direct-run, connection-state, cancellation, replay, and no-plaintext-storage assertions**

- [ ] **Step 2: Change the default server web root and static asset map to serve `cloud/` while retaining the v1 API**

- [ ] **Step 3: Extract a browser transport boundary in `cloud/app.js` with `LoopbackTransport`, `RelayTransport`, and `OfflinePreviewTransport`; no transport accepts a caller-selected local URL**

- [ ] **Step 4: Render session/run events and final receipts with DOM text nodes; add cancel/retry/pairing/capability/improvement controls and accessible connection states**

- [ ] **Step 5: Update CSP so loopback remains same-origin and Pages connects only to the exact configured HTTPS/WSS relay origin plus GitHub telemetry**

- [ ] **Step 6: Run cloud, source, security, and runtime tests**

Run: `node --test --test-isolation=none test/cloud-workspace.test.mjs test/control-center-source.test.mjs test/canonical-cloud-runtime.test.mjs test/server-security-runtime.test.mjs`

- [ ] **Step 7: Commit**

```bash
git add src/server.mjs src/runtime.mjs cloud test/cloud-workspace.test.mjs test/control-center-source.test.mjs test/canonical-cloud-runtime.test.mjs
git commit -m "feat: make cloud workspace the canonical UI"
```

### Task 8: Deployment, docs, and end-to-end receipts

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/verify.yml`
- Create: `docs/DESTINY-CODEX-RELAY.md`
- Modify: `package.json`
- Create: `test/conversation-plane-smoke.test.mjs`
- Create: `test/evolution-receipt-smoke.test.mjs`
- Create: `test/relay-deployment-contract.test.mjs`

**Interfaces:**
- Produces: exact-main Pages UI identity, relay artifact/deployment contract with environment-secret references only, and one terminal receipt joining commit, PR, exact-head CI, Pages, local artifact, canary, activation, and rollback states.

- [ ] **Step 1: Write failing workflow/doc tests for least privilege, immutable actions, environment-protected relay secrets, exact-head inputs, no secret values, and no public loopback origin**

- [ ] **Step 2: Add focused scripts and workflow gates for conversation, relay, evidence, safety, and evolution contracts; retain one final full gate**

- [ ] **Step 3: Package the host-neutral relay adapter in release artifacts and document Cloudflare Access owner identity, Pages origin, secret names, pairing/revocation, limits, logs, canary, and rollback**

- [ ] **Step 4: Add mocked browser-stream and self-update smoke tests from intake through terminal receipt**

- [ ] **Step 5: Run all focused smoke/workflow tests**

Run: `node --test --test-isolation=none test/conversation-plane-smoke.test.mjs test/evolution-receipt-smoke.test.mjs test/relay-deployment-contract.test.mjs test/cloud-workspace.test.mjs test/verification-workflow.test.mjs`

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/pages.yml .github/workflows/release.yml .github/workflows/verify.yml docs/DESTINY-CODEX-RELAY.md package.json test/conversation-plane-smoke.test.mjs test/evolution-receipt-smoke.test.mjs test/relay-deployment-contract.test.mjs
git commit -m "build: verify and package conversation plane"
```

### Task 9: Full verification and exact-head delivery

**Files:**
- Modify only files required by verified failures; keep every change inside dispatch `dcx-894d7acc35193023f3499346` allowed paths.

**Interfaces:**
- Produces: one exact implementation head, bounded PR receipt, green CI evidence, Pages deployment evidence when `cloud/` changes, and no false local-activation claim.

- [ ] **Step 1: Validate scope and privacy**

Run: `node scripts/destiny-codex-dispatch.mjs validate && git diff --name-only origin/main...HEAD`

- [ ] **Step 2: Run the four dispatch gates and one full release gate**

```bash
node src/cli.mjs validate
node scripts/coordination.mjs validate
node scripts/github-audit.mjs
node --test --test-isolation=none
npm run verify
```

- [ ] **Step 3: Fix root causes, rerun only affected focused tests, then rerun `npm run verify` once at the final head**

- [ ] **Step 4: Push the implementation branch, open a PR with dispatch ID/hash and exact changed paths, and request Codex review**

- [ ] **Step 5: Consume exact-head GitHub verification and review evidence; integrate only if current-main ancestry, changed-path, privacy, and autonomous-integration policy remain eligible**

- [ ] **Step 6: Verify Pages deployment and publish a bounded final receipt; report relay hosting or local activation as blocked unless environment credentials/runtime access actually completed them**

## Self-review result

- Spec coverage: Tasks 1-2 cover versioned runs, SSE, cancellation, replay, receipts, and direct/relayed equivalence; Task 3 covers pairing and relay confidentiality/limits; Task 4 covers provider/OpenClaw and MCP discovery; Task 5 covers evidence, worker budgets, cancellation, and observations; Task 6 covers generated-code safety and evolution; Task 7 covers the canonical UI; Tasks 8-9 cover CI, Pages, release artifacts, canary/rollback receipts, privacy, and exact-head delivery.
- Placeholder scan: no placeholder token, deferred implementation step, or undefined “similar to” step remains.
- Type consistency: run/event, relay, provider, evidence, budget, memory, safety, evolution, and browser transport names are defined once and reused consistently.

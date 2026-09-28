# Universal Execution Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a universal, fail-closed execution broker that selects the best eligible Mahoraga worker/provider for a requested capability and preserves task identity, authority, evidence, and receipts across worker-to-worker handoffs.

**Architecture:** Add a pure deterministic broker core plus a private Cloudflare `mahoraga-execution-broker` Worker. The execution runtime consumes broker-observed routes through a canonical `MAHORAGA_EXECUTION_BROKER` service binding, with `CONNECTOR_CAPABILITY_BROKER` retained temporarily as a compatibility source. Provider-specific execution remains behind bounded provider adapters; a provider is never reported routable unless a fresh attestation and executable binding are both present.

**Tech Stack:** Node.js >=24, ECMAScript modules, TypeScript 7, Cloudflare Workers, Wrangler 4.x, Durable Objects where existing runtime state is required, Node test runner, Vitest with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-09-28-universal-execution-broker-design.md`

## Global Constraints

- The broker cannot expand authority.
- Model output never supplies raw provider credentials or arbitrary endpoints.
- Credentials remain provider-local and are resolved only after route admission.
- Destructive and release-boundary actions retain existing owner governance.
- `codex.execute` and `self.evolve` retain contained-execution controls.
- Stale attestations fail closed.
- Paid routes are not silently selected when task policy requires zero-credit.
- No Railway or Vercel fallback is introduced.
- Handoffs preserve task identity, authority, data class, evidence, and receipts.
- A worker may reduce its requested authority during handoff but may not increase it.
- The canonical production binding is `MAHORAGA_EXECUTION_BROKER`; `CONNECTOR_CAPABILITY_BROKER` is compatibility-only during migration.
- Existing ChatGPT/plugin connections are not credentials for the Cloudflare runtime. Browser, Composio, desktop/RDC, GitHub, Cloudflare, Codex, memory, or artifact providers are routable only when their provider-side service/credential path independently attests healthy execution.

## Review Focus

- **Attestation replay/staleness:** expired, future-dated, duplicate, or overlong attestations must be excluded rather than ranked. Task 1 tests this.
- **Authority narrowing:** a handoff may reduce permission/scopes but may never increase them. Task 1 tests this.
- **Provider says healthy but cannot execute:** discovery without an executable binding must remain unavailable. Tasks 2 and 4 test this.
- **Fallback loops:** repeated worker/capability/error cycles must terminate with `handoff-loop-detected` or `handoff-hop-limit`. Task 4 tests this.
- **Cloud/browser/local boundary:** `local-only` tasks must not route to cloud providers, and offline desktop providers must disappear when their attestation expires. Tasks 1 and 5 test this.

---

### Task 1: Deterministic Universal Broker Core

**Files:**
- Create: `src/universal-execution-broker.mjs`
- Create: `test/universal-execution-broker.test.mjs`

**Interfaces:**
- Produces: `validateWorkerAttestation(value, now)`, `eligibleWorkerRoutes(request, attestations, now)`, `selectWorkerRoute(request, attestations, now)`, `issueRouteLease(request, selected, now)`, `validateHandoff(request, handoff, history, now)`.
- Consumes: no network, filesystem, credential, or Cloudflare binding state; this module remains deterministic and runtime-neutral.

- [ ] **Step 1: Write failing tests for attestation validation and fail-closed eligibility**

Assert valid short-lived attestations pass; stale/future/malformed attestations fail; unhealthy capabilities fail; insufficient permissions fail; authority scopes must be a superset of requested scopes; disallowed data classes fail; `local-only` cannot select cloud/cloudflare locality; zero-credit-first excludes paid-only candidates when a zero-credit route is required.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-isolation=none test/universal-execution-broker.test.mjs`
Expected: FAIL because the broker module/functions do not exist.

- [ ] **Step 3: Implement validation, eligibility, deterministic ranking, and typed failure reasons**

`selectWorkerRoute()` must rank eligible candidates by exact capability match, cost preference, locality fit, observed latency, reliability, queue depth, then stable `provider/workerId` lexical tie-break. Authority and policy checks are filters, never scores.

- [ ] **Step 4: Add failing tests for leases and handoff invariants**

Assert leases preserve `taskId`, `chainId`, capability, worker/provider, scopes, and expiry; handoff can narrow scopes; expansion fails; deadline/hop/visited-worker/repeated-error limits fail with typed reasons.

- [ ] **Step 5: Implement route lease and handoff validation**

Use bounded identifiers and deterministic receipt metadata; do not include credentials or raw provider payloads.

- [ ] **Step 6: Run focused tests**

Run: `node --test --test-isolation=none test/universal-execution-broker.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/universal-execution-broker.mjs test/universal-execution-broker.test.mjs
git commit -m "feat(broker): add deterministic universal routing core"
```

### Task 2: Private Cloudflare Broker Worker and Legacy Connector Adapter

**Files:**
- Create: `deploy/cloudflare-execution-broker/worker.ts`
- Create: `deploy/cloudflare-execution-broker/bindings.d.ts`
- Create: `deploy/cloudflare-execution-broker/wrangler.jsonc`
- Create: `deploy/cloudflare-execution-broker/tsconfig.json`
- Create: `deploy/cloudflare-execution-broker/legacy-connector-adapter.ts`
- Create: `cloudflare-test/universal-execution-broker.integration.vitest.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 broker functions; optional legacy `CONNECTOR_CAPABILITY_BROKER` Fetcher; optional provider Fetcher bindings.
- Produces: private service endpoints `GET /api/capabilities`, `POST /api/route`, `POST /api/handoff`; canonical normalized universal capability projections and selection receipts.

- [ ] **Step 1: Write failing Cloudflare integration tests for private broker discovery**

Test fresh provider attestations, stale provider exclusion, legacy connector attestation conversion, no executable binding => capability not routable, and deterministic route selection.

- [ ] **Step 2: Run Cloudflare tests and verify failure**

Run: `npm run test:cloudflare`
Expected: FAIL because the broker Worker does not exist.

- [ ] **Step 3: Implement `legacy-connector-adapter.ts`**

Convert existing `connector-capability-attestation` grants into universal worker attestations without changing their permission or zero-credit semantics. Provider mapping remains `github`, `cloudflare`, or `composio`; compatibility conversion must never invent execution capability beyond the source grant.

- [ ] **Step 4: Implement broker Worker endpoints**

`GET /api/capabilities` aggregates fresh provider attestations and returns normalized routable routes. `POST /api/route` validates a `UniversalExecutionRequest` and returns a bounded route lease plus sanitized selection receipt. `POST /api/handoff` validates inherited authority/history and reselection.

- [ ] **Step 5: Add broker deployment scripts**

Add `typecheck:execution-broker`, `cloudflare:execution-broker:deploy`, and `cloudflare:execution-broker:deployments` with a pinned Wrangler version. The Worker must have no custom public route in tracked configuration.

- [ ] **Step 6: Run typecheck and Cloudflare tests**

Run: `npm run typecheck:execution-broker && npm run test:cloudflare`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add deploy/cloudflare-execution-broker cloudflare-test/universal-execution-broker.integration.vitest.ts package.json
git commit -m "feat(broker): add private Cloudflare execution broker"
```

### Task 3: Make the Execution Runtime Consume the Universal Pool

**Files:**
- Create: `deploy/cloudflare-execution-runtime/universal-capability-router.ts`
- Modify: `deploy/cloudflare-execution-runtime/worker.ts`
- Modify: `deploy/cloudflare-execution-runtime/bindings.d.ts`
- Modify: `deploy/cloudflare-execution-runtime/worker-configuration.d.ts`
- Modify: `deploy/cloudflare-execution-runtime/wrangler.jsonc`
- Modify: `deploy/cloudflare-execution-runtime/connector-capability-router.ts`
- Modify: `cloudflare-test/connector-capability-routing.integration.vitest.ts`
- Modify: `cloudflare-test/execution-runtime.integration.vitest.ts`
- Modify: `test/cloudflare-execution-runtime-workflow.test.mjs`

**Interfaces:**
- Consumes: broker `GET /api/capabilities` from `MAHORAGA_EXECUTION_BROKER`; legacy broker only when canonical binding is absent.
- Produces: `collectUniversalCapabilityRoutes(broker, legacyBroker, now)` and a runtime capability context derived from observed routes rather than hardcoded execution assumptions.

- [ ] **Step 1: Write failing tests for canonical binding preference and compatibility fallback**

Assert `MAHORAGA_EXECUTION_BROKER` wins when present; legacy connector binding is queried only when the canonical broker is absent; invalid/unreachable broker evidence fails closed; runtime never merges conflicting canonical and legacy grants.

- [ ] **Step 2: Add the production service binding**

In `deploy/cloudflare-execution-runtime/wrangler.jsonc`, bind `MAHORAGA_EXECUTION_BROKER` to service `mahoraga-execution-broker`.

- [ ] **Step 3: Implement universal runtime route collection**

Replace direct connector-only projection in `projectRuntimeCapabilities()` with deterministic core capabilities + assistant provider state + fresh universal broker routes. Preserve known unavailable states for truthful model/UI projection, but derive execution availability from evidence.

- [ ] **Step 4: Keep connector router as compatibility shim**

Do not delete it in this change; route its output only through the migration fallback path.

- [ ] **Step 5: Run focused Cloudflare/runtime tests**

Run: `npm run typecheck:cloudflare && npm run test:cloudflare && node --test --test-isolation=none test/cloudflare-execution-runtime-workflow.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add deploy/cloudflare-execution-runtime cloudflare-test/connector-capability-routing.integration.vitest.ts cloudflare-test/execution-runtime.integration.vitest.ts test/cloudflare-execution-runtime-workflow.test.mjs
git commit -m "feat(runtime): consume universal execution broker"
```

### Task 4: Brokered Execution and Receipt-Preserving Handoff

**Files:**
- Create: `deploy/cloudflare-execution-broker/provider-adapter.ts`
- Create: `deploy/cloudflare-execution-broker/execution-chain.ts`
- Modify: `deploy/cloudflare-execution-broker/worker.ts`
- Modify: `deploy/cloudflare-execution-runtime/worker.ts`
- Modify: `deploy/cloudflare-execution-runtime/storage.ts`
- Modify: `cloudflare-test/universal-execution-broker.integration.vitest.ts`
- Modify: `cloudflare-test/execution-runtime.integration.vitest.ts`

**Interfaces:**
- Consumes: provider service contract `GET /api/capabilities` and `POST /api/execute`; Task 1 lease/handoff functions.
- Produces: `POST /api/execute` on the broker and native runtime action `execute`; per-hop selection/execution/handoff/final receipts sharing one `taskId`/`chainId`.

- [ ] **Step 1: Write failing tests for provider execution contract**

A selected provider receives only the route lease plus bounded task payload/evidence references. A provider may return `{status:"complete", receipt}` or `{status:"handoff", handoff}`. A capability attestation without a callable execution binding must fail `no-eligible-route`.

- [ ] **Step 2: Write failing tests for loop/reselection behavior**

Assert worker failure may cause reselection to another eligible worker; authority/policy failures are not retried through weaker providers; same worker/capability/error repetition terminates; max hops/deadline terminate; receipts remain one chain.

- [ ] **Step 3: Implement provider adapter and execution chain**

Keep credentials inside provider bindings. The broker passes references, not secrets. Persist only sanitized chain/receipt metadata required for replay/audit.

- [ ] **Step 4: Add execution runtime native bridge action**

Add `execute` to the owner-authenticated native bridge path. `cognitive.cycle` remains a decision receipt and is not silently converted into execution; callers explicitly invoke brokered execution with the required capability and authority envelope.

- [ ] **Step 5: Run Cloudflare tests**

Run: `npm run test:cloudflare`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add deploy/cloudflare-execution-broker deploy/cloudflare-execution-runtime cloudflare-test
git commit -m "feat(broker): execute and hand off across workers"
```

### Task 5: Universal Provider Adapter Vocabulary

**Files:**
- Create: `deploy/cloudflare-execution-broker/provider-registry.ts`
- Modify: `deploy/cloudflare-execution-broker/bindings.d.ts`
- Modify: `deploy/cloudflare-execution-broker/wrangler.jsonc`
- Modify: `cloudflare-test/universal-execution-broker.integration.vitest.ts`

**Interfaces:**
- Consumes: optional provider Fetcher bindings for repository/GitHub, Cloudflare, Composio/integration, browser, desktop/RDC, Codex, memory/artifact, image, workspace-agent/self-evolve.
- Produces: one registry of provider descriptors with allowed capability prefixes and permission classes.

- [ ] **Step 1: Write failing registry tests**

Assert provider bindings can advertise only their permitted capability families; browser cannot claim repository write; memory cannot claim cloud execute; desktop becomes unavailable when attestation expires; Codex `codex.execute` requires `contained`; unbound providers never become routable.

- [ ] **Step 2: Implement registry and explicit capability/provider constraints**

Initial vocabulary must cover `repository.*`, `cloud.*`, `integration.*`, `browser.*`, `desktop.*`, `codex.*`, `memory.*`, `artifact.*`, `image.generate`, `workspace-agent.trigger`, and `self.evolve` while preserving stronger contained rules for Codex/self-evolution.

- [ ] **Step 3: Configure optional service-binding names without fake defaults**

Define typed optional bindings such as `REPOSITORY_PROVIDER`, `CLOUD_PROVIDER`, `INTEGRATION_PROVIDER`, `BROWSER_PROVIDER`, `DESKTOP_PROVIDER`, `CODEX_PROVIDER`, `MEMORY_PROVIDER`, `ARTIFACT_PROVIDER`, `IMAGE_PROVIDER`, and `WORKSPACE_PROVIDER`. Do not point them at invented services in production config; only bind concrete provider services when they exist and are independently authenticated.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck:execution-broker && npm run test:cloudflare`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deploy/cloudflare-execution-broker cloudflare-test/universal-execution-broker.integration.vitest.ts
git commit -m "feat(broker): register universal provider capability pool"
```

### Task 6: Owner Gateway and UI Runtime Truth

**Files:**
- Modify: `deploy/cloudflare-owner-gateway/worker.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/lib/capability-families.ts`
- Modify: `cloud-app/components/workspace/connections-view.tsx`
- Modify: `cloud-app/components/workspace/operations-view.tsx`
- Create: `cloud-app/test/universal-execution-capability.test.mjs`
- Modify: `test/cloudflare-owner-gateway-deployment-contract.test.mjs`

**Interfaces:**
- Consumes: universal capability projections and brokered execution receipts from the execution runtime.
- Produces: UI/runtime types for provider/worker, permission class, evidence level, reason, active chain/handoff count; no new authority.

- [ ] **Step 1: Write failing UI/runtime truth tests**

Assert Browser/Desktop/Codex/Memory routes can be displayed when observed; unavailable routes show broker reason; paid routes remain `core-only`; one multi-worker chain is one task with handoff metadata; UI projection does not create capabilities absent from runtime evidence.

- [ ] **Step 2: Generalize owner-gateway capability validation**

Validate the universal vocabulary and bounded provider/worker fields instead of the current narrow connector allowlist. Continue to reject malformed, contradictory, or authority-bearing UI data.

- [ ] **Step 3: Extend `RuntimeCapability` and capability-family execution routes**

Add permission class/selection metadata/handoff count as optional observed fields. Expand the Execution family to the full approved vocabulary.

- [ ] **Step 4: Surface pool state in Connections/Operations views**

Show observed workers/providers and routing reason/evidence without exposing credentials or implying an unavailable worker is connected.

- [ ] **Step 5: Run UI and gateway contract tests**

Run: `node --test --test-isolation=none cloud-app/test/universal-execution-capability.test.mjs test/cloudflare-owner-gateway-deployment-contract.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add deploy/cloudflare-owner-gateway cloud-app/lib cloud-app/components/workspace cloud-app/test/universal-execution-capability.test.mjs test/cloudflare-owner-gateway-deployment-contract.test.mjs
git commit -m "feat(ui): expose universal execution pool truth"
```

### Task 7: Deployment, Exact-Head Verification, and Multi-Hop Acceptance

**Files:**
- Create: `scripts/cloudflare-execution-broker.ts`
- Create: `test/cloudflare-execution-broker-ops.test.ts`
- Create: `test/universal-execution-acceptance.test.ts`
- Modify: `.github/workflows/cloudflare-execution-runtime.yml`
- Modify: `package.json`
- Modify: `docs/PRODUCTION-STATUS.md`

**Interfaces:**
- Consumes: Tasks 1-6 complete.
- Produces: exact-head deployment/acceptance tooling and sanitized evidence for broker + execution runtime.

- [ ] **Step 1: Write failing deployment contract tests**

Assert broker deploy targets exact requested SHA, `mahoraga-execution-broker` is private/service-bound, execution runtime binding is present, Railway/Vercel strings are absent from canonical routing, and no provider secret is emitted into logs/receipts.

- [ ] **Step 2: Implement broker deployment/acceptance operator**

Mirror the existing execution-runtime operator patterns: exact target validation, bounded readiness retries, sanitized run record, deployment identity capture, and cleanup/rollback evidence where relevant.

- [ ] **Step 3: Add synthetic multi-hop acceptance**

Using deterministic fake provider bindings, exercise `repository.inspect -> codex.execute -> repository.verify -> cloud.execute -> browser.execute` with one `chainId`, narrowing authority only, per-hop receipts, final verification, and no orphaned leases.

- [ ] **Step 4: Extend workflow to deploy broker before runtime**

The runtime must never be deployed with `MAHORAGA_EXECUTION_BROKER` pointing to a nonexistent service. Gate runtime deployment on successful exact-head broker deployment/health evidence.

- [ ] **Step 5: Run full verification**

Run: `npm run verify`
Expected: all required Ubuntu/Windows-compatible tests pass; no new skipped required broker tests.

- [ ] **Step 6: Perform live read-only/pre-promotion acceptance**

Verify deployed broker/runtime target SHA, service binding, `/api/capabilities` projection, and a bounded test-provider multi-hop chain. Do not promote or create destructive provider bindings from this step.

- [ ] **Step 7: Update production status with exact evidence**

Record exact source SHA, broker deployment ID, runtime deployment ID, acceptance chain ID, final receipt IDs, unavailable real provider adapters, and remaining credential/provider-service prerequisites. Do not claim Browser/Desktop/Composio/Codex direct execution live unless those providers produced fresh execution receipts.

- [ ] **Step 8: Commit**

```bash
git add scripts/cloudflare-execution-broker.ts test/cloudflare-execution-broker-ops.test.ts test/universal-execution-acceptance.test.ts .github/workflows/cloudflare-execution-runtime.yml package.json docs/PRODUCTION-STATUS.md
git commit -m "test(broker): verify exact-head universal execution chain"
```

## Final Verification Gate

Before opening or updating the implementation PR:

- [ ] `npm run typecheck`
- [ ] `npm run typecheck:cloudflare`
- [ ] `npm run typecheck:execution-broker`
- [ ] `npm run test:cloudflare`
- [ ] `node --test --test-isolation=none test/universal-execution-broker.test.mjs test/cloudflare-execution-broker-ops.test.ts test/universal-execution-acceptance.test.ts test/cloudflare-owner-gateway-deployment-contract.test.mjs`
- [ ] `npm run verify`
- [ ] Confirm diff contains no credentials, provider tokens, raw connector payloads, Railway route, or Vercel fallback.
- [ ] Confirm real-world execution capabilities are reported routable only with fresh executable-provider evidence.
- [ ] Open a PR from the implementation branch; do not merge until exact-head CI and requested live acceptance evidence are green.

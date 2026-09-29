# Universal Reach and Interaction Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral universal interaction layer that carries multimodal, global-presentation, protocol, degraded-network, provenance, and delivery context from existing omnichannel ingress through the Universal Execution Broker without creating or widening execution authority.

**Architecture:** Project validated `OmnichannelEnvelope v1` records into a deterministic `UniversalInteractionEnvelope v1`, negotiate only trusted protocol/schema intersections, pass only execution-relevant interaction constraints into the existing Universal Execution Broker, and keep delivery/reconnect and transformation provenance in separate receipt contracts. Cloudflare/runtime and the existing Mahoraga workspace consume sanitized interaction truth; no new router, SPA, provider credential path, or traffic-authority path is introduced.

**Tech Stack:** Node.js >=24, ECMAScript modules, TypeScript 7, Cloudflare Workers, Wrangler 4.x, Next.js/React, Node test runner, Vitest with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-09-29-universal-reach-interaction-envelope-design.md`

## Global Constraints

- Existing `OmnichannelEnvelope v1` remains ingress truth; the interaction layer is additive.
- The Universal Execution Broker remains execution route authority.
- Interaction metadata can reduce compatibility or requested capability but cannot increase authority, data-class access, spending permission, action class, lease permission, or traffic authority.
- Raw conversation bodies, file bytes, images, audio, video, tokens, cookies, credentials, browser DOM snapshots, raw provider payloads, and arbitrary endpoints stay out of interaction/routing metadata.
- All free-form content remains behind bounded content/evidence references.
- Locale/timezone/currency/measurement/device/network values are explicit client/surface presentation facts only; do not infer nationality, residence, ethnicity, religion, disability, or other sensitive traits.
- Support BCP 47 locale tags, IANA timezone identifiers, ISO 4217 currency identifiers, Unicode-safe text, and LTR/RTL presentation at the edge while machine execution values remain canonical.
- Reconnect/resume may re-deliver immutable results but must never replay an already-committed mutation.
- Unsupported schemas/protocols, stale evidence, malformed metadata, and unavailable adapters fail closed.
- Existing hard-zero, local-only, owner-governance, protected-GitHub-check, contained `codex.execute`, and contained `self.evolve` boundaries remain intact.
- GitHub `main` remains source/evolution truth; Cloudflare remains canonical runtime/control edge.
- Railway remains legacy evidence only: zero-route / zero-influence / zero-fallback / zero-authority. Vercel remains retired/observation-only.
- GitHub Pages remains presentation-only and performs no authenticated execution calls.
- No current ingress or execution contract is deleted in the first release.
- Before implementation, branch from the then-current protected `main`; if #881 has merged, preserve its cockpit/backtest contracts and do not restore older cockpit files.

## Review Focus

1. **Malformed or misleading global presentation context** — invalid BCP 47 locale, timezone, currency, direction, oversized output limit, or device/network value must fail closed without changing machine execution meaning. Task 1 pins this.
2. **Reconnect after a committed execution** — repeated/offline delivery must reuse immutable output references and idempotency lineage without invoking execution again. Task 4 pins this.
3. **Interaction compatibility that appears healthy without executable authority** — matching modality/protocol/locale support must never create a route when capability, permission, attestation freshness, binding, data class, or cost policy fails. Task 3 pins this.
4. **Derivative content mistaken for source evidence** — translation/transcription/OCR/summary/resize/format-conversion output must remain a derivative with source fingerprint provenance and cannot masquerade as original evidence. Task 5 pins this.
5. **Presentation/transport success misread as authority** — successful negotiation, streaming, UI rendering, or delivery must never imply execution readiness, promotion, or traffic authority. Tasks 2, 6, and 7 pin this.

---

### Task 1: Deterministic Universal Interaction Envelope Core

**Files:**
- Create: `src/universal-interaction-envelope.mjs`
- Create: `test/universal-interaction-envelope.test.mjs`
- Read/consume: `src/omnichannel-intake.mjs`

**Interfaces:**
- Consumes: a validated `OmnichannelEnvelope v1` plus bounded explicit interaction context.
- Produces:
  - `projectUniversalInteractionEnvelope(omnichannel, context = {}, { now } = {})`
  - `validateUniversalInteractionEnvelope(value, { now } = {})`
  - `UNIVERSAL_INTERACTION_SCHEMA_VERSION = 1`
  - frozen `UniversalInteractionEnvelope` records with `kind: "universal-interaction-envelope"` and deterministic `fingerprint`.

- [ ] **Step 1: Write failing tests for projection and exact-schema validation**

Cover: text+file multimodal projection; source/correlation/idempotency/data/action/zero-credit/content references copied from ingress; unknown fields rejected; duplicate/invalid content references rejected; stale/expired ingress cannot become fresh; caller may omit/reduce requested capability but may not replace the ingress route hint with a broader capability.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-isolation=none test/universal-interaction-envelope.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Add failing validation tests for presentation, modality, and privacy boundaries**

Assert allowed modalities are exactly `text|structured|file|image|audio|video|event`; presentation accepts only explicit BCP 47 locale, IANA timezone, `ltr|rtl|auto`, `metric|us|uk`, ISO 4217 currency, `phone|tablet|desktop|embedded|headless`, and `online|degraded|offline`; invalid values and forbidden secret-like metadata fail closed. Verify canonical execution/source fingerprints do not change merely because locale, timezone, units, currency, direction, or device class differs.

- [ ] **Step 4: Implement `projectUniversalInteractionEnvelope()` and `validateUniversalInteractionEnvelope()`**

Use `Intl.getCanonicalLocales()` for locale validation, `Intl.DateTimeFormat(..., { timeZone })` for timezone validation, bounded uppercase `[A-Z]{3}` currency identifiers, exact-key object validation, sorted de-duplicated bounded arrays, canonical JSON hashing, and deep freezing. Do not infer presentation facts from content.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none test/universal-interaction-envelope.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/universal-interaction-envelope.mjs test/universal-interaction-envelope.test.mjs
git commit -m "feat(interaction): add universal interaction envelope"
```

### Task 2: Protocol and Schema Negotiation Receipts

**Files:**
- Create: `src/interaction-protocol-negotiation.mjs`
- Create: `test/interaction-protocol-negotiation.test.mjs`

**Interfaces:**
- Consumes: validated `UniversalInteractionEnvelope` and trusted adapter descriptors.
- Produces:
  - `validateInteractionAdapterDescriptor(value)`
  - `negotiateInteractionProtocol(envelope, adapters, { payloadBytes = 0 } = {})`
  - `validateInteractionNegotiationReceipt(value)`
  - frozen `interaction-negotiation-receipt` with `status: "accepted" | "hold"`.
- Adapter descriptor shape: `{ adapterId, family, versions, schemaIds, modalities, maxPayloadBytes }`; family is one of `native|http-json|mcp|webhook|sse|websocket|queue`.

- [ ] **Step 1: Write failing tests for deterministic trusted-adapter negotiation**

Assert a compatible family/version/schema/modality produces one deterministic accepted receipt; adapter ordering cannot change the selected intersection; an unregistered protocol family, unsupported major version, missing schema intersection, unsafe modality, or payload-size mismatch returns `hold` with a typed reason.

- [ ] **Step 2: Add authority-regression assertions**

Assert negotiation receipts contain no action class, authority scope, provider credential, arbitrary URL, or traffic-authority field; changing negotiation success cannot change the source envelope's data/action/cost policy.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test --test-isolation=none test/interaction-protocol-negotiation.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 4: Implement descriptor validation and negotiation**

Select only an explicit trusted adapter intersection. Major-version/schema incompatibility must hold; do not silently downgrade authority semantics. The receipt fingerprint covers only the bounded negotiation facts.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none test/interaction-protocol-negotiation.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interaction-protocol-negotiation.mjs test/interaction-protocol-negotiation.test.mjs
git commit -m "feat(interaction): negotiate protocol and schema compatibility"
```

### Task 3: Interaction-Aware Universal Broker Eligibility

**Files:**
- Modify: `src/universal-execution-broker.mjs`
- Modify: `test/universal-execution-broker.test.mjs`
- Modify: `deploy/cloudflare-execution-broker/provider-registry.ts`
- Modify: `deploy/cloudflare-execution-broker/worker.ts`
- Modify: `deploy/cloudflare-execution-broker/bindings.d.ts`
- Modify: `cloudflare-test/universal-execution-broker.integration.vitest.ts`

**Interfaces:**
- Consumes: existing `UniversalExecutionRequest` plus optional `interactionContext` and existing worker attestations plus optional `interactionSupport`.
- Produces: the same `eligibleWorkerRoutes()`, `selectWorkerRoute()`, `issueRouteLease()`, and broker API contracts, with additive compatibility filtering only.
- `interactionContext`: `{ interactionId, modalities, protocolFamily, locale?, deviceClass?, networkClass? }`.
- `interactionSupport`: `{ modalities?, protocolFamilies?, locales?, maxPayloadBytes? }`.

- [ ] **Step 1: Write failing broker-core tests for interaction compatibility**

Assert a normally eligible route is removed when explicit interaction support excludes the required modality/protocol; wildcard locale support accepts a valid explicit locale; absent `interactionSupport` remains compatible when the capability has no declared interaction requirement; matching support never makes an otherwise ineligible route eligible.

- [ ] **Step 2: Add regression tests for existing gates and ranking**

Assert local-only still excludes cloud/cloudflare; zero-credit-required still excludes paid-only; stale/unhealthy/over-privileged routes still fail; interaction fields never widen lease permission/scopes; interaction metadata is a filter only and does not alter deterministic cost/locality/latency/reliability/queue ranking among otherwise equal compatible routes.

- [ ] **Step 3: Implement optional interaction validation/filtering in `src/universal-execution-broker.mjs`**

Validate bounded values before eligibility. Run existing capability/health/freshness/permission/data/cost/authority checks first, then interaction compatibility; never score authority or interaction metadata.

- [ ] **Step 4: Preserve optional support through the Cloudflare provider registry and broker projection**

Provider descriptors may pass sanitized `interactionSupport`; unbound provider services remain unroutable and no default/fake provider is created.

- [ ] **Step 5: Run focused core and Cloudflare tests**

Run: `node --test --test-isolation=none test/universal-execution-broker.test.mjs && npm run typecheck:execution-broker && npm run test:cloudflare`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/universal-execution-broker.mjs test/universal-execution-broker.test.mjs deploy/cloudflare-execution-broker cloudflare-test/universal-execution-broker.integration.vitest.ts
git commit -m "feat(broker): filter routes by interaction compatibility"
```

### Task 4: Delivery, Offline Queueing, and Replay-Safe Reconnect

**Files:**
- Create: `src/universal-delivery.mjs`
- Create: `test/universal-delivery.test.mjs`

**Interfaces:**
- Consumes: `interactionId`, optional `taskId/chainId`, original idempotency key, immutable `outputReferences`, and channel family.
- Produces:
  - `createDeliveryState(input, { now } = {})`
  - `queueUniversalDelivery(state, reason, { now } = {})`
  - `markUniversalDeliveryDelivered(state, { now } = {})`
  - `projectUniversalDeliveryReceipt(state)`
  - `validateUniversalDeliveryReceipt(value)`
- Receipt kind: `universal-delivery-receipt`; status is `delivered|queued|hold`.

- [ ] **Step 1: Write failing tests for offline completion and reconnect**

Assert an already-completed execution with an offline/degraded client queues immutable output references; reconnect marks the same references delivered; repeated delivery using the same idempotency lineage returns the same terminal delivery fact instead of creating a second mutation/execution event.

- [ ] **Step 2: Add streaming/interruption and tamper tests**

Assert interrupted streaming can remain queued/hold without changing execution completion; replacing output references, task/chain identity, or interaction identity between retries fails closed; no delivery function accepts an execution callback or provider credential.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test --test-isolation=none test/universal-delivery.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 4: Implement immutable delivery state transitions and receipts**

Keep delivery separate from execution. Fingerprint the bounded lineage/status/output references; do not introduce an execution/retry call path into this module.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none test/universal-delivery.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/universal-delivery.mjs test/universal-delivery.test.mjs
git commit -m "feat(interaction): add replay-safe delivery receipts"
```

### Task 5: Transformation and Translation Provenance

**Files:**
- Create: `src/interaction-transformation-provenance.mjs`
- Create: `test/interaction-transformation-provenance.test.mjs`

**Interfaces:**
- Consumes: source reference/fingerprint, transform kind/version, worker/provider receipt reference, output reference/fingerprint, timestamp, optional bounded confidence/quality metadata.
- Produces:
  - `createTransformationReceipt(input, { now } = {})`
  - `validateTransformationReceipt(value)`
  - `sourceEvidenceReference(receipt)`
  - frozen `interaction-transformation-receipt` records.
- Transform kinds: `translation|transcription|ocr|summarization|resize|format-conversion`.

- [ ] **Step 1: Write failing provenance tests**

Assert deterministic receipt creation for translation/transcription; output reference/fingerprint must differ from source; source and output fingerprints are both preserved; duplicate/malformed/secret-bearing metadata fails closed.

- [ ] **Step 2: Add authority and evidence-separation tests**

Assert the derivative receipt contains no traffic authority, provider credential, action authority, or execution promotion; `sourceEvidenceReference(receipt)` returns the original source reference, never the derivative.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test --test-isolation=none test/interaction-transformation-provenance.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 4: Implement transformation receipt validation and source-evidence projection**

Quality/confidence is observational metadata only. Preserve source lineage and deterministic fingerprints; do not overwrite source meaning.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-isolation=none test/interaction-transformation-provenance.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interaction-transformation-provenance.mjs test/interaction-transformation-provenance.test.mjs
git commit -m "feat(interaction): preserve transformation provenance"
```

### Task 6: Cloudflare Runtime Receipt Chain and Trusted Transport Projection

**Files:**
- Create: `deploy/cloudflare-execution-runtime/interaction-runtime.ts`
- Modify: `deploy/cloudflare-execution-runtime/worker.ts`
- Modify: `deploy/cloudflare-execution-runtime/storage.ts`
- Modify: `deploy/cloudflare-execution-runtime/bindings.d.ts`
- Modify: `deploy/cloudflare-owner-gateway/worker.mjs`
- Modify: `cloudflare-test/execution-runtime.integration.vitest.ts`
- Modify: `test/cloudflare-owner-gateway-deployment-contract.test.mjs`

**Interfaces:**
- Consumes: validated interaction envelope, negotiation receipt, existing brokered execution request/receipts, and delivery state.
- Produces:
  - `projectInteractionContext(envelope, negotiationReceipt)` for `UniversalExecutionRequest.interactionContext`;
  - `projectInteractionRuntimeTruth(...)` containing references/fingerprints/status only;
  - sanitized persisted lineage: interaction -> negotiation -> execution chain -> delivery.
- Trusted runtime adapters are registered by service/configuration identity; model/client data never supplies arbitrary URLs, credentials, headers, or executable commands.

- [ ] **Step 1: Write failing Cloudflare tests for execution-context projection**

Assert only `interactionId`, modalities, protocol family, explicit locale, device class, and network class cross into broker request context; action/data/cost/authority remain inherited from existing runtime policy; invalid/held negotiation prevents interaction-aware execution rather than falling through to a weaker adapter.

- [ ] **Step 2: Write failing persistence/replay tests**

Persist sanitized receipt references/fingerprints and delivery state only. Assert reconnect/read paths can recover completed output/delivery truth without calling the broker/provider execution path again; streaming interruption is not rewritten as execution failure.

- [ ] **Step 3: Implement `interaction-runtime.ts` and bounded storage integration**

Keep transport descriptors separate from provider execution adapters. In this first release, only already-real trusted runtime/service surfaces may be registered; MCP/webhook/SSE/WebSocket/queue families without a real admitted adapter return hold rather than fake routability.

- [ ] **Step 4: Extend owner-gateway validation with interaction/delivery truth**

Accept sanitized observed fields only; reject arbitrary endpoint/header/credential fields and authority-bearing claims. Preserve Cloudflare Access and existing owner-authentication boundaries.

- [ ] **Step 5: Run runtime/gateway verification**

Run: `npm run typecheck:cloudflare && npm run test:cloudflare && node --test --test-isolation=none test/cloudflare-owner-gateway-deployment-contract.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add deploy/cloudflare-execution-runtime deploy/cloudflare-owner-gateway/worker.mjs cloudflare-test/execution-runtime.integration.vitest.ts test/cloudflare-owner-gateway-deployment-contract.test.mjs
git commit -m "feat(runtime): preserve universal interaction receipt lineage"
```

### Task 7: Existing Workspace/Cockpit Global and Accessible Interaction Truth

**Files:**
- Create: `cloud-app/lib/interaction-truth.ts`
- Create: `cloud-app/lib/presentation-format.ts`
- Create: `cloud-app/components/cockpit/InteractionTruthCards.tsx`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Modify: `cloud-app/components/workspace/operations-view.tsx`
- Modify: `cloud-app/components/cockpit/CockpitView.tsx`
- Modify: `cloud-app/components/cockpit/CommandCockpit.tsx`
- Create: `cloud-app/test/universal-interaction-ui.test.mjs`

**Interfaces:**
- Consumes: sanitized runtime interaction/delivery projection from Task 6.
- Produces:
  - `RuntimeInteractionTruth` and `RuntimeDeliveryTruth` types in `runtime-relay.ts`;
  - `projectInteractionTruth(value)` with fail-closed observed/hold/absent states;
  - `formatPresentationValue(value, presentation)` for locale/timezone/unit/currency formatting only;
  - observational cockpit/operations UI with no authority mutation.

- [ ] **Step 1: Write failing projection tests**

Assert malformed authority-bearing interaction fields fail closed; observed source/channel/modalities/protocol/device/network/execution/delivery/fingerprint facts project without inventing provider capability or traffic authority.

- [ ] **Step 2: Write failing global-presentation/accessibility tests**

Assert BCP 47/IANA presentation formatting changes labels/rendered values only; machine IDs/fingerprints remain unchanged; `rtl` applies presentation direction without altering contracts; semantic section/card labels and keyboard-readable text are present; no disability/sensitive-trait field is required or rendered.

- [ ] **Step 3: Add responsive/headless contract assertions**

Assert phone/tablet/desktop/embedded/headless all project from the same normalized interaction truth and no hardware identifier, IMEI, MAC, advertising ID, or exact-screen fingerprint is introduced.

- [ ] **Step 4: Implement interaction truth projector and presentation formatter**

Use platform `Intl` APIs at the presentation edge. Do not localize capability IDs or machine receipt identifiers; localize only human-facing labels/values.

- [ ] **Step 5: Mount `InteractionTruthCards` in the existing cockpit and add interaction/delivery rows to Operations**

Reuse the existing status-card/grid structure. Preserve Mahoraga as product name, any merged #881 prediction-backtest cards, connector-routing cards, execution/cognition/traffic-authority separation, and github.io presentation-only behavior. Do not create a new SPA/header.

- [ ] **Step 6: Run cloud-app tests/typecheck/build**

Run: `cd cloud-app && npm run typecheck && npm run test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cloud-app/lib/interaction-truth.ts cloud-app/lib/presentation-format.ts cloud-app/lib/runtime-relay.ts cloud-app/components/workspace/workspace-types.ts cloud-app/components/workspace/operations-view.tsx cloud-app/components/cockpit/InteractionTruthCards.tsx cloud-app/components/cockpit/CockpitView.tsx cloud-app/components/cockpit/CommandCockpit.tsx cloud-app/test/universal-interaction-ui.test.mjs
git commit -m "feat(ui): surface universal interaction and delivery truth"
```

### Task 8: Synthetic Cross-Surface Acceptance, Governance Regression, and Baseline

**Files:**
- Create: `test/universal-reach-flow.test.mjs`
- Modify: `test/universal-execution-broker.test.mjs`
- Modify: `cloudflare-test/universal-execution-broker.integration.vitest.ts`
- Modify: `cloudflare-test/execution-runtime.integration.vitest.ts`
- Modify: `cloud-app/test/universal-interaction-ui.test.mjs`
- Modify/generated: `state/release-baseline/**` via repository baseline tooling only after all tests pass.

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: one deterministic synthetic acceptance chain proving universal reach without live provider credentials or production authority claims.

- [ ] **Step 1: Write the end-to-end synthetic flow test**

Model: owner text request on `phone` + `degraded` network -> validated omnichannel intake -> universal interaction envelope -> accepted trusted protocol negotiation -> `repository.inspect` -> contained `codex.execute` handoff -> `repository.verify` -> immutable final output reference -> offline/queued delivery -> reconnect on `desktop`/headless presentation -> delivered receipt. Assert one correlation/task/chain lineage and bounded handoffs.

- [ ] **Step 2: Add no-replay/no-authority assertions**

Assert reconnect/delivery does not invoke broker/provider execution a second time; successful execution/delivery does not set traffic authority; no paid fallback; no Railway/Vercel executable route; no arbitrary provider URL/credential; local-only and contained-execution regressions remain intact.

- [ ] **Step 3: Run focused universal-reach gate**

Run: `node --test --test-isolation=none test/universal-interaction-envelope.test.mjs test/interaction-protocol-negotiation.test.mjs test/universal-delivery.test.mjs test/interaction-transformation-provenance.test.mjs test/universal-execution-broker.test.mjs test/universal-reach-flow.test.mjs && npm run test:cloudflare && (cd cloud-app && npm run test)`
Expected: PASS.

- [ ] **Step 4: Run repository-wide verification**

Run: `npm run verify`
Expected: PASS with no new failures; document only environment-dependent existing skips.

- [ ] **Step 5: Refresh and verify release baseline**

Run: `npm run baseline:refresh && npm run baseline:verify`
Expected: refreshed baseline matches the exact implementation head. Review the generated diff for credentials, personal data, raw conversation content, transient build output, or unexpected provider endpoints before commit.

- [ ] **Step 6: Run final exact-head sanity checks**

Run: `git diff --check && git status --short && git log -1 --oneline`
Expected: no whitespace errors; only intended tracked changes; exact head recorded for PR evidence.

- [ ] **Step 7: Commit acceptance/baseline changes**

```bash
git add test/universal-reach-flow.test.mjs test/universal-execution-broker.test.mjs cloudflare-test/universal-execution-broker.integration.vitest.ts cloudflare-test/execution-runtime.integration.vitest.ts cloud-app/test/universal-interaction-ui.test.mjs state/release-baseline
git commit -m "test(interaction): prove cross-surface universal reach"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1-8 cover envelope normalization, multimodality/content references, global presentation/accessibility, protocol/schema negotiation, broker integration, provider/transport boundaries, degraded/offline delivery, transformation provenance, common receipt lineage, responsive/headless projection, security/privacy invariants, phased compatibility, deterministic acceptance, and governance regression. Phase-4 real external adapters remain intentionally deferred until independently authenticated provider bindings exist, as required by the spec.
- **Step scan:** Each implementation task uses RED -> minimal implementation -> GREEN -> commit; no task requires an implementer to invent a new authority model or provider endpoint.
- **Type consistency:** Task 1 defines `UniversalInteractionEnvelope`; Task 2 consumes it; Task 3 consumes `interactionContext`; Task 6 projects that exact context and receipt lineage; Task 7 consumes Task 6's sanitized truth; Task 8 composes all interfaces.
- **Review Focus coverage:** malformed global context -> Task 1; replay-safe reconnect -> Task 4; false compatibility/routability -> Task 3; derivative/source confusion -> Task 5; transport/presentation success vs authority -> Tasks 2/6/7.
- **Proportion:** The plan locks names, interfaces, tests, files, and acceptance gates while leaving implementation bodies to the executor. It does not prescribe provider-specific implementations that do not yet have real bindings.

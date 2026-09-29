# Universal Reach and Interaction Envelope Design

**Date:** 2026-09-29  
**Status:** Proposed design for owner review  
**Branch:** `design/universal-reach-interaction-envelope`  
**Baseline:** GitHub `main` at `ee25faad8954d0b6e9d09aa04eeb895f69d525a2`

## 1. Intent

Mahoraga already has two strong foundations:

1. `createOmnichannelEnvelope()` normalizes GitHub, Microsoft/Google messages, files, queues, and owner requests into bounded intake metadata.
2. The Universal Execution Broker normalizes executable workers/providers into a capability pool with fail-closed authority, freshness, cost, locality, lease, handoff, and receipt semantics.

The next step is not another provider-specific route. It is a universal interaction layer between intake and execution so Mahoraga can preserve the same objective, authority, evidence, and user-facing semantics across text, files, images, audio, video, structured events, mobile/desktop clients, weak networks, future devices, and future protocols.

The interaction layer must describe *how work entered and how results may be returned* without granting execution authority. Execution remains controlled by the Universal Execution Broker.

## 2. Design goals

1. Normalize interaction context independently of any specific provider, UI, operating system, or transport.
2. Preserve one correlation/task chain across channel changes and worker handoffs.
3. Support multimodal intake and output through content references rather than embedding raw payloads into routing metadata.
4. Support global delivery: locale, timezone, formatting conventions, Unicode, RTL-ready presentation, and coarse device/network constraints.
5. Support accessibility-first presentation without turning accessibility metadata into execution authority.
6. Negotiate protocol/schema compatibility before routing or delivery.
7. Allow degraded/offline clients to resume safely without replaying mutations.
8. Keep provenance, translation/transformation lineage, privacy class, authority, execution readiness, cognition readiness, delivery readiness, and traffic authority as separate claims.
9. Extend existing omnichannel and universal-broker contracts instead of replacing them.
10. Add future interaction modes and transports through versioned descriptors instead of top-level routing rewrites.

## 3. Non-goals

- The interaction envelope does not grant provider credentials, repository authority, Cloudflare authority, or traffic authority.
- It does not make an unavailable provider executable.
- It does not make `codex.execute` a universal action gate.
- It does not bypass owner approval, contained execution, destructive-action governance, or protected GitHub checks.
- It does not store raw conversation bodies, file bytes, images, audio, video, tokens, cookies, credentials, or browser DOM snapshots in the envelope.
- It does not infer sensitive user traits from language, locale, accessibility, device, or interaction metadata.
- It does not revive Railway or Vercel routing. Railway remains legacy evidence only; Vercel remains retired/observation-only.
- It does not make GitHub Pages an authenticated execution surface.

## 4. Architectural position

```text
External source / owner surface / device / event
                    |
                    v
          Existing ingress adapters
                    |
                    v
          OmnichannelEnvelope v1
                    |
                    v
      UniversalInteractionEnvelope
        |        |          |
        |        |          +--> presentation + delivery constraints
        |        +-------------> locale / protocol / modality context
        +----------------------> content/evidence references only
                    |
                    v
             Task / objective
                    |
                    v
        UniversalExecutionRequest
                    |
                    v
        Universal Execution Broker
                    |
                    v
          worker/provider chain
                    |
                    v
            execution receipts
                    |
                    v
       presentation/delivery projector
                    |
                    v
          user-facing result surface
```

The existing omnichannel envelope remains ingress truth. The new interaction envelope is a normalized, provider-neutral projection that is safe to carry into planning, routing, and delivery. The Universal Execution Broker remains the execution route authority.

## 5. Universal interaction contract

Initial deterministic contract:

```ts
type UniversalInteractionEnvelope = {
  schemaVersion: 1;
  kind: "universal-interaction-envelope";
  interactionId: string;

  // Provenance / continuity
  sourceEnvelopeId: string;
  correlationId: string;
  idempotencyKey: string;
  receivedAt: string;
  expiresAt: string;
  freshness: "fresh" | "stale" | "expired";

  // Policy carried from trusted ingress
  dataClass: "synthetic" | "personal" | "enterprise" | "local-only";
  allowedActionClass: "observe" | "triage" | "draft" | "execute-pack" | "high-impact";
  zeroCreditEligible: boolean;

  // How the request/result can be represented
  modalities: Array<
    "text" | "structured" | "file" | "image" | "audio" | "video" | "event"
  >;
  contentReferences: string[];

  // Client-provided presentation context; no inferred traits
  presentation: {
    locale?: string;
    timeZone?: string;
    direction?: "ltr" | "rtl" | "auto";
    measurementSystem?: "metric" | "us" | "uk";
    currency?: string;
    deviceClass?: "phone" | "tablet" | "desktop" | "embedded" | "headless";
    networkClass?: "online" | "degraded" | "offline";
  };

  // Surface capabilities, not user identity or authority
  delivery: {
    supportsStreaming: boolean;
    supportsMarkdown: boolean;
    supportsRichText: boolean;
    supportsImages: boolean;
    supportsAudio: boolean;
    supportsVideo: boolean;
    supportsFiles: boolean;
    maxOutputBytes?: number;
  };

  // Negotiated interface compatibility
  protocol: {
    family: "native" | "http-json" | "mcp" | "webhook" | "sse" | "websocket" | "queue";
    version: string;
    schemaIds: string[];
  };

  // Optional bounded routing intent inherited from intake
  requestedCapability?: string;

  fingerprint: string;
};
```

All free-form content remains behind `contentReferences`. The envelope contains only bounded metadata needed for routing, policy, presentation, or replay protection.

## 6. Normalization rules

### 6.1 Ingress source remains authoritative

`UniversalInteractionEnvelope` is derived from a validated `OmnichannelEnvelope`; it does not replace or weaken that contract. The following values must be copied or derived fail-closed from ingress evidence:

- `sourceEnvelopeId`
- `correlationId`
- `idempotencyKey`
- `dataClass`
- `allowedActionClass`
- `zeroCreditEligible`
- `contentReferences`
- freshness timestamps
- bounded route hint / requested capability

An interaction projection may reduce supported output modes or requested capability, but may not increase authority, data-class access, spending permission, or action class.

### 6.2 Modalities

Modalities describe representation only. They never imply a worker exists. Examples:

- email text + attachments → `text`, `file`
- uploaded screenshot → `image`
- voice conversation → `audio`, optionally `text` when a transcript artifact exists
- webhook → `event`, `structured`
- JSON API request → `structured`

A transformed representation must produce a new artifact/content reference with provenance to its source. For example, audio transcription or image extraction must not silently replace the source artifact.

### 6.3 Locale and presentation

Locale/timezone/currency/measurement values are accepted only when explicitly supplied by the client or trusted surface. Mahoraga must not infer nationality, residence, ethnicity, religion, or other sensitive traits from language or locale.

The core stores canonical machine values; presentation conversion occurs at the edge. Date/time, unit, number, and currency formatting therefore cannot change execution meaning or fingerprints.

### 6.4 Accessibility

The UI should remain semantic and keyboard/screen-reader friendly by default. Accessibility support is a presentation property, not an authority property. The universal interaction layer must not require disclosure of a disability or medical condition to provide accessible output.

## 7. Protocol and schema negotiation

Provider and client protocol support must be explicit and versioned.

A client/adapter advertises bounded protocol/schema support. Mahoraga selects only an intersection it understands. There is no silent schema downgrade that changes authority semantics.

Negotiation result:

```ts
type InteractionNegotiationReceipt = {
  schemaVersion: 1;
  kind: "interaction-negotiation-receipt";
  interactionId: string;
  protocolFamily: string;
  protocolVersion: string;
  schemaIds: string[];
  status: "accepted" | "hold";
  reason: string;
  fingerprint: string;
};
```

Fail-closed examples:

- unsupported major schema version;
- protocol family with no trusted adapter;
- requested modality that cannot be represented safely;
- payload limit exceeded;
- stale source envelope;
- conflicting data-class or action-class metadata.

## 8. Universal Execution Broker integration

The execution broker should receive only the interaction facts that materially constrain execution.

Recommended additive fields on `UniversalExecutionRequest`:

```ts
interactionContext?: {
  interactionId: string;
  modalities: string[];
  protocolFamily: string;
  locale?: string;
  deviceClass?: string;
  networkClass?: string;
};
```

These values are filters when a capability requires them; they are not execution authority and should not become ranking weights unless a future explicit policy adds a deterministic preference.

A worker attestation may optionally advertise bounded interface support:

```ts
interactionSupport?: {
  modalities?: string[];
  protocolFamilies?: string[];
  locales?: string[]; // explicit values or "*"
  maxPayloadBytes?: number;
};
```

No route becomes eligible merely because `interactionSupport` matches. Existing capability, permission, health, freshness, data-class, authority, cost, and binding gates still apply first.

## 9. Provider and transport bridges

Use adapters rather than provider-specific logic in planning/cognition.

Initial transport families:

- native Mahoraga runtime/service binding;
- HTTP/JSON;
- MCP;
- webhook/event delivery;
- SSE;
- WebSocket;
- queue/event bus.

Adapters must expose typed descriptors and bounded execution/delivery methods. Model output may request a capability but may not supply arbitrary URLs, raw headers, credentials, executable shell, or provider endpoints.

## 10. Delivery and degraded-network behavior

Execution completion and delivery completion are separate facts.

A completed worker chain may produce a final artifact/receipt even when the client is offline. The result is then eligible for later delivery through the same interaction chain.

Delivery receipt:

```ts
type UniversalDeliveryReceipt = {
  schemaVersion: 1;
  kind: "universal-delivery-receipt";
  interactionId: string;
  taskId?: string;
  chainId?: string;
  outputReferences: string[];
  status: "delivered" | "queued" | "hold";
  channelFamily: string;
  deliveredAt?: string;
  reason: string;
  fingerprint: string;
};
```

Rules:

- reconnect/resume may re-deliver immutable results but must not replay already-committed mutations;
- idempotency keys are preserved end-to-end;
- offline state cannot widen authority;
- streaming interruption does not mean execution failed;
- a delivery retry never silently re-executes the task.

## 11. Translation and transformation provenance

Translation, transcription, OCR, summarization, resizing, format conversion, and similar transformations create derivatives rather than overwriting source meaning.

Every derivative artifact should record:

- source content reference/fingerprint;
- transform kind and version;
- transform worker/provider receipt;
- output content reference/fingerprint;
- timestamp;
- confidence/quality metadata when available.

Original content remains the authority for verification unless a specific downstream contract explicitly accepts the derivative.

## 12. Universal observability chain

One operation should be explainable across surfaces with a common receipt lineage:

```text
OmnichannelEnvelope
   -> UniversalInteractionEnvelope
   -> InteractionNegotiationReceipt
   -> UniversalExecutionRequest
   -> UniversalRouteLease
   -> selection/execution/handoff receipts
   -> final execution receipt
   -> UniversalDeliveryReceipt
```

Receipts carry references and fingerprints, not raw payloads or credentials.

The cockpit may display observed facts such as:

- source/channel family;
- modalities;
- protocol family/version;
- locale/timezone presentation context;
- selected provider/worker;
- authority/cost/locality class;
- handoff count;
- execution status;
- delivery status;
- evidence fingerprint/freshness.

None of those UI projections grant authority.

## 13. Internationalization requirements

The interaction layer and UI must be Unicode-safe and support:

- BCP 47 locale tags;
- IANA timezone identifiers;
- ISO 4217 currency identifiers when needed for presentation;
- LTR/RTL directionality;
- locale-aware formatting at the presentation edge;
- normalized machine values for execution contracts;
- no dependency on English-only capability identifiers or UI assumptions.

Capability IDs remain stable ASCII machine identifiers; human labels may be localized independently.

## 14. Responsive and headless reach

The same interaction contract must work for:

- phone;
- tablet;
- desktop browser;
- desktop app;
- embedded display;
- headless API/automation;
- future device surfaces.

`deviceClass` is deliberately coarse. Hardware identifiers, advertising identifiers, exact screen fingerprinting, IMEI, MAC address, or similar device tracking data do not belong in the envelope.

## 15. Security and privacy invariants

1. Raw credentials never enter the interaction envelope.
2. Raw content stays in approved artifact/content stores and is referenced by fingerprinted identifiers.
3. Protocol adapters cannot expand the original action/authority envelope.
4. Unsupported schemas fail closed.
5. Local-only data cannot become cloud-routable through interaction metadata.
6. Client locale/device/network context cannot grant execution authority.
7. Translation/transformation derivatives retain source provenance.
8. Delivery retries do not replay mutations.
9. Existing hard-zero cost semantics remain intact.
10. Existing contained Codex/self-evolution boundaries remain intact.
11. Railway/Vercel remain outside executable routing.
12. GitHub main remains source/evolution truth; Cloudflare remains canonical runtime/control edge.

## 16. Compatibility strategy

The new layer is additive.

Phase 1 projects validated `OmnichannelEnvelope v1` into `UniversalInteractionEnvelope v1` while existing task-policy derivation remains unchanged.

Phase 2 passes optional interaction context into Universal Execution Broker requests and adds optional interface support to worker attestations.

Phase 3 projects interaction/execution/delivery truth into the existing Mahoraga workspace/cockpit.

Phase 4 adds additional trusted adapters only when real provider bindings exist. No fake provider is declared routable to satisfy the abstraction.

No current ingress or execution contract is deleted in the first release.

## 17. Test and acceptance matrix

Minimum deterministic tests:

### Envelope validation
- valid multimodal envelope projects from omnichannel intake;
- unknown fields fail closed;
- duplicate/invalid content references fail;
- stale/expired ingress remains stale/expired;
- action class/data class/cost eligibility cannot be expanded;
- unsupported locale/timezone/protocol/schema values fail closed;
- raw secrets or forbidden metadata are rejected.

### Protocol negotiation
- compatible protocol/schema produces deterministic receipt;
- unsupported major version holds;
- no trusted adapter holds;
- payload limit mismatch holds;
- negotiation cannot alter authority.

### Broker integration
- interaction-mode mismatch removes a route only after normal broker eligibility;
- matching interaction support never creates a route without a valid executable attestation/binding;
- local-only still excludes cloud workers;
- zero-credit requirement still excludes paid-only workers;
- optional interaction context does not change authority or lease permission.

### Delivery/replay
- offline completed result queues delivery without re-execution;
- reconnect delivers the same immutable output reference;
- repeated delivery is idempotent;
- interrupted streaming is not treated as a task mutation replay.

### Transformation provenance
- translation/transcription derivative fingerprints bind to source fingerprints;
- derivative cannot masquerade as source evidence;
- transformation receipts never grant traffic or execution authority.

### UI/accessibility/global presentation
- product remains Mahoraga;
- locale/timezone formatting is presentation-only;
- RTL layout is supported without changing machine contracts;
- semantic accessibility labels/roles remain available;
- phone/tablet/desktop/headless projections use the same normalized interaction truth;
- github.io remains presentation-only and performs no authenticated API calls.

### Governance regression
- no Railway/Vercel executable fallback;
- no provider credential or arbitrary URL in model-controlled data;
- no owner-governance bypass;
- no inference from interaction evidence to traffic authority.

## 18. Success criteria

This design is accepted when Mahoraga can represent one request and result chain consistently across multiple interaction surfaces without provider-specific cognitive branching, while preserving all existing execution and authority gates.

A successful implementation should prove at least one synthetic cross-surface flow such as:

```text
owner text request on phone
  -> omnichannel intake
  -> universal interaction envelope (text, phone, degraded network)
  -> universal execution request
  -> repository.inspect worker
  -> handoff to codex.execute contained worker
  -> repository.verify worker
  -> final immutable artifact/receipt
  -> reconnect
  -> delivery receipt on desktop/headless surface
```

The synthetic proof must keep one correlation/task/chain lineage, must not replay execution on reconnect, and must not infer traffic authority from successful execution or delivery.

## 19. Relationship to current Level 6+ backlog

This specification is the interaction-facing companion to the existing Universal Execution Broker and directly supports the standing #786 goals to consolidate capability/routing authority, normalize evidence, preserve memory/provenance boundaries, and convert successful integration patterns into Mahoraga-native contracts.

It should be implemented as an extension of the existing omnichannel intake and universal broker rather than as a replacement subsystem or parallel router.

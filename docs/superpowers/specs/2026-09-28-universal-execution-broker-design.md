# Universal Execution Broker Design

**Date:** 2026-09-28  
**Status:** Proposed design  
**Branch:** `design/universal-execution-broker`  
**Baseline:** GitHub `main` after PR #858 (`2a69422e9895aa0a13e93e3ebf7642e9b3d92f1d`)

## 1. Intent

Project Mahoraga needs one execution fabric rather than a collection of unrelated direct-action lanes. A user or cognitive worker should describe the capability or outcome it needs; Mahoraga should select the best eligible worker/provider from a universal pool, execute through that worker, and allow the work to hand off to another worker without losing task identity, evidence, authority, or receipts.

The universal broker is the control-plane authority for execution routing. Mahoraga owns the objective, the broker owns route selection and handoff, individual workers own bounded execution, and the verifier/receipt chain owns the claim that work completed.

This design addresses the current production gap where the Cloudflare execution runtime understands a connector broker interface but has no production broker binding, leaving permissioned direct execution routes unavailable even though GitHub, Cloudflare, Composio, browser, desktop, Codex, and other execution machinery exists elsewhere in the system.

## 2. Goals

1. Present every executable worker/provider through one capability pool.
2. Select the best eligible route dynamically rather than hardcoding provider names into cognitive responses or UI flows.
3. Support fast worker-to-worker handoff while preserving one task chain and one auditable authority envelope.
4. Preserve fail-closed execution: stale, unhealthy, unpermitted, over-cost, or policy-incompatible workers are excluded before ranking.
5. Prefer deterministic and zero-credit routes when they can satisfy the request, without treating cost preference as execution authority.
6. Keep contained capabilities such as `codex.execute` and `self.evolve` behind their existing stronger execution-cell and owner-governance boundaries.
7. Make execution evidence visible to the runtime and UI as observed routes, not implied powers.
8. Allow future workers to join the pool by publishing a valid attestation rather than requiring new top-level routing architecture.

## 3. Non-goals

- The broker does not grant new authority by itself.
- The broker does not store raw provider credentials or transfer secrets between workers.
- The model does not select arbitrary provider IDs or endpoints.
- A handoff may not increase the task's authority, spending ceiling, data-class access, or destructive-action scope.
- This design does not collapse the cognitive core, provider inference, execution workers, or verification into one process.
- Railway and Vercel remain outside the authoritative execution path.

## 4. Architectural model

```text
Owner / UI
    |
    v
Mahoraga objective + cognitive.cycle
    |
    | required capability / constraints
    v
Universal Execution Broker
    |
    +-- eligibility gate
    |    capability
    |    permission / authority
    |    health + freshness
    |    data-class policy
    |    spending boundary
    |    owner / governance boundary
    |
    +-- deterministic ranking
    |    exact capability fit
    |    zero-credit preference
    |    locality / latency
    |    reliability
    |    queue pressure
    |    specialization
    |
    +-- selected worker
           |
           +--> execute
           +--> complete with receipt
           +--> or handoff(requiredNextCapability)
                         |
                         +--> broker reselects

Workers/providers in the pool may include:
- GitHub repository connector
- Cloudflare platform connector
- Composio integrations
- browser automation
- desktop / Computer / RDC execution
- contained Codex builder
- memory and artifact stores
- image generation
- workspace agents
- self-evolution workers
- future specialized providers
```

## 5. Universal capability vocabulary

The broker must support a typed capability namespace. The initial vocabulary is:

```text
assistant.respond

cognitive.predict
cognitive.cycle
cognitive.deliberate

repository.inspect
repository.write
repository.verify

cloud.inspect
cloud.execute

integration.inspect
integration.execute

browser.inspect
browser.execute

desktop.inspect
desktop.execute

codex.inspect
codex.execute

memory.read
memory.write

artifact.inspect
artifact.write

image.generate

workspace-agent.trigger
self.evolve
```

Capability presence in the repository is not sufficient for route admission. Only a currently valid worker attestation can make an execution capability routable.

## 6. Worker attestation contract

Every routable worker/provider publishes a short-lived attestation. The canonical shape should include at least:

```ts
type UniversalWorkerAttestation = {
  schemaVersion: 1;
  kind: "universal-worker-attestation";
  workerId: string;
  provider: string;
  capabilities: Array<{
    capability: string;
    permissionClass: "read" | "write" | "execute" | "contained";
    healthy: boolean;
    zeroCreditEligible: boolean;
    costClass: "deterministic" | "zero-credit" | "licensed-cloud" | "metered-cloud";
    dataClassesAllowed: Array<"synthetic" | "personal" | "enterprise" | "local-only">;
    authorityScopes: string[];
  }>;
  locality: "cloudflare" | "cloud" | "local" | "desktop";
  observedLatencyMs?: number;
  queueDepth?: number;
  reliabilityScore?: number;
  observedAt: string;
  expiresAt: string;
};
```

Attestations must be bounded in lifetime. The existing connector behavior of rejecting stale evidence remains the model: no fresh attestation means no route.

## 7. Eligibility before ranking

The broker performs two distinct phases.

### 7.1 Eligibility

A candidate is eligible only if all required conditions pass:

- requested capability is explicitly advertised;
- capability health is true;
- attestation is fresh and schema-valid;
- permission class is sufficient;
- requested authority is a subset of the worker's authority scopes;
- task data class is allowed;
- spending policy permits the route;
- worker is not excluded by task policy, owner policy, or an active circuit breaker;
- contained capabilities satisfy their extra execution-cell requirements;
- the handoff does not expand the inherited authority envelope.

Any candidate that fails one condition is removed. Ranking never overrides an authority or safety failure.

### 7.2 Ranking

The broker deterministically ranks the remaining candidates. Initial ordering should prefer:

1. exact capability/specialization match;
2. deterministic or zero-credit route when sufficient;
3. locality appropriate to the data/task;
4. lower observed latency;
5. higher reliability;
6. lower queue pressure;
7. stable provider preference as the final deterministic tie-breaker.

The ranking implementation must be inspectable and reproducible. It must produce a selection explanation in the receipt without exposing credentials.

## 8. Execution request contract

Callers request capability/outcome, not provider identity:

```ts
type UniversalExecutionRequest = {
  schemaVersion: 1;
  taskId: string;
  chainId: string;
  objectiveId?: string;
  requiredCapability: string;
  requestedPermission: "read" | "write" | "execute" | "contained";
  dataClass: "synthetic" | "personal" | "enterprise" | "local-only";
  authorityScopes: string[];
  costPreference: "zero-credit-first" | "approved-paid";
  deadlineAt?: string;
  maxHops: number;
  constraints: Record<string, unknown>;
  evidenceRefs: string[];
};
```

The broker returns a bounded route lease rather than raw credentials:

```ts
type UniversalRouteLease = {
  routeLeaseId: string;
  taskId: string;
  chainId: string;
  workerId: string;
  provider: string;
  capability: string;
  permissionClass: string;
  authorityScopes: string[];
  expiresAt: string;
  selectionReceiptId: string;
};
```

The lease is single-task, short-lived, and may be revoked by health/policy changes.

## 9. Worker-to-worker handoff

Workers may return a partial result with a typed handoff request:

```ts
type UniversalHandoff = {
  schemaVersion: 1;
  taskId: string;
  chainId: string;
  fromWorkerId: string;
  requiredNextCapability: string;
  requestedPermission: "read" | "write" | "execute" | "contained";
  remainingObjective: string;
  evidenceRefs: string[];
  receiptRefs: string[];
  authorityScopes: string[];
  visitedWorkers: string[];
  hopCount: number;
  deadlineAt?: string;
};
```

The broker validates the inherited envelope and immediately re-runs eligibility/ranking for the next capability.

The handoff passes references and bounded task state only. It never passes provider secrets. Each selected worker resolves its own approved credential reference at execution time.

## 10. Handoff loop controls

Automatic handoff must stop when any of these conditions is met:

- `hopCount >= maxHops`;
- deadline exceeded;
- repeated error fingerprint exceeds configured threshold;
- no eligible route exists;
- same worker/capability pair is requested repeatedly without material state change;
- cumulative spending ceiling reached;
- a requested handoff would expand authority or data-class access;
- governance requires owner approval.

The broker maintains a visited worker/capability set and an error fingerprint history for the chain.

## 11. Provider adapters

The universal broker adapts existing systems rather than replacing them.

### GitHub

Initial capabilities:
- `repository.inspect`
- `repository.write`
- `repository.verify`

### Cloudflare

Initial capabilities:
- `cloud.inspect`
- `cloud.execute`

### Composio

Initial capabilities:
- `integration.inspect`
- `integration.execute`
- optional fallback/adapters for repository/cloud operations when explicitly admitted
- `browser.execute` where the bounded browser provider is healthy and policy-eligible

### Browser

Browser becomes an explicit capability adapter instead of an implicit model power. The worker must return current URL, bounded result/evidence, and an execution receipt. Login/2FA/user-interaction boundaries remain provider-specific and must be surfaced, not bypassed.

### Desktop / Computer / RDC

Desktop execution registers as `desktop.inspect`/`desktop.execute` only while an owner-paired device/relay attests current readiness. Offline devices disappear from eligibility naturally when the attestation expires.

### Codex

`codex.execute` remains a contained capability. The broker may select it, but execution still passes through the existing task policy, execution-cell, base-commit, allowed-path, verification, and release-authority contracts. The universal broker does not downgrade Codex into a generic connector.

### Memory / artifact providers

Durable memory and artifact routes must advertise read/write separately. They may not imply persistence merely because `assistant.respond` is available.

## 12. Cloudflare deployment shape

Create a private service-bound Worker:

```text
mahoraga-execution-broker
```

Canonical path:

```text
mahoraga-owner-gateway
        |
        v
mahoraga-execution-runtime
        |
        v
MAHORAGA_EXECUTION_BROKER  (service binding)
        |
        v
universal worker/provider pool
```

The execution runtime should accept the legacy optional `CONNECTOR_CAPABILITY_BROKER` binding during migration, but the canonical binding becomes `MAHORAGA_EXECUTION_BROKER`.

Production must not depend on Railway or Vercel.

## 13. Runtime capability projection

`projectRuntimeCapabilities()` should stop manufacturing a fixed execution vocabulary whose default state is permanently unavailable. Instead it should combine:

1. deterministic core capabilities (`cognitive.predict`, `cognitive.cycle`);
2. admitted assistant provider state;
3. fresh universal-broker routes.

Known capabilities that are not currently admitted may still be reported as unavailable for truthful UI/state projection, but their availability is derived from broker evidence rather than hardcoded provider assumptions.

The model receives only the projected capability states and verified receipts. It must not infer direct execution from architectural existence.

## 14. UI semantics

The existing capability families remain useful but should surface execution as observed availability:

- Generative
- Agentic
- Execution
- Predictive

Execution family details should expose the currently selected/available route classes without granting authority. Useful fields include:

- capability;
- state;
- selected provider/worker when a task is active;
- reason when unavailable;
- evidence level;
- handoff count for active chains.

The UI should present a multi-worker chain as one user task with an expandable receipt/handoff history.

## 15. Receipts and observability

The broker emits immutable, sanitized receipts for:

- attestation acceptance/rejection;
- route selection;
- lease issuance/revocation;
- execution start/completion/failure;
- handoff request/acceptance;
- verifier result;
- chain completion.

Selection receipts must identify which eligibility filters were applied and why the winning route outranked other eligible routes, without exposing secrets or raw connector payloads.

All completed-action claims presented to the user must be backed by matching execution receipts.

## 16. Failure semantics

Typed failure reasons should include at least:

```text
broker-unavailable
no-eligible-route
attestation-stale
worker-unhealthy
permission-insufficient
authority-scope-mismatch
data-class-not-allowed
cost-boundary-exceeded
contained-execution-not-ready
handoff-hop-limit
handoff-loop-detected
execution-deadline-exceeded
worker-execution-failed
verification-failed
```

A provider failure should normally remove or penalize that worker and allow reselection when another eligible route exists. A policy or authority failure must not be retried through a weaker provider.

## 17. Security and governance invariants

1. The broker cannot expand authority.
2. Model output never supplies raw provider credentials or arbitrary endpoints.
3. Credentials remain provider-local and are resolved only after route admission.
4. Destructive and release-boundary actions retain existing owner governance.
5. `codex.execute` and `self.evolve` retain contained-execution controls.
6. Stale attestations fail closed.
7. Paid routes are not silently selected when task policy requires zero-credit.
8. No Railway or Vercel fallback is introduced.
9. Handoffs preserve task identity, authority, data class, evidence, and receipts.
10. A worker may reduce its requested authority during handoff but may not increase it.

## 18. Compatibility strategy

Phase 1 keeps the existing connector attestation projection valid and wraps it as a provider adapter for the universal broker.

During migration:

```text
MAHORAGA_EXECUTION_BROKER preferred
CONNECTOR_CAPABILITY_BROKER accepted as compatibility fallback
```

After production evidence demonstrates the universal broker is authoritative and all required adapters are represented, the legacy binding can be removed in a later release.

## 19. Test strategy

### Unit tests

- valid/stale/malformed worker attestations;
- permission and authority subset checks;
- data-class policy;
- cost-policy filtering;
- deterministic ranking and tie-breaking;
- route lease expiry;
- handoff envelope preservation;
- loop/hop/error-fingerprint controls;
- contained capability constraints.

### Integration tests

- GitHub route selected for repository read/write;
- Cloudflare route selected for cloud execution;
- Composio route selected for integration action;
- browser route selected when healthy;
- desktop route disappears when readiness expires;
- Codex remains contained;
- worker A -> worker B handoff preserves one chain;
- unhealthy worker causes safe reselection;
- no eligible worker produces a typed failure rather than fabricated execution.

### Cloudflare contract tests

- `MAHORAGA_EXECUTION_BROKER` service binding exists in production config;
- execution runtime consumes broker routes;
- owner gateway remains the authenticated public edge;
- broker has no public custom route unless separately approved;
- target SHA and exact-head deployment evidence remain observable.

### Acceptance test

A production-bound acceptance scenario should exercise one multi-hop chain, for example:

```text
repository.inspect
  -> codex.execute
  -> repository.verify
  -> cloud.execute
  -> browser.execute
```

Acceptance requires one chain ID, bounded authority, successful per-hop receipts, final verification, and no orphaned leases or workers.

## 20. Rollout sequence

1. Introduce broker types, attestation validation, eligibility, deterministic ranking, leases, and receipts behind tests.
2. Wrap the current connector broker as the first adapter.
3. Add the private Cloudflare `mahoraga-execution-broker` Worker and service-bind it to the execution runtime.
4. Move GitHub/Cloudflare/Composio connector projection through the universal broker without changing authority semantics.
5. Add browser adapter.
6. Add desktop/RDC adapter.
7. Add contained Codex adapter/bridge.
8. Add memory/artifact adapters where existing providers can produce bounded receipts.
9. Expose handoff/selection evidence in the UI.
10. Run exact-head CI and a live multi-hop acceptance chain before promotion.

## 21. Acceptance criteria

The design is implemented only when all of the following are true:

- production `mahoraga-execution-runtime` is service-bound to the universal broker;
- GitHub, Cloudflare, and Composio direct routes can become routable from fresh attestations;
- browser, desktop, Codex, memory/artifact routes have explicit adapter contracts rather than hardcoded model claims;
- at least two eligible workers for one capability can be ranked deterministically in test evidence;
- unhealthy/stale workers are excluded fail-closed;
- at least one live multi-worker handoff completes under one chain ID;
- authority and data-class scopes are unchanged or reduced across every handoff;
- exact-head verification is green;
- final acceptance receipts prove no orphan leases/tasks/workers from the test;
- Mahoraga can truthfully report the chosen execution route and its receipt without claiming capabilities that were not admitted.

## 22. Expected outcome

After this change, Mahoraga no longer treats execution as a collection of disconnected hardcoded lanes. It asks the universal broker for the capability needed to advance the objective. The broker selects the best healthy, permitted, policy-compatible worker; the worker executes or requests a typed handoff; and the complete chain remains one auditable Mahoraga task.

The architecture becomes:

```text
objective -> cognition -> universal broker -> best worker -> handoff as needed -> verifier -> receipt
```

This preserves Mahoraga's existing governance while giving it the universal execution pool requested by the owner.
# Execution failover challenge: current source prerequisites

Issue #547 remains a live execution challenge. Source tests and captured routing
observations cannot close it. The challenge needs three distinct admitted,
authorized, zero-credit providers for the same capability: exhaust the preferred
and second routes, then require the third to commit the same objective and
idempotency key through the canonical Cloudflare path.

## Read-only admission inventory

Capture the private broker's existing `GET /api/capabilities` JSON through the
already-authorized runtime inspection path. Keep credentials outside the capture.
Run locally, without deployment or provider mutation:

```sh
node scripts/failover-challenge-preflight.ts /path/to/broker-capabilities.json cloud.inspect
```

The command reads only that local capture, requires a regular file no larger
than 1 MiB, bounds allocation and reads to 1 MiB plus one overflow byte, and
rejects size changes during collection. It reports fresh advertised routes
that match the requested capability, the existing provider binding/registry,
readiness flags and deterministic/zero-credit cost classes. Provider aliases or
multiple workers on one execution binding count as one provider. Missing,
stale, paid, unsupported and malformed entries do not qualify. Exit code 1 means
the three-provider prerequisite is missing; a malformed input produces only a
fixed reason code. The receipt excludes tokens, payloads and upstream bodies.

The report always sets `executionChallengeVerified:false`,
`executionAuthorityGranted:false` and `snapshotProvenanceVerified:false`.
A captured pool does not itself establish account billing, owner authority,
data-class/scope compatibility, current exact-source provenance or execution.
Even three candidate observations would return `live-challenge-required`.
An independent evaluator must establish those omitted boundaries before running
the challenge; the inventory never grants admission or authorizes a fault.

## Concrete source and deployment gaps

At this source revision, `provider-registry.ts` admits `cloud.inspect` only on
`CLOUD_PROVIDER`, and `provider-adapter.ts` maps `cloudflare` to that single
binding. Existing repository, integration and cognition routes cannot be
relabeled as compatible independent Cloudflare inspection providers. Issue #1056
still requires a dedicated account-scoped read-only secret, an independent
zero-dollar boundary, opt-in, exact-main deployment and an authenticated owner
execution receipt. A single successful inspection is insufficient for #547.
Further compatible providers need real implementations and their existing
admission/authority review; this work does not register or activate them.

A failed provider invocation is also not proof that execution never committed.
The adapter now turns thrown transport errors and invalid response content into
the existing sanitized `worker-execution-failed` outcome. The broker returns its
attempted route-selection receipt, without an execution-success receipt or an
automatic successor attempt. Before automatic failover after invocation can be
safe, the real execution path needs durable idempotency/fencing and independent
commit reconciliation, or a verified pre-execution noncommit result. A 429,
transport loss or routing receipt alone cannot establish that boundary.

## Live evidence to retain when the prerequisites exist

Use an evaluator external to the candidate and record the exact current main SHA,
canonical UI/runtime provenance and the same objective, idempotency key,
authority decision/lease, scope, authentication, memory and zero-dollar envelope.
Invalidate evidence when its required exact source changes.

1. Prove all three distinct same-capability providers are admitted and compatible
   before injecting faults. Capture fresh evidence and the declared fault boundary.
2. Exhaust the preferred route and the second route without an ambiguous commit.
   Persist each actual attempt, reason, freshness and successor decision.
3. Require the third route's independently verified provider result and durable
   execution receipt. Routing selection or HTTP success alone is insufficient.
4. Race concurrent submissions and replay the same idempotency key; independently
   reconcile the durable commit ledger to prove at most one provider execution.
5. Retain a minority-rescue case: independent dissent correctly identifies the
   exhausted preferred route and viable alternate despite the majority's belief.
   Preserve the dissent and provenance, including rejected recommendations.

If a viable admitted route remains, complete through it or retain a concrete
route-specific empirical failure. Report BLOCKED only when every authorized
compatible zero-credit route is unavailable, denied, stale or exhausted. No paid,
Railway, hidden delegation or expanded-authority fallback is permitted. None of
this document or its inventory output is evidence that the live challenge ran.

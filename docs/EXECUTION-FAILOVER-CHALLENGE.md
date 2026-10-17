# Execution failover challenge: current source prerequisites

Issue #547 remains a live execution challenge. Source tests and captured routing
observations cannot close it. The challenge needs three distinct admitted,
authorized, zero-credit providers for the same capability: exhaust the preferred
and second routes, then require the third to commit the same objective and
idempotency key through the canonical Cloudflare path.

## Native read-only admission inventory

Use the private broker's existing `GET /api/capabilities` response through the
already-authorized runtime inspection path. That native surface already projects
only fresh, healthy attestations admitted through the broker's provider registry
and actual service bindings; no parallel file reader or second route validator is
needed. Keep credentials and private payloads outside any retained capture.

Inspect `providerReadiness` and the requested capability's `routes`. Provider
aliases or multiple workers on one execution binding count as one provider.
Missing, stale, paid, unsupported and malformed attestations are already rejected
by the broker before projection. At the current source revision, the response
demonstrates fewer than three independent compatible bindings and therefore only
a prerequisite shortage—not a challenge result.

The native capability pool does not itself establish account billing, owner
authority, data-class/scope compatibility, current exact-source provenance or
execution. An independent evaluator must establish those omitted boundaries
before running the challenge; inventory never grants admission or authorizes a
fault.

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

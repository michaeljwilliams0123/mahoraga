# Acceptance replay source preconditions

The exact-main Cloudflare acceptance transaction can obtain its original execution
receipt while concurrent duplicate requests return 409, then encounter HTTP 412
when asking for the persisted replay. The original execution must never be repeated
under a new key to recover acceptance.

At source `286f40fceac9221d2ce149935327bc26f5c24c4a`, both `/api/execute` SHA
checks (outer Worker and Durable Object) return the same three-field response:
`error: "Precondition Failed: SHA mismatch"`, `expected`, and `actual`. Both checks
precede receipt lookup, lease reservation and inference. Provider failures on this
route become 503. Existing deployment convergence already allows a 15-second quiet
interval for stale Durable Object code/bindings. This establishes where a recognized
source precondition can reject work safely; the emitting layer and deployment race
in live run `38778795212` remain unproven without its rejected response evidence.

The acceptance operator permits at most four POST attempts per explicit replay or
post-redeployment continuity replay, separated by that existing 15-second quiet
interval. A retry requires HTTP 412, JSON content type, at most 1 KiB of response
bytes, exactly the three known fields, `actual` matching the unchanged requested
SHA and `expected` containing a different valid SHA. A replay/bypass header on a
412 prevents retry. Malformed bodies, unrecognized preconditions, authentication
failures, 409, 5xx and transport uncertainty do not receive this recovery.

Every attempt keeps the original URL, authentication, acceptance scope, target SHA,
idempotency key and request bytes. Every additional POST counts in
`executionUniqueness.logicalRequests`. Persistent mismatch still fails acceptance.
The initial four-request concurrency probe and deliberate stale-SHA rejection retain
their existing behavior. A successful recovery must return the persisted replay
header and identical original payload; a second original execution, lost receipt,
changed payload or missing replay evidence cannot pass. Quiet retries do not prove
source authority, replace exact-main checks or establish live acceptance on their
own.

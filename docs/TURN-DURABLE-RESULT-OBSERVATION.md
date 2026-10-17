# Per-message durable result observation

This tranche extends issue #452 without replacing the merged per-message
worker/provider/cost/source projection in PR #1105. It adds a bounded,
content-free check against the **actual encrypted answer record** in the
canonical Cloudflare Durable Object store.

## Execution-time versus history-read evidence

The source SHA of a turn is persisted **when the turn executes**. An old turn
must never be attributed to the current deployed source merely because the
conversation is being read today. The execution worker and provider metadata
remain runtime-reported; these are not independent permission or route
selection attestations.

For every completed turn, the authenticated tasks endpoint now compares the
durable turn's own `conversationId`, `contentIdAssistant` and
`responseDigest` to the retained encrypted answer record's matching
conversation, content ID, `role=assistant`, and recorded content hash.
It returns exactly one enum without exposing hashes, ciphertext, plaintext,
secrets, or other records:

| Enum | Meaning |
| --- | --- |
| `matched` | The current runtime found a matching encrypted answer record |
| `missing` | No answer record exists for the completed turn |
| `mismatch` | A record exists but ownership, role, ID, or content hash disagrees |
| `not-observed` | Turn is not successful or required legacy metadata is absent |

This check observes stored metadata at the time the tasks endpoint is read.
It does **not** decrypt the answer, independently authenticate external
execution, prove that Cloudflare replay has occurred, or establish a GitHub
mutation. Source SHA and result checks should be rendered with the explicit
label `runtime-reported`, never as an independent acceptance PASS.

The existing encrypted history read remains authoritative for message
plaintext and must not be replaced by an incomplete receipt. Malformed
optional receipt statuses are omitted by the UI projection. A missing or
mismatched stored result is a visible diagnostic, not permission to
silently reconstruct or overwrite persisted content.

## Verification and next work

Focused tests cover matching records, missing records, mismatched
conversation or ID, changed hash, incorrect role, legacy turns, malformed
metadata, historical message/task correlation, and content minimization.
Existing Cloudflare exact-head typechecking, Vitest and the rooted
cross-platform Verify remain required.

Issue #452 remains open until authenticated per-message **source, identity,
authority, selected route, external result, and replay** receipts are
persisted at their appropriate boundaries, correlated to the same logical
task, independently checked and accepted through the real owner UI.
This source tranche does not claim that independent chain.

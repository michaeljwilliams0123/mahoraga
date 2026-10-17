# Native GitHub App result receipts in chat

## Scope

Issue #452 tracks a complete, independently attributable per-message execution
chain. Existing encrypted answer storage and the `persistedResultObservation`
metadata prove only that the runtime observed a matching encrypted answer record.

Native `/repo admin` commands already use authenticated GitHub App operations
with API readback. Their text answer previously contained the result, but a
reconnected UI could not identify the returned PR, commit, or workflow run
without decrypting and parsing that answer.

This tranche adds an optional, content-free `githubActionReceipt` to the
existing Durable Object turn metadata. It reuses the existing owner-bound
task identity, SQLite transaction, source SHA, and history projection.
There is no additional provider, route, credential, external call or task
scheduler.

## Evidence

The receipts are **runtime-reported summaries** of the GitHub App client
return value, not independently verified owner authorization, execution on
another device, Cloudflare replay or deployment acceptance.

| Action | Evidence preserved | Meaning |
| --- | --- | --- |
| status | current GitHub main SHA | GitHub App repository status returned |
| create | PR number, exact head SHA | PR was created or an exact draft was adopted |
| merge | PR number, head and new main SHA | GitHub App reported and read back a squash merge |
| dispatch | requested head, optional observed run ID | Dispatch accepted; does not mean CI passed |
| checks / diagnose | PR, head, optional run, pending/success/failure | Required check status at inspection time |
| issue / comment / PR mutations | action and bounded issue/PR identifiers | API mutation returned its validated result |

Only enumerated action, kind, outcome, positive IDs and 40-character hexadecimal SHA
representations may enter the receipt. No prompts, answers, tokens, titles,
URLs, secrets or model payloads are stored in the receipt column or
serialized by the UI. Old turns omit this optional field; none are
retroactively assigned new provenance.

### Reconnect and idempotency

The first response, duplicate/idempotent replay, and owner-authenticated
`tasks` read should expose the same action-level receipt for a completed
native admin turn. A stored `PENDING`, `FAILED`, legacy, mismatched or
unrecognized record cannot be presented as a successful GitHub action.

The existing encrypted assistant answer continues to be the full human
readable result. The bounded receipt supplements it but must not replace
it or trigger the external mutation on read.

## Explicit nonclaims

This does **not** establish iPhone live-action acceptance (#973), a fully
independent source/authority/route chain (#452), unattended issue-to-PR
generation (#1145), bot-triggered GitHub workflow approval parity (#962),
or external Cloudflare `cloud.inspect` provider admission (#1056).
Those require separate fresh evidence and acceptance.

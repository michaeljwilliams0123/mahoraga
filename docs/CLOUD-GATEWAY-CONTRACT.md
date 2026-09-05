# Private PWA gateway contract

This contract describes the authenticated Mahoraga PWA envelopes. It is a
provider-neutral schema and abuse boundary. It does **not** claim that a private
backend, listener, or vendor deployment is active.

## Surfaces

| Envelope | Purpose |
| --- | --- |
| Public UI state | Product, authentication flag, and capability names only. |
| Submit | Create or reuse a user-owned task by idempotency key. |
| Status | Bounded task status without prompts, answers, or artifacts. |
| Cancel | Owner cancel of a non-terminal task. |
| Artifact initiate | Metadata-only artifact plus a short-lived task-scoped grant. |
| Event cursor | Opaque SHA-256 cursor over content-free task events. |

## Required controls

- User authentication and origin allowlisting (`https://mahoraga-cloud-workspace.vercel.app`).
- CSRF compared with a timing-safe digest bound to the session.
- Idempotent submit. Repeating a key with a different task type conflicts.
- Pagination limited to 50 events. Unknown cursors fail as stale.
- Artifact grants redeem only for the issuing task and user and expire in 15 minutes.
- Public UI state is disjoint from private task and artifact records.

## Rejected

Oversized envelopes, credential-shaped strings, private-content echoing
(prompts, transcripts, answers), unsafe filenames, cross-task artifact
redemption, localhost/WebSocket origins, and extra fields.

The contract stores no passwords, API keys, model endpoints, or file bytes. It
does not open a public local listener or WebSocket tunnel.

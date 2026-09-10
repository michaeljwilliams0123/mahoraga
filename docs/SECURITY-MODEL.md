# Security Model — Copilot Studio ⇄ GitHub Two-Way Feed

> Design-only. Describes trust boundaries for the contract in this PR. No secrets are stored in Git.

## Trust boundaries

- **Git holds contracts only.** No tokens, keys, connection strings, installation ids, or private
  keys are ever committed. Credentials are referenced by env-var *name* and resolved server-side.
- **Server-side connector holds secrets.** Copilot Studio and any downstream (e.g. Microsoft Graph
  for Teams) credentials live in the connector/secret store, never in the repository.
- **One direction of trust per hop.** GitHub never receives secrets; the connector never exposes
  raw shell/filesystem/tenant access to GitHub.

## Fail-closed rules

| Condition | Behavior |
|---|---|
| Envelope fails schema validation | Reject. No execution. |
| Duplicate `taskId` (receipt exists) | No-op. |
| Ambiguous / multiple envelopes in one body | Reject. |
| Envelope requests broadened authority/scope | Reject. |
| Health/liveness check | Zero-credit only; report `unknown` rather than invoking a model. |
| Credits exhausted / provider error | Fail closed. No partial execution presented as success. |

## What receipts may contain

Allowed: `schemaVersion`, `kind`, `taskId`, `status`, `executorLane`.
Forbidden: prompts, model output, chat text, personal context, credentials, raw account/installation ids.

## Explicitly out of scope for this PR

- No broadened release/activation authority.
- No agent auto-deployment.
- No Teams/Graph wiring (tracked separately; requires tenant-admin consent and a server-side connector).

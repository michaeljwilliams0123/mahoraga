# Copilot Studio ⇄ GitHub Two-Way Feed — Contract (Design Only)

> **Status:** Draft for Primary review. This document defines an interface contract only.
> It wires **no live credentials** and grants **no broadened authority**. All secrets remain
> server-side per repository policy. Nothing here executes a model or spends credits.

## Purpose

Define a bounded, fail-closed bidirectional feed between a Microsoft Copilot Studio
agent instance and the `michaeljwilliams0123/mahoraga` repository, reusing the repo's
existing dispatch-envelope and content-free-receipt patterns.

## Boundaries (non-negotiable)

- **No secrets in Git.** Credentials are referenced only as server-side environment
  variable *names*, never values. Real values live in the connector/secret store outside Git.
- **No broadened authority.** This feed does not modify governance, release, or activation scope.
- **Fail-closed.** Unknown / stale / malformed input is rejected. No paid fallback.
- **PR-for-review.** Inbound tasks return a pull request for Primary review; they are not merged
  as part of the task.
- **Zero-credit health.** Liveness/readiness checks invoke no model. If no zero-credit signal
  exists, report `unknown` rather than spending credits.

## Inbound (GitHub → Copilot Studio)

A GitHub PR body carries exactly one dispatch envelope marker block. The connector acts only
when the envelope validates against `schemas/inbound-dispatch.schema.json`. It fails closed on
malformed, duplicate, ambiguous, or broadened envelopes.

Required fields: `schemaVersion`, `kind`, unique `taskId`, `implementationOnly: true`,
`codeReview: false`, `attempts: 1`, `objective`.

## Outbound (Copilot Studio → GitHub)

On an accepted task, write at most one **content-free** receipt at
`coordination/copilot-studio-receipts/<taskId>.json`, validated against
`schemas/outbound-receipt.schema.json`. If the receipt already exists, no-op.
Receipts never contain prompts, model output, credentials, chats, or personal context.

## Credential handling (server-side only)

| Purpose | Env var NAME (value lives server-side) |
|---|---|
| Copilot Studio client id | `${COPILOT_STUDIO_CLIENT_ID}` |
| Copilot Studio tenant id | `${COPILOT_STUDIO_TENANT_ID}` |
| GitHub app installation | `${GITHUB_APP_INSTALLATION_ID}` |

No token, key, or secret value is ever committed. The repository holds the contract only.

## Verification (to be implemented before any live use)

- Envelope schema validation (valid / malformed / duplicate / broadened).
- Receipt idempotency (duplicate taskId → no-op).
- Denied-auth path returns fail-closed, not partial execution.
- Idle/readiness invokes no model.

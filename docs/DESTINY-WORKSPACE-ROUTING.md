# Mike–Destiny Workspace routing

This lane is a bounded heterogeneous cognitive fabric, not an AGI claim. GitHub is transport and audit. Execution is charged only to the separately authenticated Workspace/Codex identity that accepts the task; subscriptions and credits are never transferred.

## One-command dispatch

```bash
gh workflow run workspace-agent-receiver.yml -f assignment_id=sec-<id> -f route_policy=destiny-workspace
```

Policies are `destiny-workspace`, `mike-primary`, `balanced` (Destiny first), and `overflow` (Mike first). The receiver is intentionally `workflow_dispatch`/assignment-push only; repository-wide issue comments are not receiver triggers, so comments created by Cloudflare or other integrations cannot spawn no-op or startup-failure workflow runs.

For the higher-level issue-to-dispatch path, run **Mahoraga Cloud Task Gateway** explicitly from GitHub Actions with the target `issue_number` and exact bounded `command`. That workflow remains owner-bound and performs the same deterministic issue-form validation before creating a coordination record.

## One-time provisioning

Add these GitHub Actions secrets:

- `DESTINY_WORKSPACE_AGENT_ACCESS_TOKEN`: token issued inside Destiny's authenticated Workspace Agent connection.
- `DESTINY_WORKSPACE_AGENT_TRIGGER_ID`: Destiny's Workspace Agent trigger identifier.
- `DESTINY_WORKSPACE_RECEIPT_PUBLIC_KEY_SPKI`: Ed25519 public key only. Keep the private signing key on Destiny's Workspace side.
- `MIKE_PRIMARY_AGENT_ACCESS_TOKEN` and `MIKE_PRIMARY_WORKSPACE_AGENT_TRIGGER_ID`: Mike's separately authenticated route.

Add these GitHub Actions variables:

- `DESTINY_WORKSPACE_RECEIPT_PUBLIC_KEY_FINGERPRINT`: lowercase SHA-256 fingerprint of the exact SPKI PEM.
- `DESTINY_WORKSPACE_RECEIPT_KEY_ID`: workspace-specific signer ID, distinct from the repository owner.
- `MIKE_PRIMARY_METERED`: `true` only when that route is explicitly metered.

Until all Destiny identity fields agree, `destiny-workspace` fails closed. Do not store ChatGPT sessions, subscription credentials, prompts, transcripts, API keys, or personal context. The shared `chatgpt-codex-connector[bot]` login proves transport only: comment 5742704821 at `f5c9c1ffab` is evidence the connector is callable, not proof of Destiny identity. Use `@codex review` as the reciprocal review path; assignment authentication remains independent.

## Collective benchmark invariants

Handoffs bind the objective digest, authority digest, exact head, allowed paths, retry budget, spawn cap, dissent, verifier, and evidence time. Exhaustion may select the next policy-authorized route without changing the objective. Hidden peer channels, unlisted delegates, authority expansion, privacy payloads, and budget overruns are rejected. Receipts expose comparable completion, cost/benefit route, latency, unauthorized-action rejection, duplicate suppression, rollback, and evidence-freshness metrics.

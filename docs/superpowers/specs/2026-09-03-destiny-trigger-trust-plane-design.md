# Destiny Trigger Trust Plane Design

## Objective

Make the GitHub Destiny Event Dispatch Lane independently attributable, fail-closed on unknown readiness, zero-credit-aware, and durably observable without weakening the existing trusted-envelope validator, exact-head Verify Mahoraga gate, privacy boundary, or owner release authority.

## Scope

This design adds a repository-side trust plane around the external Destiny-authenticated Codex automation. It does not configure or impersonate the external ChatGPT/Codex automation, does not fire a model-backed probe, does not modify the self-evolution stack, and does not broaden release or production authority.

## Architecture

The trust plane has four independent units:

1. `config/destiny-trigger-trust.json` is the versioned non-secret source of truth for the trigger identity contract. It names the repository, trigger ID, accepted receipt-attestation mode, freshness ceiling, and mandatory zero-credit policy. The initial state is deliberately `unconfigured`, so no external execution identity is trusted yet.
2. `src/destiny-trigger-trust.mjs` validates the trust manifest, validates dynamic readiness observations, validates correlated receipts, reduces receipts through a monotonic lifecycle, and builds content-free health summaries.
3. `scripts/destiny-trigger-health.mjs` is a zero-model preflight. It reads the versioned trust manifest plus an optional externally-produced observation file. It performs no network or model invocation. Missing, stale, mismatched, or non-zero-credit evidence returns a non-ready result.
4. `scripts/destiny-codex-dispatch.mjs create` requires a fresh readiness observation before creating a new model-backed dispatch. Existing idempotent retry inspection remains content-only and does not invoke the model. `validate` and `validate-pr` remain deterministic repository checks and do not depend on external readiness.

## Trust identity

A receipt is execution evidence only when the configured attestation mode is independently attributable. Version 1 supports a dedicated GitHub actor contract. `receiptTrust.mode = "dedicated-actor"` requires an exact `actorLogin` distinct from the repository owner. `receiptTrust.mode = "unconfigured"` trusts no execution receipt. A future signed-receipt mode may be added only with a versioned public-key fingerprint and private keys remaining outside Git.

Owner-authored comments can remain historical/operator notes but cannot satisfy trusted execution evidence.

## Readiness contract

A readiness observation is bounded metadata with these required fields:

- `schemaVersion = 1`
- `triggerId`
- `repository`
- `status`: one of `ready`, `not-configured`, `auth-stale`, `delivery-degraded`, `unknown`
- `observedAt` ISO-8601 timestamp
- `zeroCreditEligible` boolean
- `actorLogin` when dedicated-actor trust is configured
- `installationFingerprint` non-secret opaque identifier when known

Ready admission requires: exact trigger/repository identity, configured dedicated actor, actor match, `status=ready`, age within the configured freshness ceiling, and `zeroCreditEligible=true`. Every other state fails closed.

## Receipt contract

Trusted receipts are schema-validated content-free metadata and bind the full correlation tuple:

- repository
- pull-request number
- dispatch ID
- full 64-character request SHA-256
- exact 40-character head SHA
- delivery ID
- receipt kind
- status
- timestamp
- configured actor identity

Allowed lifecycle transitions are:

`created -> acked -> running -> result`

or terminal alternatives:

`created|acked|running -> rejected|expired`

Duplicate identical receipts are suppressed. Conflicting duplicate delivery IDs, correlation mismatches, regressive/out-of-order transitions, and receipts after a terminal state fail deterministically.

## Zero-credit behavior

No health check in this design invokes a model. New dispatch creation fails if readiness is absent, stale, unknown, or not explicitly zero-credit eligible. There is no paid fallback. A live model-backed connection probe remains a separately owner-authorized operation.

## Metrics

Health summaries contain metadata only: accepted receipt counts by kind, duplicate suppression count, rejected/conflicting count, last acknowledged timestamp, last terminal timestamp, last known healthy readiness timestamp, current readiness reason, actor identity, and installation fingerprint. Prompts, model output, credentials, chats, personal files, and raw private context are prohibited.

## Integration boundaries

The existing `Validate Destiny Codex Relay` workflow continues to prove repository-envelope validity only. `Verify Mahoraga` continues to prove exact-head repository correctness. Trust-plane readiness and receipts do not replace either gate. The autonomous integration policy is not modified in this change.

## Documentation naming

Use `Destiny Event Dispatch Lane` for the GitHub PR/event mechanism. Use `Destiny Cipher Relay` for the Cloudflare ciphertext browser-to-local transport. Documentation must explicitly distinguish them.

## Acceptance criteria

1. New dispatch creation fails without fresh zero-credit-ready external evidence.
2. Initial checked-in configuration is fail-closed and trusts no owner-authored receipt.
3. Dedicated actor identity must differ from the repository owner and match readiness/receipt evidence exactly.
4. Readiness expires deterministically using the configured freshness ceiling.
5. Receipts bind full request hash and exact head SHA and follow a monotonic lifecycle.
6. Duplicate identical receipts are suppressed; conflicting/replayed/out-of-order receipts fail.
7. Zero-model health preflight is available without network/model invocation.
8. Existing repository validation and exact-head integration behavior remain unchanged.
9. Documentation clearly separates Event Dispatch Lane from Cipher Relay.
10. No self-evolution/core governance, production activation, release, or external credential changes are included.

# Destiny Event Dispatch Lane

The **Destiny Event Dispatch Lane** is Mahoraga's GitHub pull-request/event mechanism for handing a bounded repository task to the separately authenticated Destiny Codex automation. It is distinct from the **Destiny Cipher Relay**, which is the Cloudflare-hosted ciphertext transport used by the browser-to-local runtime connection.

## What each hop proves

Repository validation does not prove external delivery. `Validate Destiny Codex Relay` proves only that the pull request contains one valid, owner-bound, append-only, hash-bound Destiny dispatch envelope and that its changed paths and verification identifiers satisfy the trusted repository policy. `Verify Mahoraga` proves the exact repository head passes the canonical cross-platform verification gate. Neither check proves that the external Destiny automation received or executed the event.

External delivery and execution evidence must come from the trigger trust plane. A trusted execution receipt must be attributable to a **dedicated actor** that is independently distinguishable from the repository owner, and it must bind the repository, pull-request number, dispatch ID, **full request SHA-256**, **exact head SHA**, delivery ID, status, and timestamp. Owner-authored comments remain operator evidence only and cannot independently prove Destiny execution.

## Current readiness state

`config/destiny-trigger-trust.json` is the non-secret repository source of truth for the external trigger identity contract. The checked-in state is intentionally `unconfigured`, because no independently attributable external actor has yet been bound to the repository contract. In this state, new model-backed Destiny dispatch creation fails closed.

Two independent identity modes are legal once provisioned through a reviewed change to the manifest:

1. **`dedicated-actor`** — receipts must come from a GitHub App/bot login that is not the repository owner. Owner comments cannot satisfy delivery evidence.
2. **`signed-receipt`** — receipts and readiness observations carry an Ed25519 signature over canonical, content-free fields, verifiable against a versioned public-key fingerprint stored in Git. The private key never enters Git. Owner-authored comments still cannot satisfy execution proof.

Secrets, tokens, private keys, or ChatGPT credentials must never be stored in the manifest.

## Zero-credit preflight

`scripts/destiny-trigger-health.mjs` is a **zero-model** local preflight. It reads only the versioned trust manifest and an optional externally produced readiness observation. It performs no network request and invokes no model.

A ready observation must match the configured trigger ID, repository, and dedicated actor; declare `status=ready`; be newer than the configured freshness ceiling; and explicitly state `zeroCreditEligible=true`. Missing, malformed, stale, mismatched, degraded, unknown, or metered evidence fails closed. There is no paid fallback.

If the external platform cannot produce a zero-credit readiness observation, Mahoraga reports the connection as unknown/not ready instead of spending credits to probe it. A live model-backed connection probe is a separate owner-authorized action.

## Dispatch admission

Creating a new envelope with `scripts/destiny-codex-dispatch.mjs create` requires `--readiness-file <path>`. The repository's own trust manifest is fixed; the caller cannot select an alternate trust manifest for dispatch admission.

An existing deterministic envelope may still be inspected idempotently without a readiness file. This does not execute a model or re-deliver the task. A new envelope is not written until the readiness observation passes the trust-plane evaluator.

## Receipt lifecycle

Trusted receipts are content-free metadata and progress monotonically through:

`created -> acked -> running -> result`

or terminate as `rejected` / `expired`. Identical duplicate delivery receipts are suppressed. Conflicting reuse of a delivery ID, correlation mismatch, timestamp regression, out-of-order lifecycle changes, or receipts after a terminal state fail deterministically.

Receipt evidence is observational. It does not replace the exact-head Ubuntu/Windows `Verify Mahoraga` gate or trusted Destiny envelope validation.

## Historical evidence

PR #40 demonstrated a historical end-to-end round trip with an ACK, RESULT, exact-head verification, and duplicate suppression. Those comments were authored through the repository owner's ordinary GitHub identity, so they remain useful historical evidence but are not sufficient as independently attributable execution proof under the new trust plane.

## Relationship to the Destiny Cipher Relay

The **Destiny Cipher Relay** is the separate Cloudflare ciphertext relay used for the browser↔local runtime transport. It does not wake Destiny Codex from a GitHub pull request, does not validate Destiny dispatch envelopes, and does not serve as execution identity evidence for the Event Dispatch Lane.

## Event delivery matrix

GitHub validation and external Destiny delivery are separate hops. `src/destiny-event-delivery.mjs` classifies actor/event classes without invoking a model:

| Actor | Event | GitHub validation | Destiny delivery |
| --- | --- | --- | --- |
| Owner | `pull_request.opened` | schedules | eligible |
| GitHub App | `pull_request.opened` | does not schedule (`app-created-pr-check-suite-gap`); recover with `workflow_dispatch` | supported-path restriction; recover with an owner-authored envelope |
| Owner | `synchronize` / `reopened` / `edited` | schedules | does not re-deliver |
| Any | exhausted / expired retry | dead-letter | dead-letter |

Duplicate `deliveryId` values are suppressed. Bounded backoff never buys a paid probe. The historical app-created-PR check-suite gap is a tested path restriction, not a reason to spend credits.

## Trigger health metrics

`src/destiny-trigger-metrics.mjs` records only bounded metadata: dispatches created, validation accepted/rejected plus reason code, ACK/result latency aggregates, duplicates suppressed, expired/no-ACK count, actor/installation fingerprints, and last healthy timestamp. Prompts, model output, chats, credentials, and personal context are rejected.

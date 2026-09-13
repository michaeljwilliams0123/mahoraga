# Mahoraga current status — 2026-09-13

This note reconciles the earlier repository snapshot with the live GitHub state observed on 2026-09-13.

## Source truth

- Canonical repository: `michaeljwilliams0123/mahoraga`
- Canonical branch: `main`
- Current observed `main`: `aeb8e0f7a9aed81f45eb2e990b723048c660aee2`
- Live repository visibility: **public**
- Product identity: **Mahoraga**
- GitHub remains the immutable evolution ledger/source authority, not the live brain.
- Repository state does not prove live Windows/runtime state.

## Correction to the earlier snapshot

The earlier snapshot stated that the repository was private. The live GitHub repository currently reports visibility as public. That visibility fact does **not** expand runtime, Microsoft, relay, deployment, credential, or execution authority.

## PR #445

PR #445, `feat: cloud zero-credit answer acceptance vertical`, is merged at `aeb8e0f7a9aed81f45eb2e990b723048c660aee2`.

The merged acceptance path is:

`cloud UI/request -> authenticated/encrypted relay -> AuthorityDecision -> verified zero-credit provider admission -> real model execution -> optional bounded tool/capability routing -> durable persistence -> returned answer`

The zero-credit policy remains fail-closed with no automatic paid/licensed fallback.

## Governance

Protected-main stewardship remains squash-only, exact-head, current-base, no-bypass governance. Required Ubuntu and Windows Verify checks must pass on the exact PR head before merge. Drafts, stale/conflicted PRs, unresolved blocking reviews, secret exposure, destructive changes, and unapproved metered/paid model spend remain ineligible.

Source truth, deployment truth, and live-runtime truth remain separate. Candidate activation still belongs to the governed release/evolution channel with canary, checkpoint, rollback, and fresh live-host evidence.

## README discrepancy

The current README still describes the repository as private. This status note records the currently observed public visibility until that wording is reconciled through the normal protected-main process.

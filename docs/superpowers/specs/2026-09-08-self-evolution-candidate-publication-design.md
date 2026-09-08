# Self-Evolution Candidate Publication Design

## Goal

Make Mahoraga able to turn an objective-scoped self-improvement request into an isolated, verified candidate commit and publish that exact commit as a GitHub pull request without granting the code-generation process GitHub mutation authority.

## Current foundation

Mahoraga already has `self.patch` and `self.enhance` lanes, the Primary Codex Builder candidate worktree, execution-cell containment, a zero-credit self-upgrade policy, the GitHub-native sovereign candidate producer, exact-head Verify, autonomous integration, and sovereign evolution receipts.

The missing connection is a first-class runtime capability that composes those pieces.

## Architecture

Expose `self.evolve` on the existing `primary-codex-builder` worker. The worker remains the only code-generation route and continues to run Codex inside a network-disabled disposable execution cell.

`self.evolve` delegates code creation to `executeSelfExtensionCapability`, validates the returned candidate receipt, then hands only immutable Git metadata to a trusted GitHub candidate publisher outside the Codex subprocess.

The publisher pushes the exact candidate commit SHA to a `feature/sovereign-evolution-*` branch, creates or reuses a main-targeting pull request, reads the PR back, and dispatches `Verify Mahoraga` for that branch.
## Authority boundaries

- Codex receives no network access, push, merge, deploy, remote-management, or direct-main authority.
- Candidate creation remains bound to `baseCommit`, `allowedPaths`, and an objective-scoped integration lease.
- The publisher accepts only a locally present candidate commit descended from the current authoritative `origin/main` SHA.
- The publisher recomputes the actual changed paths and requires them to exactly match the contained candidate receipt.
- Autonomous candidate publication cannot touch the existing trust-plane denylist.
- Publication is pull-request-only; the publisher never merges.
- Existing autonomous integration remains the sole merge path and revalidates exact-head GitHub evidence.
- Existing protected paths still require a sovereign evolution receipt before automatic integration.

## Public capability contract

`self.evolve` accepts a task containing the normal Codex Builder task fields plus `evolutionCapability`, which must be `self.patch` or `self.enhance`.

Successful output contains the existing contained `providerReceipt` plus a content-free `selfEvolution` receipt: evolution capability, base SHA, candidate head SHA, branch, pull request number, and changed-files digest.

If Codex is unavailable or its execution cell fails containment, GitHub publication must not run. If GitHub publication fails after the branch is pushed, the branch is retained for safe retry.

## Verification

Tests must prove the candidate publisher is exact-head, path-bound, idempotent for an existing same-head branch/PR, and refuses stale main or mismatched paths. Tests must also prove `self.evolve` never publishes an unverified candidate and preserves the Codex containment receipt.
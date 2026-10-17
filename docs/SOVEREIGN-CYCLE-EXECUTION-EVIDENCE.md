# Sovereign candidate-cycle execution evidence

## Problem and source of truth

A successful GitHub Actions workflow conclusion means the workflow finished according to its job conditions. It does not mean a producer ran, a candidate branch was created, a pull request exists, or the PR passed Verify. In particular, scheduled cadence deduplication and release smoke suppression are legitimate zero-cost outcomes that previously left no per-run artifact explaining the absence of a candidate.

The canonical source remains the exact protected GitHub main SHA. The workflow's checkout must agree with freshly fetched main before candidate admission; a stale checkout is a held observation, not a new source acceptance.

## Producer-smoke freshness

The legacy `sovereign-producer-smoke-v1` tag is historical and is no longer consulted by the producer-smoke admission path. Each accepted release main SHA now has a deterministic `sovereign-producer-smoke-v2-<source-prefix>` tag. Tags are written only after a producer result is `no-candidate` or `candidate-ready`, so a failed run is eligible for a subsequent legitimate attempt. Concurrent runs remain subject to the existing workflow concurrency policy and tag-based suppression.

An old source tag must never suppress a future main SHA, while repeated release events for one source remain idempotent. Source comparison uses the released SHA, current fetched main, and checkout SHA; no branch action is admitted on a mismatch.

## Outcome artifacts

Both candidate-cycle and producer-smoke jobs publish a small sanitized outcome JSON, when their admission checks execute. An outcome never contains prompts, raw model text, credentials, token material, or URLs supplied by a task. It includes the run ID, actual source SHA, a limited disposition, a flag indicating whether Actions itself succeeded, and whether a candidate-ready result had a successfully retained candidate receipt.

The dispositions are:

| Disposition | Meaning |
| --- | --- |
| `not-run` | Admission returned false (duplicate window, prior smoke for the same source, stale checkout, or other stated hold) |
| `held` | The preflight reported a plan hold rather than candidate execution |
| `no-candidate` | The worker executed and explicitly returned no candidate |
| `incomplete` | Admitted work did not produce a recognized completed worker result |
| `unverified-candidate` | Worker reported candidate-ready, but the candidate artifact was not confirmed retained |
| `candidate-ready` | Worker reported a validated candidate and its receipt artifact upload succeeded |
| `job-not-successful` | The job failed, was cancelled, or was otherwise not successful |
| `failed` | The worker explicitly returned a failure |

`candidateProven=true` is only the producer's validated branch/PR receipt plus successful artifact retention. It does **not** prove PR merge, successful exact-head Ubuntu/Windows Verify, the merged production runtime, actual model training, or an authenticated owner transaction. Inspect the candidate receipt's PR identity and live GitHub state before making those separate claims.

The outcome schema is implemented and verified in `scripts/sovereign-workflow-evidence.mjs`. Stored evidence has a source-bound version and is emitted into Actions job summaries and seven-day artifacts. Never classify a skipped step as a successful producer.

## Diagnostic sequence

1. Read the exact GitHub workflow run and its candidate-cycle and producer-smoke job conclusions.
2. If the job was skipped entirely, use the GitHub job-level skip reason; no outcome artifact is expected.
3. If the job ran, inspect the bounded `sovereign-outcome-*` or `sovereign-producer-outcome-*` artifact.
4. When a candidate was reported, inspect the separate candidate receipt, GitHub branch and pull request for the exact source SHA.
5. Verify the PR's required Ubuntu and Windows checks independently and only then inspect the actual merge and deployment evidence.
6. If no candidate exists, report `not-run`, `held`, `no-candidate`, or `incomplete` rather than calling autonomous implementation successful.

These observability receipts have no new provider, credential, spending, or promotion authority. Candidate selection remains content-bounded, zero-credit and under existing protected verification.

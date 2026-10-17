# Sovereign cycle — trusted scheduled admission (2026-10-17)

## Why this exists

GitHub Actions run #39041522005 was a `workflow_run`-triggered
`Sovereign Four Hour Candidate Cycle` on exact main
`1c9d2d15fd813aa08a9f57073dc920746ee4290b`.
It ended `action_required` before any job ran because its triggering
actor was Copilot. This is an admission/authorization event, not a
failing test. Run #39039598909 succeeded at the same source SHA.

A separate, owner-authorized `workflow_dispatch` run (#39045446166)
executed and retained its candidate-cycle outcome. Its generation
steps were correctly skipped because the durable window had already
been completed. It did **not** create a new PR.

## Admission repair

This workflow now accepts only GitHub's hosted hourly `schedule` and
authenticated owner `workflow_dispatch`. The Copilot-inherited
`workflow_run` event has been removed *from this workflow alone*.
The release workflow and canonical Verify checks remain unchanged.

For release-dependent work, the scheduler queries GitHub's own
successful `release.yml` run history. It permits a cadence anchor or
source-scoped producer smoke only if a completed `Publish Staged
Mahoraga Update` run matches the exact checked-out current main SHA,
branch, repository and successful conclusion. Missing, malformed,
failed, stale or foreign release evidence produces no candidate and
creates no source tag.

Every verified new main SHA can still receive one source-specific
producer smoke after its release timestamp, followed by the existing
immutable tag and seven-day sanitized outcome. The four-hour cadence,
persistent completion tags, zero-credit model URL, no paid fallback,
owner identity, source/checkout checks, branch-only PR creation and
protected Ubuntu/Windows Verify remain unchanged.

**Latency trade-off:** a newly released source may wait until the next
hourly scheduled wake for smoke admission, rather than receiving
an immediate `workflow_run` wake. A normal owner dispatch can check
it sooner. We do not spawn a second workflow or a new paid executor.

This change does not toggle GitHub's repository-wide Copilot approval
setting, alter the status of run #39041522005, or claim actual
autonomous candidate creation when producer receipts say
`no-candidate`. Other Copilot-triggered workflows may still require
approval; resolve those using supported repository settings and
separate evidence. Issue #1145 remains open until a real nontrivial
issue-backed candidate PR is independently demonstrated.

## Acceptance

1. New pull request's exact-head Ubuntu and Windows Verify both pass.
2. Protected squash result is verified as authoritative main.
3. Canonical Cloudflare release acceptance is checked independently.
4. First real scheduled wake after merge has at least one executed job
   and is **not** `action_required`.
5. Source-scoped producer receipt is retained, either `no-candidate`
   or an actual validated candidate PR result.
6. No token, owner login or model spending is silently broadened.

The test `test/sovereign-release-evidence.test.mjs` validates the
admission contract and fails closed on unsupported releases.

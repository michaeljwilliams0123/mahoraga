# Branch retention and reference reconciliation — 2026-10-10

Source authority: protected `main` at `6d9b0d6fb4e022ed97e18b8cd2a2fa1df9a1f5fb` when the audit began. **Re-run the inventory before any delete, merge or branch-targeted write.** This is a bounded, read-only source inventory, not a deployment assertion.

## Observed remote refs

The audit compared 333 non-main remote branch names to current main, from a fresh fetch. One extra symbolic `origin/HEAD` ref was excluded. GitHub showed **zero open pull requests** at the observation time.

| Category | Count | Disposition |
| --- | ---: | --- |
| No commits ahead (fully contained) | 38 | Archive/reference verification before deletion |
| Ahead, with no path differences from fork point | 152 | Empty history; candidate only after exact remote-head and PR-history proof |
| Unique changed paths | 143 | Reconcile; do **not** delete or blindly cherry-pick |

151 of the 152 no-diff branches use the `copilot/` prefix. GitHub PR history also associates 150 of the empty-change branches with closed PRs, not active changes.

## Why old branches must not be merged indiscriminately

Some fresh-looking branches are based on outdated UI snapshots. `feat/hf-hub-revision-statuscard-7.0.0-alpha.2` and `feat/owner-continuity-statuscard` each have a three-dot diff that would remove roughly 540 lines from an earlier `CockpitView.tsx` implementation. The additions may already have equivalent current-main implementations; mine their missing semantics selectively instead of replacing current files. The mere presence of extra commits is not sufficient.

The source review found an existing `src/branch-cleanup-ledger.mjs` and `scripts/sovereign-stale-branch-report.mjs`. Their safety and ancestry semantics are preserved. This PR extends the existing cleanup classification rather than creating a parallel branch deletion route.

## How to reproduce without mutating GitHub

1. From a clean checkout of the authoritative repo, fetch `origin` with prune and inspect the exact `origin/main` SHA.
2. Run `node --experimental-strip-types scripts/branch-retention-audit.ts > local-branch-audit.json`.
3. The CLI independently reads `git ls-remote --heads origin`, local branch tips, fork-point file deltas, all accessible PR history using `gh`, and tracked active source/configuration references.
4. Each branch is classified via the existing cleanup ledger. The script never deletes, pushes, commits, merges, or creates pull requests.

The ledger now keeps any branch referenced by current active source in reconcile mode. An ahead-only *no-net-change* branch can become `archive-then-delete` **only when** its exact remote ref and complete PR-history evidence are independently confirmed and it has no active source references. Historical wave-B branches remain reconcile-only. A missing proof fails closed.

## Later consolidation protocol

Use one new branch per coherent domain (e.g., cockpit display, provider routing, CI/ref hygiene). Compare the **merge base**, actual current-main code, existing tests, and path-level changes; import only missing behavior, with TypeScript tests. Do not paste old full-file snapshots into current `CockpitView.tsx`, mutate source-of-truth configuration to silence conflicts, or claim retained artifacts are deployed capabilities.

For any future destructive cleanup, independently re-read the exact remote tip, GitHub PR state, protected refs, live source references, archive/rollback identifier, and current main ancestry **immediately before** the deletion. This report alone never authorizes deletion.

Zero paid usage. No authentication, Cloudflare deployment, protected checks, governance authority, or active workflow schedules changed by this source audit.

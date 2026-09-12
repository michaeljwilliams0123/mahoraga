# PR Salvage Audit Design

## Goal
Recover every still-valid implementation or requirement from closed, unmerged Mahoraga pull requests without reviving obsolete history, duplicate branches, empty WIPs, disproven hypotheses, or merged work.

## Repository constraints
- Preserve the Mahoraga ecosystem lock: TypeScript UI in `cloud-app/` and `operator-deck/`; Node ESM `.mjs` control plane in `src/`, `scripts/`, `test/`, and `relay/`.
- Keep public product identity simply `Mahoraga`; versions are provenance only.
- Do not activate non-3.6.0 Windows production builds.
- Do not widen unrestricted shell, executable, secret, or provider authority.
- Use GitHub exact-head Ubuntu and Windows `Verify Mahoraga` as integration authority.
- Do not request Codex code review or generate automated PR review/comment/reaction traffic.

## Classification model
Each closed, unmerged PR is classified into exactly one disposition:

1. `merged-equivalent` — a later merged PR explicitly supersedes it or current `main` already contains its behavior. Leave closed.
2. `duplicate-or-empty` — duplicate, wrapper, empty WIP, diagnostic-only, or intentionally throwaway. Leave closed.
3. `disproved` — its hypothesis was falsified by stronger evidence. Leave closed and do not resurrect the workaround.
4. `reopenable` — branch still carries a coherent, unique, current-architecture delta that can be refreshed and verified without redesign. Reopen, refresh to current `main`, then verify.
5. `salvage-to-current-main` — requirement remains valid but branch history, architecture, branding, or conflicts are stale. Leave old PR closed and rebuild only the missing behavior from current `main` with TDD.
6. `retired-by-policy` — work conflicts with current owner/repository policy or a newer architecture. Leave closed.

## Audit method
For every closed, unmerged PR:
- read title/body and explicit supersession notes;
- inspect changed-file count and patch for non-empty candidates;
- compare the intended behavior to current `main` code and tests;
- prefer current-main code search over historical assumptions;
- retain only behavior not already present;
- never restore stale branding, weakened fail-closed behavior, obsolete provider assumptions, or accidental file damage.

## Execution order
1. Current active PRs: audit exact-head state and preserve intentional RED-first drafts.
2. Newest closed lineages first: 419/418/407, 399/398, 393/389, current cloud/runtime and Studio/UI lineages.
3. Security/reliability candidates next: public-status redaction, relay continuity, runtime convergence, local-reasoner efficiency, and workspace provenance.
4. Older autonomy/UI candidates last, only where current `main` lacks the behavior.

## Current-main salvage rules
A stale PR is rebuilt instead of reopened when any of these hold:
- merge conflicts or a stale base would mix unrelated history;
- the PR uses superseded versioned product branding;
- the PR depends on retired provider/runtime assumptions;
- the branch contains accidental/truncated files;
- a newer merged lineage partially implemented the same requirement and only a small gap remains.

## Verification
Every implementation salvage uses RED -> GREEN TDD where behavior changes. Before integration:
- focused tests for changed behavior pass;
- release-baseline mirrors are synchronized when governed files change;
- the PR head is current and unchanged;
- exact-head `Verify Mahoraga` succeeds on Ubuntu and Windows.

No completion claim is made from stale, partial, cancelled, or superseded verification evidence.
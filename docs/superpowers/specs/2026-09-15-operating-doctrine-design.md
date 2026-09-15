# Mahoraga Operating Doctrine Design

## Purpose

Mahoraga needs one durable operating contract that prevents future agents from confusing source truth, deployment truth, runtime truth, provider readiness, execution authority, and verification evidence. The contract must preserve the current autonomy-first posture while preventing stale-branch resurrection, duplicate work, false completion claims, and unsafe shortcuts.

## Recommended architecture

Use a hybrid contract with three layers:

1. `docs/MAHORAGA-OPERATING-DOCTRINE.md` is the human-readable source for daily execution rules.
2. `config/operating-doctrine.json` carries the critical invariants in machine-readable form.
3. `test/operating-doctrine-contract.test.mjs` makes the repository Verify gate fail if those invariants disappear or materially weaken.

`AGENTS.md` and `.github/copilot-instructions.md` point agents to the doctrine before substantive work. Existing ecosystem and safety locks remain authoritative for their narrower domains; this doctrine coordinates them rather than replacing them.

## Authority and truth order

GitHub protected `main` is source authority. Railway deployment metadata establishes deployment truth. Fresh runtime observations establish live-runtime truth. Provider/canary/billing/quota evidence establishes provider readiness. Canonical `AuthorityDecision` establishes execution authority. Capability-specific tests and receipts establish verification truth.

No domain may be inferred from a neighboring domain. A green commit does not prove deployment, a healthy container does not prove provider admission, and a routable provider does not prove owner authority.
## SD00 reference-plane rule

SD009WC7 is the current gold-standard local reference execution plane for inspection, TDD, branch mining, compatibility checks, and proving behavior before cloud promotion. It is a laboratory and teacher, not a source-authority override and not a substitute for cloud acceptance evidence.

Local proof should be used to improve cloud behavior: reproduce the behavior on exact protected `main`, promote that exact SHA, then verify the cloud independently. Machine-specific paths, secrets, and host assumptions must never leak into tracked source.

## Standard convergence loop

For every material change:

1. Re-read exact current `origin/main`, open PRs/issues, and relevant live deployment/runtime evidence before editing.
2. Mine older branches/worktrees only for genuinely missing capability. Prefer modern equivalents already on `main`; do not blindly cherry-pick stale commits.
3. Use TDD for behavior changes: focused RED, minimal GREEN, then focused regression coverage.
4. Run `git diff --check` and the relevant focused tests. Run one full `npm run verify` before protected integration unless exact-head equivalent evidence already exists and repository policy permits reuse.
5. Push an isolated branch, open a PR, and require exact-head Ubuntu and Windows Verify. Never use stale green evidence.
6. Merge only through protected-main policy. Do not force-push, bypass checks, or spend model credits to replace deterministic verification.
7. Confirm canonical Railway deploys the exact merged SHA. Treat `/api/live` as liveness only and `/api/ready` as the stronger readiness boundary.
8. Do not call a capability complete until its real acceptance transaction has produced current execution evidence.
## Acceptance transaction

The cloud answer vertical is only proven when one owner-authenticated transaction traverses:

`owner UI/request -> authenticated/encrypted relay -> AuthorityDecision -> verified zero-credit provider admission -> real model execution -> optional bounded tool broker -> persisted task/event/result -> verified returned answer`

Simulator receipts, UI labels, process health, source tests, or `modelInvocations: 0` cannot substitute for this proof. Missing owner identity, relay credentials, fresh provider evidence, zero-dollar eligibility, or runtime provenance must fail closed.

## Anti-duplication and recovery rules

Before reviving old work, compare the branch against current `origin/main` using ancestry, path history, focused diff, and current tests. If equivalent behavior is already present, close the loop as absorbed rather than creating another PR. If a gate fails, diagnose the exact failing layer; do not rerun deterministic failures, add UI evidence, create replacement services, weaken readiness, or route into paid/licensed fallback.

Generated runtime reports and local state are never bundled into a feature commit unless the task explicitly requires them. GitLab remains an independent assurance plane and never becomes source authority.

## Hard boundaries

Routine implementation, verification, PR creation, merge after required gates, and exact-SHA cloud convergence may proceed under the owner's standing autonomy directive. Credentials/authentication changes, destructive operations, security-boundary weakening, unapproved spend, bypassing protected checks, or irreversible core-owner-sovereignty changes remain hard stops.

## Success criteria

The doctrine is complete when agents are directed to it, the machine-readable contract captures its critical invariants, repository tests enforce those invariants, full Verify stays green, and the change lands through the same exact-head cross-platform process it prescribes.
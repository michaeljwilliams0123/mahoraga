# Mahoraga operating doctrine

This is the daily execution contract for Mahoraga development, convergence, and acceptance. It coordinates the ecosystem lock, agent instructions, protected-main policy, runtime evidence, and owner-directed autonomy rules.

The machine-readable companion is [`config/operating-doctrine.json`](../config/operating-doctrine.json). If prose and the machine contract diverge, fail closed and reconcile them through a verified PR.

## Truth hierarchy

Never collapse neighboring evidence domains:

1. **Source truth** — protected GitHub `main` and its exact commit SHA.
2. **Deployment truth** — canonical host deployment metadata tied to an exact SHA.
3. **Live-runtime truth** — fresh process, listener, worker, and runtime observations.
4. **Provider readiness** — fresh provider, canary, billing, quota, and health evidence.
5. **Execution authority** — canonical `AuthorityDecision` for the requested capability.
6. **Verification truth** — capability-specific tests, postconditions, and typed receipts.

A green commit does not prove deployment. A healthy deployment does not prove provider admission. Provider readiness does not grant owner authority. A passing simulator does not prove a real transaction.

## SD00 reference execution plane

`SD009WC7` is the current **gold-standard reference** execution plane. Use it aggressively for branch mining, inspection, TDD, compatibility checks, local proof, and reproducing expected behavior before cloud promotion.

SD00 is a laboratory and teacher, not source authority. It cannot override GitHub `main`, bypass protected verification, broaden runtime authority, or substitute local evidence for a required cloud acceptance proof. Never commit machine-specific paths, credentials, local tokens, or private runtime state.
## Standard convergence loop

1. Re-read exact current `origin/main`, relevant open PRs/issues, and live deployment/runtime evidence before editing.
2. Mine older branches and worktrees only for capability genuinely missing from current `main`. Compare ancestry, path history, focused diff, and current tests before reviving anything.
3. For behavior changes, use focused TDD: RED first, minimal GREEN, then regression coverage.
4. Keep generated runtime reports and local state out of feature commits unless the task explicitly requires them.
5. Run `git diff --check`, focused tests, and one full `npm run verify` before protected integration unless exact-head equivalent evidence is explicitly reusable under repository policy.
6. Push an isolated branch and require exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` on that PR head.
7. Merge only through protected-main policy. Do not force-push, bypass checks, or buy model review to replace deterministic evidence.
8. Confirm canonical Railway deploys the exact merged SHA. `/api/live` proves liveness only; `/api/ready` is the stronger application/provenance readiness boundary.
9. Continue useful independent work while a gate runs: inspect the next branch, deployment layer, acceptance gap, or unresolved capability instead of idling.
10. Do not call the capability complete until its real acceptance transaction has current end-to-end evidence.

## Real acceptance vertical

A real cloud answer acceptance transaction is:

`owner-authenticated request -> encrypted relay -> AuthorityDecision -> verified zero-credit provider admission -> real model execution -> optional bounded tool broker -> persisted task/event/result -> verified returned answer`

Simulator evidence is **not execution proof**. UI evidence is **not execution proof**. Source tests, process health, or `modelInvocations: 0` are useful diagnostics but cannot replace a real model-execution receipt chain when the acceptance target requires real execution.

Missing owner identity, relay credentials, exact runtime provenance, fresh provider readiness, zero-dollar eligibility, or required authority must fail closed. Zero-credit work must never silently fall through to a paid or licensed provider.
## Anti-duplication and failure handling

Do not blindly cherry-pick stale branch commits. If current `main` already contains equivalent behavior under newer commits, record the work as absorbed and move on. Prefer one authoritative implementation over parallel variants, duplicate PRs, or synthetic reconciliation commits.

When a gate fails, diagnose the exact layer before acting. Do not repeatedly rerun a deterministic failure, create replacement cloud services, add UI-only evidence, weaken readiness/authentication, or change providers merely to make a status indicator green.

GitLab is an independent assurance plane. It may verify runners, credentials, head observation, and repair decisions, but it never becomes source authority and must not block a healthy canonical Railway deployment without a policy reason.

## Standing autonomy and hard stops

Routine inspection, implementation, focused/full verification, PR creation, exact-head merge after required gates, branch cleanup, and exact-SHA cloud convergence may proceed under the owner's standing autonomy directive.

Stop rather than infer authority for: credential/authentication-boundary changes, destructive operations, security-boundary weakening, unapproved spend, protected-check bypass, or irreversible owner-sovereignty changes. Existing platform safety rules remain local to the action and are not permission to rewrite the architecture.

## Completion language

Claims must match evidence. Say **merged** only after merge evidence, **deployed** only after host metadata, **ready** only after the readiness boundary, and **executed** only after actual execution evidence. If a layer is unknown, call it unknown.

Before saying a tranche is complete, run fresh verification appropriate to the claim and read its final exit/result. Evidence before assertion is mandatory.
## Network apertures

Owner-authenticated tunnels are permitted only as **bounded Mahoraga apertures** for a declared objective/capability under the current aperture policy. They must remain authenticated, peer/target scoped, time-limited, auditable, independently validated where required, and deterministically closed.

Direct public exposure of raw `4782/4783` listeners is prohibited. A worker may not turn an owner-authenticated tunnel into a permanent generic forward, extend its own lease, or treat tunnel reachability as proof of runtime authority.
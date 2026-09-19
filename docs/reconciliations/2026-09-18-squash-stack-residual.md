# 2026-09-18 squash-stack residual reconciliation

**Scope:** residuals from the owner-authorized protected-main bypass that squash-merged the open PR queue onto `main`.
**Does not prove:** live Railway SHA, model execution, Ubuntu runner health, or GitLab confirmation.

## What landed on `main`

Squash commits, oldest to newest:

| SHA | PR | Surface |
| --- | --- | --- |
| `e1531f9` | #587 | Vercel silent non-deploying tombstone |
| `d8cb631` | #596 | Windows atomic-state rename retry |
| `6e5f4b1` | #561 | Railway exact-SHA cockpit/promotion copy |
| `5f9d751` | #594 | Sovereign cycle on zero-credit SD00 |
| `edab200` | #579 | owner PIN login UI |
| `1e6614a` | #576 + #597 | Collective participant integrity + Windows answer-quality cleanup |
| `e459680` | #577 | portable mission-authority lease design |
| `bff0508` | #564 | Cloudflare → GitHub capability broker design |

No two of those squashes touched the same path. File-level overlap from the bypass itself is empty. The risk was **behind-base squash onto moving `main`**, not colliding hunks.

## What this did to branches

- Open PR count went 9 → 0.
- GitHub deleted the merged feature heads; they are not present on the remote.
- Closed Copilot WIPs #616/#617/#618 still have remote heads (`copilot/fix-308995719-1343333190-{347468b6,5e9c68cd,c4c82287}`). They are not source authority.
- ~130 other historical remote branches remain behind `main`. They were not fast-forwarded. Do not treat them as current.

## What this threw off

1. **Source vs Railway.** `main` is `bff0508`. Canonical Railway was last proven on `6e43fd9`. Exact-SHA promotion is now required before cockpit "Current" is true.
2. **Cockpit vs health.** #561 now labels Railway exact-SHA production, but `/api/health` was still `force-static` and defaulted missing evidence to `local`. That is a truth defect, not a liveness defect.
3. **Docs.** README still pointed at 2026-09-15 / #533. Polyglot ledger still said tranche 1 was unmerged after #586.
4. **Ruleset.** Temporarily disabled for the bypass, then restored to active with zero bypass actors. Exact-head Verify is required again.
5. **Vercel.** Source tombstone is on `main`. Provider-side Git apps `mahoraga-workspace`, `mahoraga-workspace-prod`, and `mahoraga-workspace-app` may still emit until disconnected in the Vercel dashboard.

## Bounded repair in this branch

- Evaluate `/api/health` dynamically.
- Recognize Railway runtime markers.
- Return `unknown` instead of false `local` when evidence is absent.
- Keep runtime provenance `unknown` until the paired core supplies it.
- Do not change `/api/ready`, auth, expected-SHA pin semantics, provider admission, or zero-credit policy.
- Reconcile README and the polyglot ledger to current `main`.

## Still not claimed

- Ubuntu self-hosted runner recovery (#571).
- One owner-authenticated verified-zero production transaction (#455/#452).
- GitLab `github-repair-confirm` (#580).
- Tranche 2 TypeScript migration.

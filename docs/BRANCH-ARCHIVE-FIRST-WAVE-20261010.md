# Branch archive and pruning receipt — 2026-10-10

Read-only execution record for the first cleanup wave. **Do not use this receipt to authorize a later deletion without a fresh audit.**

- Authoritative main: `9796e7dc83d6fb3b027f0ffe32a09bb9b075a140`
- Baseline: 334 non-main branches, including one new concurrent UI branch
- Full current-main inventory: 36 branches fully contained, 152 additional archive-first candidates, and 146 retained for reconciliation
- **36 contained branches archived to annotated remote tags and atomically deleted by exact-SHA lease**
- All 36 archive tags independently checked against the original commit IDs; deleted branch refs absent in remote listing
- Two bounded waves: 10 and 26, with live GitHub protection, open-PR, ancestry, active-source-reference, and exact-head checks immediately before each ref update
- GitHub Actions, main, provider bindings, runtime authorities, schedules, billing policies, and unique-work branches were not modified

## Restoration

To restore one branch, create a new branch ref from its archived tag after owner authorization and checking for naming conflicts:

```sh
git fetch origin --tags
git switch -c restore/<new-name> <archive-tag>
git push origin HEAD:refs/heads/<new-name>
```

## Verified original refs and archival tags

| Original branch | Original commit | Remote archive tag |
| --- | --- | --- |
| `cleanup/railway-retirement-current` | `3bcae7b85c6c5260e62f8ecf7dc17f0d914f0d32` | `branch-archive/2026-10-10/cleanup/railway-retirement-current` |
| `feat/ui-7.0.0-alpha.2-cf1-readiness` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/ui-7.0.0-alpha.2-cf1-readiness` |
| `feat/ui-7.0.0-alpha.2-origin-boundary-live` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/ui-7.0.0-alpha.2-origin-boundary-live` |
| `feat/ui-hide-port-choice-7-0-0-alpha-2` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/ui-hide-port-choice-7-0-0-alpha-2` |
| `feat/ui-origin-boundary-550-cockpit` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/ui-origin-boundary-550-cockpit` |
| `feat/ui-origin-boundary-550-cockpit-enhance` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/ui-origin-boundary-550-cockpit-enhance` |
| `fix/455-owner-gateway-railway-origin-red` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/fix/455-owner-gateway-railway-origin-red` |
| `fix/cloud-startup-provenance-diagnostics-red` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/fix/cloud-startup-provenance-diagnostics-red` |
| `fix/cloudflare-accept-verified-dispatch` | `3bcae7b85c6c5260e62f8ecf7dc17f0d914f0d32` | `branch-archive/2026-10-10/fix/cloudflare-accept-verified-dispatch` |
| `fix/cloudflare-first-deploy-secret` | `b0aecd209c8b01346959bc44ac1e6b24a4fccb41` | `branch-archive/2026-10-10/fix/cloudflare-first-deploy-secret` |
| `fix/credit-free-heartbeat-autonomy` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/fix/credit-free-heartbeat-autonomy` |
| `fix/deployment-provenance-readiness` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/fix/deployment-provenance-readiness` |
| `fix/pages-canonical-entry` | `52015efe827829cd94b39ad672910e256c1c72ae` | `branch-archive/2026-10-10/fix/pages-canonical-entry` |
| `fix/remove-cloudflare-railway-fallthrough` | `e1164557b1fccf56320aab57ea811ce26026a01c` | `branch-archive/2026-10-10/fix/remove-cloudflare-railway-fallthrough` |
| `fix/steward-zero-credit-runner-and-objective-failover` | `bff05087ccf54cbe9d0911c23421c35d97725425` | `branch-archive/2026-10-10/fix/steward-zero-credit-runner-and-objective-failover` |
| `fix/zero-railway-fallthrough` | `f2ae3a96911ad6b891c0a7d4b631f98cf7b013df` | `branch-archive/2026-10-10/fix/zero-railway-fallthrough` |
| `docs/cloudflare-cognitive-control-fabric-20260915` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/docs/cloudflare-cognitive-control-fabric-20260915` |
| `codex/operator-authenticated-reads-412` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/codex/operator-authenticated-reads-412` |
| `feature/cloudflare-control-ingress` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/cloudflare-control-ingress` |
| `feature/cognitive-prediction-gate` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/cognitive-prediction-gate` |
| `feature/collective-agi-convergence-wave-1` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/collective-agi-convergence-wave-1` |
| `feature/destiny-work-event-contract-20260908` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/destiny-work-event-contract-20260908` |
| `feature/personal-sovereign-evolution-design-20260912` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/personal-sovereign-evolution-design-20260912` |
| `feature/unattended-dual-loop-20260905` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feature/unattended-dual-loop-20260905` |
| `challenge/calibration-learning-e8c7da3` | `e8c7da36b52933c079b51b75db184f6b724ffe53` | `branch-archive/2026-10-10/challenge/calibration-learning-e8c7da3` |
| `challenge/calibration-profile-integrity-0097449` | `009744969296951392d6a2dc7c55fbf80ad46fd8` | `branch-archive/2026-10-10/challenge/calibration-profile-integrity-0097449` |
| `challenge/calibration-profile-integrity-2ebdf9f` | `2ebdf9f2e4ea571e0eb0e0644d0075c8e7ec8f7a` | `branch-archive/2026-10-10/challenge/calibration-profile-integrity-2ebdf9f` |
| `challenge/evolution-composed-gate-e8c7da3` | `e8c7da36b52933c079b51b75db184f6b724ffe53` | `branch-archive/2026-10-10/challenge/evolution-composed-gate-e8c7da3` |
| `challenge/governed-evolution-e8c7da3` | `e8c7da36b52933c079b51b75db184f6b724ffe53` | `branch-archive/2026-10-10/challenge/governed-evolution-e8c7da3` |
| `feat/issue-376-teams-send` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/feat/issue-376-teams-send` |
| `ops/heldout-calibration-backtest` | `009744969296951392d6a2dc7c55fbf80ad46fd8` | `branch-archive/2026-10-10/ops/heldout-calibration-backtest` |
| `ops/historical-calibration-backtest-20260928` | `009744969296951392d6a2dc7c55fbf80ad46fd8` | `branch-archive/2026-10-10/ops/historical-calibration-backtest-20260928` |
| `repair/cloudflare-zero-railway-e116455` | `f5198cd30a849f0fea2d16255f1f4daef7b2f928` | `branch-archive/2026-10-10/repair/cloudflare-zero-railway-e116455` |
| `ui/7.0.0-alpha.2-workers-builds-cockpit` | `d29c45e6620c2818711906210c799fa44fd12351` | `branch-archive/2026-10-10/ui/7.0.0-alpha.2-workers-builds-cockpit` |
| `ui/alpha2-artifact-bridge-505` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/ui/alpha2-artifact-bridge-505` |
| `ui/alpha2-convergence-enhance` | `c4b64059890bc48a8b981cea06c8c02673a9f916` | `branch-archive/2026-10-10/ui/alpha2-convergence-enhance` |

## Next actions

Review the 152 empty-change and 146 content/referenced branches by domain, preserve independent proof and reconcile useful work through separate PRs. Do not cherry-pick old cockpit snapshots. Use `scripts/branch-retention-audit.ts` for current live evidence, followed by the bounded dry-run `scripts/branch-archive-prune.mjs` when its PR is merged.


## Reusable guarded cleanup command

This PR adds `scripts/branch-archive-prune.mjs` as a bounded operator utility (maximum 12 individually named branches per invocation). It is **dry-run only unless both** `--execute` and `--owner-approved` are supplied by a trusted operator with the required GitHub permissions. Flags are an explicit operator assertion, not a replacement for GitHub authentication.

```sh
# First generate a fresh current-main audit report.
node --experimental-strip-types scripts/branch-retention-audit.ts > branch-audit.json

# Inspect an eligible branch without modifying GitHub.
node scripts/branch-archive-prune.mjs --audit branch-audit.json --main-sha <exact-main-sha> --branch <exact-branch>

# After owner approval, individually archive and prune with protected atomic push:
node scripts/branch-archive-prune.mjs --audit branch-audit.json --main-sha <exact-main-sha> --branch <exact-branch> --archive-date 2026-10-10 --execute --owner-approved
```

Before every mutation the command independently confirms the remote main SHA, exact branch head, GitHub branch protection, open pull requests, active source references, and ancestry or zero-net-change proof. The remote push uses `--atomic` to create a branch-specific annotated archive tag and delete the source branch as one transaction, guarded by `--force-with-lease` pinned to the exact original SHA. It verifies tag peel/readback and branch absence afterward; failures stop processing.

The command does not run on a schedule or automatically choose branches, change main, deploy anything, widen bot authority, invoke models, or alter billing settings. It is not intended to bypass the existing ledger's Wave B or protected-ref holds.

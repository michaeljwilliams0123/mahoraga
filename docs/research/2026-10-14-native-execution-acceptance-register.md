# Native execution acceptance register — 2026-10-14

This is a **versioned evidence snapshot**, not a live status API or a substitute for fresh receipts. GitHub protected `main` is the source authority; Cloudflare is the production authority. Issue [#786](https://github.com/michaeljwilliams0123/mahoraga/issues/786) tracks cross-cutting work. Recheck exact SHAs before attributing any result to current production.

## Objective and minimum-dependency architecture

Deliver persistent owner-authorized observe → plan → execute → verify → learn cycles using the existing GitHub Actions, canonical Cloudflare Gateway/runtime/broker/workspace, and optional Windows worker. GitHub commits/issues/check-runs/artifacts hold source decisions, acceptance history, and nonsecret proof. Runtime durable state remains in the existing storage; **do not export private memories, credentials, user content, or mutable runtime state into GitHub**. Datadog, Hugging Face, and Composio are development/discovery tools only unless a separately accepted native capability is later implemented; no external connector is a new runtime trust root.

Do not represent this software as conscious or generally intelligent on the basis of its name, a successful deploy, or a capability registry entry. Claims about cognition, model execution, or self-improvement require actual observed operations with cost-class, objective lineage, output and receipt evidence.

## Evidence snapshot

- Source before Windows fix: `eead1acfb5ea3401a37a1209d18c7bee959e2c6e` — [PR #1095](https://github.com/michaeljwilliams0123/mahoraga/pull/1095) deployed first-party Access-protected Gateway sign-in. Exact-main [Cloudflare acceptance run #38660003274](https://github.com/michaeljwilliams0123/mahoraga/actions/runs/38660003274) passed for that SHA only.
- Windows candidate fix: [PR #1096](https://github.com/michaeljwilliams0123/mahoraga/pull/1096), tested head `1d1592f114ea5f9f68a66bde5e90cabd77cec473`, squash `f426ce3fb6fef43e1667786d7bfa1893c50ae4b9`. [Required Verify](https://github.com/michaeljwilliams0123/mahoraga/actions/runs/38662785757) passed Ubuntu and Windows. Source fix rejects unhealthy candidate status before both admission return branches. At this snapshot, **post-merge exact-main deployment acceptance was not yet established**.
- The Windows reference machine SD009WC7 had healthy 3.6.0 listeners at `127.0.0.1:4782` and `:4783`, but the scheduled `Mahoraga Runtime Convergence` task was **Disabled**, and its separate controller checkout was stale and dirty. Do not restart, replace, or enable it merely because the source fix merged.
- The last Cloudflare broker binding inspection found **zero downstream provider service bindings**. Gateway→runtime and runtime→broker exist; that is not proof of an actual live action-provider failover.
- GitHub Copilot cloud-agent configuration last read `require_actions_workflow_approval=true`. Copilot-triggered Sovereign Candidate Cycle runs returned `action_required` with zero jobs; existing scheduled owner workflows succeeded. The branch ruleset independently requires **zero approving reviewers**, strict passing `Verify (ubuntu-latest)` and `Verify (windows-latest)`, and squash merges. Do not conflate these two approval systems.
- Datadog observation: RUM unavailable in the connected organization, and log query returned no valid indexes. Do not infer missing errors or healthy real-user execution from missing telemetry. Keep Datadog optional.
- Hugging Face model metadata indicates `Qwen/Qwen3-0.6B` is Apache-2.0 licensed; this is a **research/model admission candidate** only, not a verified runtime-ready, benchmarked, or admitted backup.

## Acceptance matrix

| Capability | Current boundary | Required observed receipt or test | Tracking |
| --- | --- | --- | --- |
| Bot GitHub autonomy | Copilot-specific workflow approval may hold runs | A freshly Copilot-triggered run actually starts jobs without `action_required`; required checks remain intact | [#962](https://github.com/michaeljwilliams0123/mahoraga/issues/962) |
| Windows current-main execution | Installed controller disabled/stale; candidate-health source repair merged | Clean isolated controller with preserved state; reject unhealthy candidate; promote to production only with observed healthy exact-main SHA; simulate rollback and check incumbent recovery | [#948](https://github.com/michaeljwilliams0123/mahoraga/issues/948) |
| First-party desktop/mobile UI | Gateway sign-in flow fixed; live owner task unverified | Genuine owner-authenticated browser/iPhone task, nonempty persisted answer and receipt, reconnect, replay/retry without duplicate effect | [#973](https://github.com/michaeljwilliams0123/mahoraga/issues/973) |
| Action-provider failover | Broker downstream service bindings absent | Two independent same-capability zero-cost adapters, fresh attestation, bounded failure injection, exactly-once/idempotency and objective lineage receipt | [#1056](https://github.com/michaeljwilliams0123/mahoraga/issues/1056), [#547](https://github.com/michaeljwilliams0123/mahoraga/issues/547) |
| Relay recovery | Legacy WebSocket pairing references deleted `mahoraga-relay` | Native Gateway reconnection proven on every device; retire legacy pairing code only after no supported use depends on it | [#973](https://github.com/michaeljwilliams0123/mahoraga/issues/973) |
| GitHub → Cloudflare | Source changes invalidate earlier production evidence | Exact protected `main` checks, canonical deploy SHA, 100% traffic readback and authenticated paired workspace/runtime artifacts; do not redeploy merely to generate evidence | [#786](https://github.com/michaeljwilliams0123/mahoraga/issues/786) |

## Operating decisions and automation scope

1. Prefer existing first-party Workers service bindings over additional public endpoints, HTTP tunnels, hosted AI providers, or new plugin-based runtime lanes.
2. Existing owner grants permit reversible feature-branch builds, tests, PR creation and authorized protected squash integration. **Do not invent reviewer approval gates.** Actual platform approvals still apply until changed through a supported admin interface.
3. Keep hard-zero billing, least-privilege GitHub Actions secrets, immutable exact-head checks, Cloudflare Access identity, user stop/override, state/receipt idempotency, and rollback; increased autonomy does not imply disabling any of these.
4. Store only **sanitized** evidence in GitHub: objective/issue ID, tested SHA, accepted deployment SHA, required check conclusions, provider route name, timing, idempotency outcome, and redacted error classification. The encrypted model/user memory itself belongs in runtime-authorized storage, not public issues or logs.
5. Unavailability of Datadog or an external app must not prevent Mahoraga-native health tests. Never mark a missing observation as a passed health check.
6. For admission of a local model, inspect license and package format, confirm compatible device resources, run deterministic zero-metering benchmarks, then admit through existing model supply-chain gates. Listing a Hugging Face model is not admission.
7. For live provider activation, a separate dedicated narrowly scoped account token plus account hard-zero spend evidence is required; do not repurpose a deployment token to bypass missing provider prerequisites.

## Immediate next execution checkpoints

- Verify post-merge source `f426ce3fb6fef43e1667786d7bfa1893c50ae4b9` in both GitHub required jobs and canonical Cloudflare runtime/workspace acceptance before claiming production convergence.
- Stage and verify a clean Windows controller separately. Do not discard the dirty/stale controller checkout or stop the healthy incumbent without state/rollback proof.
- Test a real owner session on Gateway, then persist one complete task receipt (objective, route, answer, replay guard).
- Resolve GitHub Copilot approval using an actual supported admin setting or use already working native scheduled workflows; do not use undocumented permission bypasses.
- Admit one permitted no-spend read-only provider, then a distinct compatible backup, before asserting failover. Leave activation flags disabled until cost and credentials are accepted.

**Status rule:** A check is `PASSED` only after observing the exact current-source runtime or user-level receipt it claims. `NOT_TESTED`, `BLOCKED`, and `FAILED` are distinct; a merge and a dashboard status alone never upgrade them.

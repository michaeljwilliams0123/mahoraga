# Optional Linux runner and retirement of the old CI blocker

The host-side recovery requirement in [issue #571](https://github.com/michaeljwilliams0123/mahoraga/issues/571)
is retired as a prerequisite for protected verification and cloud availability.
Its proposed disposition is **not planned** for the old QEMU guest recovery
objective. This does not mean that recovery was implemented or that the guest is
currently healthy, removed or decommissioned. No host, registration, credential,
workflow or repository setting is changed by this documentation.

The issue preserves the September 17 guest panic, orphaned-job incident and
bounded manual reset evidence. That history explains the original requirement;
it does not establish the current CI topology. The source audit below uses
`286f40fceac9221d2ce149935327bc26f5c24c4a` and covers every workflow under
`.github/workflows/`. Runtime inventory and repository variable values were not
observed by this audit.

## Current source selection

| Workflows | Runner selection and dependency |
| --- | --- |
| [Verify](../.github/workflows/verify.yml) | The required `Verify (ubuntu-latest)` and `Verify (windows-latest)` matrix entries select GitHub-hosted Ubuntu and Windows. Its additional provenance job uses hosted Ubuntu. No self-hosted Linux selector. |
| [Cloudflare execution runtime](../.github/workflows/cloudflare-execution-runtime.yml), [lifecycle evaluation](../.github/workflows/cloudflare-lifecycle-evaluation.yml), [provider renewal](../.github/workflows/cloudflare-provider-renewal.yml), [workers management](../.github/workflows/cloudflare-workers-management.yml), [workspace candidate](../.github/workflows/cloudflare-workspace-candidate.yml), [zero-credit provisioning](../.github/workflows/provision-cloudflare-zero-credit.yml) | Every job selects `ubuntu-latest`; none requires the old guest. Deployment and live acceptance still require their own exact-source evidence. |
| [Autonomous integration](../.github/workflows/autonomous-integration.yml), [cloud task gateway](../.github/workflows/cloud-task-gateway.yml), [Codex cloud dispatch](../.github/workflows/codex-cloud-dispatch.yml), [contract validation](../.github/workflows/contract-validation.yml), [Destiny relay](../.github/workflows/destiny-codex-relay.yml), [release](../.github/workflows/release.yml), [workspace receiver](../.github/workflows/workspace-agent-receiver.yml), [workspace dispatch fabric](../.github/workflows/workspace-dispatch-fabric.yml) | Every job selects `ubuntu-latest`. These selections contain no self-hosted Linux or QEMU dependency. |
| [Steward](../.github/workflows/steward-two-hour-learning.yml) | Public `auto`/unset or `cloud` uses hosted Ubuntu. Private `auto`/unset or `local` requires the separate owner-enabled private Steward flag and selects self-hosted Windows x64 with `mahoraga,zero-credit`. Unsupported modes hold before runner allocation. |
| [Sovereign candidate and producer smoke](../.github/workflows/sovereign-eight-hour-cycle.yml) | Both select `self-hosted,windows,x64,mahoraga,zero-credit`, with no machine name or Linux requirement. `auto`/unset allows the existing local lane; explicit `local` requires private visibility. `cloud`, `hold` and unknown modes do not allocate these runners. |
| [Pages build and deploy](../.github/workflows/pages.yml) | Both default to hosted Ubuntu but accept `MAHORAGA_PAGES_RUNNER_LABELS`. An operator-selected override can introduce a local dependency. Its live value must be inspected independently before claiming Pages has no local dependency. It does not change protected Verify or Cloudflare runtime selection. |

No checked-in workflow selects the old guest by name or hard-codes a self-hosted
Linux requirement. Hosted runner selection is not a promise of free private
hosting or current job success; preserve existing billing and admission gates.

The repository-owned [execution route policy](../scripts/execution-route-policy.mjs)
and [switch](../scripts/execution-route-switch.mjs) govern **only Steward and the
two sovereign jobs**. `hold` prevents their subsequent allocations; it does not
cancel running jobs or disable other workflows. Missing selected Windows
capacity queues until an eligible runner returns. It does not select Linux or a
paid fallback. The switch changes one Actions variable after owner/admin and
fresh-main checks; it neither repairs nor enrolls a host. See the full
[routing matrix](EXECUTION-ROUTING-SWITCH.md).

## Migration and optional host maintenance

For current device capacity, use the existing
[portable device migration contract](PORTABLE-DEVICE-MIGRATION.md). Its optional
Linux/macOS enrollment does not make those machines eligible for Windows jobs.
Enrollment remains an explicit authorized local action under the existing
private-repository checks. Do not revive old Linux labels as a substitute for a
required Windows verification or device capability.

Before any separate runner-retirement operation, inspect the current GitHub
runner inventory, active/queued jobs and Actions variables without changing
them. In particular, check whether `MAHORAGA_PAGES_RUNNER_LABELS` intentionally
selects the old runner. Reconcile in-flight work by exact run/task identity and
receipts before changing a registration or service. This document does not
perform or authorize those host operations.

A future objective that explicitly retains this exact QEMU host should open a
separate maintenance task with fresh host identity and SSH/runner/monitor
observations. The original bounds still matter: detect actual failure, limit
reset attempts/backoff, preserve credentials and registration, verify recovery
and reconcile only objectively orphaned jobs. No recovery daemon, reset loop,
VM rebuild or credential rotation is required to close the obsolete cloud/CI
blocker. Do not report the old host as recovered without real host evidence.

Existing source checks:

```sh
node --test test/verification-workflow.test.mjs test/execution-route-switch.test.mjs test/zero-credit-boundary.test.mjs test/portable-device-migration.test.mjs test/cloudflare-execution-runtime-workflow.test.mjs
```

These check runner/route contracts, not guest health or live replacement-device
acceptance. Protected exact-head verification remains unchanged.

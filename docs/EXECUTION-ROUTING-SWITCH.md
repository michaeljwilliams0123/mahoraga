# Mahoraga durable execution routing switch

The **existing** Steward and sovereign GitHub workflows now read one repository-scoped
GitHub Actions variable, `MAHORAGA_EXECUTION_ROUTE`. This is a scheduling preference,
**not** a provider credential, security bypass, runner enrollment, authorization
decision, model admission, release action or paid cloud entitlement.

Because GitHub owns the variable, its value persists when an old PC is retired,
a replacement is enrolled, or the owner switches between devices. GitHub
protected `main` remains the source authority and Cloudflare remains a
**separate exact-main accepted execution runtime**. This route variable
changes only the two existing scheduled workflow job allocations.

## Owner switch from any trusted checkout

Install Node.js 24+, Git and GitHub CLI. Authenticate `gh` to the target
repository under the owner/admin account. From an up-to-date checkout of
protected `main`:

```bash
node scripts/execution-route-switch.mjs status
node scripts/execution-route-switch.mjs set auto
node scripts/execution-route-switch.mjs set auto --apply
```

`status` is read-only and reports current variables, visibility, matching
online runner eligibility and projected job assignments. `set <mode>` without
`--apply` is a **dry run**. `set <mode> --apply` checks GitHub admin
permission, exact-current-`main` checkout, route visibility and current
GitHub variables, then changes **only** the one repository variable and
immediately reads it back. No tokens are printed, stored in files or copied
between devices. The script does **not** automatically turn on the separate
private Steward authorization flag.

Or select the same mode directly through GitHub repository
**Settings → Secrets and variables → Actions → Variables** by setting
`MAHORAGA_EXECUTION_ROUTE` to exactly `auto`, `cloud`, `local`, or `hold`.
An unset variable is equivalent to `auto`. Unknown spellings hold both
workflows rather than purchasing a runner.

## Routing matrix

| Mode | Public repository: Steward | Private repository: Steward | Sovereign candidate / smoke |
| --- | --- | --- | --- |
| `auto` or unset | Free standard hosted Ubuntu | Local Windows x64 **only if** `MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED=true`; otherwise skip | Free hosted Ubuntu when public; local Windows zero-credit runner when private |
| `cloud` | Free standard hosted Ubuntu | Skip (no private hosted spending) | Skip; no cloud equivalent asserted |
| `local` | Skip (the CLI also refuses choosing public-local) | Local Windows x64 **only if** separately owner-enabled; otherwise skip | Local Windows x64 **only when private** |
| `hold` | Skip | Skip | Skip |
| Unknown | Skip | Skip | Skip |

**Local Windows job labels:** `self-hosted`, `Windows`, `X64`,
`mahoraga`, `zero-credit`. The Jobs still require a real online authorized
runner; when selected but offline, GitHub queues instead of silently paying
for hosted capacity. Avoid treating queueing as a completion or an online
worker health signal.

The pre-existing public-`auto` sovereign lane stays on a self-hosted
Windows runner with existing trusted-main and owner-only dispatch gates.
This change does not broaden its event permissions or expose a new
self-hosted runner to arbitrary fork PR code. New self-hosted runner enrollment
continues to **refuse public repositories**.

## Private Steward activation is separate

1. Keep the repository private and use
   `scripts/portable-runner-enroll.ps1` to enroll a replacement Windows
   device from an authorized trusted main checkout.
2. Confirm its unique identity and complete `mahoraga,zero-credit` labels
   in **GitHub Settings → Actions → Runners**.
3. If desired, the owner explicitly creates the repository Actions variable
   `MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED=true`.
4. `node scripts/execution-route-switch.mjs set local --apply` selects
   private-only local execution, or `set auto --apply` selects automatic
   policy based on visibility. Do not activate the private gate before
   verifying the new machine and its job admission.
5. `set hold --apply` immediately prevents subsequent scheduled jobs from
   obtaining runner capacity. It does not terminate a job already running;
   use the existing GitHub Actions cancellation controls if separately needed.

Both switches are repository-owned; no particular PC owns routing authority.
All existing verification and review/merge requirements remain intact.
No routine may weaken the hard-zero model-credit boundary, silently use
private hosted minutes, or run through a stale Cloudflare deployment.

## Evidence, recovery and limitations

- `node --test test/execution-route-switch.test.mjs test/zero-credit-boundary.test.mjs test/portable-device-migration.test.mjs`
  checks all public/private mode combinations, invalid/hold behavior and
  zero-credit runner assignments.
- Both protected Verify platforms and the exact-main Cloudflare acceptance
  receipt are still required for deployment claims. Static matrix tests
  are not evidence of a replacement hardware canary.
- If there is no eligible free worker, queue or hold; **never** downgrade
  verification or enable paid automation.
- Setting `cloud` while private is an intentional hold, not authorization
  to consume included/billable GitHub Actions minutes. Other workflows may
  have independent hosting/billing rules and are not changed here.
- Rollback to `auto` requires a fresh owner command, or revert this source
  PR under protected rules; an active in-progress job is never migrated
  mid-execution.

See [portable device migration](PORTABLE-DEVICE-MIGRATION.md).

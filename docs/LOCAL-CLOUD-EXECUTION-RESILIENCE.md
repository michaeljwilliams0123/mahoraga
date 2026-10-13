# Local and Cloud Execution Resilience

These scripts are **support tooling**, not a new execution lane or authority root. GitHub protected `main` remains source authority. Windows stays on the approved `3.6.0` rollback; the Cloudflare runtime may independently run `7.0.0-alpha.2` after exact-SHA acceptance.

## SD00 and replacement-device installation

1. Prepare a clean, immutable worktree at `%USERPROFILE%\.mahoraga-runtime\windows-production-3.6.0` pinned to verified rollback commit `e8cbdb4` (tag `v3.6.0-beta.15`). Do not start an alpha control plane on Windows.
2. Install the pinned Node 24 executable expected by the rollback production launcher. Validate this checkout's `scripts/start-production.ps1` in a local session; its control API stays on `127.0.0.1:4782`.
3. Copy `scripts/start-stable-candidate.ts`, `scripts/start-stable-candidate.ps1`, `scripts/windows-local-recovery.ps1`, `scripts/execution-surface-smoke.ts`, and `scripts/execution-surface-monitor.ps1` into `%USERPROFILE%\.mahoraga-runtime\tools`. Keep the watchdog file name `windows-local-recovery.ps1` or adjust the scheduled-task invocation. Both scripts use a dedicated candidate state tree under `state/candidate-stable-4783`, not the production database.
4. Run the candidate launcher and the watchdog in an interactive PowerShell session with process-scoped script execution permission. Install per-user scheduled tasks (logon launchers, five-minute watchdog, 15-minute surface monitor) with `MultipleInstances=IgnoreNew`, limited privileges, and bounded execution time. Observe `LastTaskResult=0` rather than merely `Ready`.
5. Start with audit-only watchdog checks and test a candidate-only recovery by stopping a process **only after verifying that its PID and command line belong to the isolated candidate**. Do not stop a production process just to test recovery.

The existing SD00 scheduler uses `local-recovery-watchdog.ps1`, equivalent to the versioned `windows-local-recovery.ps1`. On other machines, use the versioned file consistently when registering scheduled tasks.

## Acceptance levels

Run `node scripts/execution-surface-smoke.ts --sha <exact-main-sha>` to check both local HTTP health routes, Cloudflare workspace metadata, GitHub Pages static availability, and unauthenticated Cloudflare Access protection. The probe does not submit cloud actions or authenticate as the owner. The live-surface monitor resolves GitHub `main` before each run; a mismatched or unreachable source fails closed.

* `127.0.0.1:4782`: production rollback health and actual `system.health` receipt.
* `127.0.0.1:4783`: independent rollback health and actual `system.health` receipt.
* Public workspace: real browser rendering and exact commit parity, **not** proof of execution.
* Protected Owner Gateway: unauthenticated redirect to Cloudflare Access is **protection**, **not** an authenticated transaction.
* Cloud runtime: separately require current exact-SHA `cloudflare-execution-runtime-acceptance` evidence for real provider execution, replay safety, and hard-zero billing.
* Physical phone: requires an actual signed-in mobile browser transaction and verified returned receipt; desktop device emulation cannot substitute for it.
* Optional universal broker provider: `unbound` is a truthful status until a registered, freshly attested provider is configured. Do not auto-create tokens, expose a raw API, or claim it is routable merely because the broker Worker is deployed.

Never expose ports 4782/4783 directly to the internet, bypass Access, buy model credits, or treat a login page as API success. These checks are informational and do not weaken the canonical authority gate.

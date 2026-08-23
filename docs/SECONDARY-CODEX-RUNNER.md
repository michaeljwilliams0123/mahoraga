# Secondary Codex runner

The runner turns the GitHub coordination mailbox into a bounded, outbound-only
execution lane. It polls assignments from Mahoraga `main`, maps each `taskArea`
to one explicitly registered project, launches that Windows account's locally
authenticated Codex CLI, validates actual changed paths, and pushes only the
assignment's `secondary/<assignment-id>` branch.

It is not limited to review or QA. An assignment may request implementation,
research within repository sources, tests, documentation, refactoring, or
analysis as long as the expected work and allowed paths are explicit.

## Security and privacy boundary

- The secondary machine keeps its own Codex and GitHub authentication. No token
  is stored in the runner configuration or committed to Git.
- Codex runs non-interactively with `--sandbox workspace-write --ephemeral` in
  an isolated clone. The runner never uses an unrestricted sandbox.
- The prompt contains only the validated assignment record. Chat transcripts,
  personal files, browser history, credentials, and unrelated context are
  prohibited.
- Model output is held only in process memory and discarded. Durable records
  contain only task state, commit identifiers, changed paths, and verification.
- The runner binds the validated assignment record into the target return branch
  before Codex runs, so the later result can always be verified against the exact
  task metadata even when the target is not the Mahoraga repository.
- Actual Git changes are checked against both the assignment allowlist and the
  secondary machine's narrower-or-equal project allowlist before any push.
- Retries are bounded, overlapping runs are suppressed by Task Scheduler, and
  only `secondary/<assignment-id>` may be pushed.

## One-time activation on the secondary PC

Clone or update Mahoraga, open PowerShell in the checkout, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-secondary-codex-runner.ps1
```

The installer verifies GitHub access and the official `codex` command, writes a
local ignored configuration, registers a limited per-user scheduled task, and
starts the first poll. It does not require an inbound listener or public tunnel.

The current connectivity assignment is
`sec-ae4135e2-a201-4467-b59e-8d16ed9e784a`; a healthy runner returns
`secondary/sec-ae4135e2-a201-4467-b59e-8d16ed9e784a`.

## Register another project

Each project gets a stable task-area mapping. The local checkout is used only
for authenticated remote checks; every execution uses a fresh isolated clone.

```powershell
node .\scripts\secondary-codex-runner.mjs configure `
  --task-area "side-project-alpha" `
  --repository "https://github.com/OWNER/REPOSITORY.git" `
  --checkout "C:\Projects\REPOSITORY" `
  --allowed-paths "src,test,docs" `
  --default-branch "main" `
  --max-runtime-minutes "90"
```

Main Codex then creates an assignment on Mahoraga `main` with the same
`--task-area`. For a side project, `--base-commit` must identify a commit in
that target repository, not a Mahoraga commit. The runner adds the assignment
and result JSON files as protocol-only commits around the implementation commit;
merge or cherry-pick the implementation according to that project's policy.

Run an immediate poll or inspect bounded status with:

```powershell
node .\scripts\secondary-codex-runner.mjs run-once
node .\scripts\secondary-codex-runner.mjs status
```

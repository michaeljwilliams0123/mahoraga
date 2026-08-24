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
- Codex must report `Logged in using ChatGPT`. Its refreshable session is kept
  by Windows Credential Manager through the Codex `keyring` credential store.
  API-key environment variables are removed from runner executions so they
  cannot silently switch the work to separately billed API usage.
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
- A local single-flight lock suppresses overlapping scheduled and manual runs.
  Only `secondary/<assignment-id>` may be pushed.
- Every poll records a bounded timestamp and outcome in ignored local runtime
  state. The Control Center Coordination view exposes only that sanitized
  heartbeat, never the configured checkout path or a credential.
- Idle polls do not invoke or health-check Codex. Each execution uses a unique
  isolated worktree path, so an interrupted clone cannot poison a later attempt.
  A failed first attempt remains paused until an operator explicitly re-arms it;
  a crash also leaves a durable `running` marker that requires an explicit retry.
  The configured maximum-attempt ceiling applies to all manual retries.

## One-time activation on the secondary PC

Clone or update Mahoraga, open PowerShell in the checkout, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\connect-chatgpt-codex.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\install-secondary-codex-runner.ps1
```

The first command starts the official one-time ChatGPT device sign-in when
needed, selects Windows keyring storage, and verifies GitHub access without
printing a credential. Do not copy browser cookies, ChatGPT web tokens, or
Codex credential files between machines. The installer then requires that
ChatGPT subscription status, writes a local ignored configuration, registers a
limited per-user scheduled task, and starts the first poll. It does not require
an inbound listener or public tunnel.

Completed or rejected bootstrap assignment IDs are historical evidence. Do not
re-arm them. New work must use a new immutable assignment ID.

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
  --max-runtime-minutes "90" `
  --max-attempts "3"
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
node .\scripts\secondary-codex-runner.mjs retry --id "sec-..."
```

`retry` is the explicit approval boundary for another model attempt. It fails
closed if the assignment is unknown, has not failed, is outside a registered
task area, already has a remote return branch, or has reached `maxAttempts`. It
preserves the attempt counter and re-arms only the selected assignment; the
immutable GitHub assignment is unchanged.

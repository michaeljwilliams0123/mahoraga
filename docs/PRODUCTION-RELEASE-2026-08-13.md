# Mahoraga 3.2 production release — 2026-08-13

## Deployment

- Runtime: Mahoraga `3.2.0`
- Control Center: `4.1.0` at `http://127.0.0.1:4782`
- Branch: `agent/mahoraga-3-1-production-workers`
- Commits: `9f6c9d1`, `32cf541`, `c68fd60`, `0e14247`
- Rollback: stop production, switch to the preceding commit, refresh the release
  baseline, then run `scripts/start-production.ps1`.

## Live acceptance

- Browser health: `mhg-aaa8bfdd-cfe7-4ccc-941f-1c9291b63615`, completed
  once and verified by `browser:3.1.0`.
- Browser Control Center smoke: `mhg-27271d34-9991-4596-bcb6-8b9128417d5d`,
  completed once after verifying the rendered title.
- Repository status: `mhg-f19d379d-b10b-4e02-937f-4373be4db422`, completed once.
- Repository history: `mhg-198c4533-9265-4973-b670-199e141207ca`, completed once.
- Repository verification: `mhg-844c339e-363a-4f03-a4cd-8229f49a3485`,
  completed once with `12/12` tests and verifier `repository:3.1.0`.

## Crash recovered during rollout

The first Repository verification produced a valid multi-line test receipt. The
legacy single-line database validator rejected it inside the process event
callback, terminating the supervisor. Release `c68fd60` normalizes all worker
receipts and adds an exception boundary around worker messages. A regression test
now proves receipts are single-line and bounded. The production replay completed
and the Control Center remained healthy.

## Microsoft queue target discovery

- Environment: moved to ignored runtime configuration.
- Environment ID: moved to ignored runtime configuration.
- URL: moved to ignored runtime configuration.
- Signed-in identity: intentionally omitted from current repository records and receipts.
- Proposed unmanaged solution: `MahoragaPlatform`
- State: the private environment was confirmed during the historical rollout;
  unattended authentication and activation remain separate user-controlled steps.

## Persistent discourse

Assignment threads and messages are now durable SQLite records. Task envelopes
carry their conversation history to workers. Workers can request information,
move the task to `waiting_for_user`, and resume the same task after the user
responds. The Control Center exposes thread creation and message continuation.

## Microsoft execution plane implementation

- The official Microsoft Dataverse Python SDK `1.0.0` is installed in the
  pinned workspace runtime.
- The official Microsoft Dataverse CLI `1.0.63` is installed locally under
  `tools/dataverse-cli`; no system-wide Node installation is required.
- `scripts/deploy_dataverse_queue.py` creates or reuses the confirmed publisher,
  `MahoragaPlatform` solution, queue table, and correlation alternate key.
- `scripts/microsoft_queue_worker.py` implements one outbound-only poll, claim,
  local dispatch, and result-recording cycle.
- The process-isolated `microsoft-queue` worker is registered but disabled until
  the permanent publisher prefix and reusable Microsoft authentication cache are
  confirmed.
- No public write MCP, inbound Windows listener, reverse tunnel, or repository
  secret was introduced.

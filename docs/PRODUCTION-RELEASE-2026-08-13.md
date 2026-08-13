# Mahoraga 3.1 production release — 2026-08-13

## Deployment

- Runtime: Mahoraga `3.1.0`
- Control Center: `4.0.0` at `http://127.0.0.1:4782`
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

- Environment: `Vaco (default) (Upgrade)`
- Environment ID: `Default-120aeae9-286f-438a-bbf3-de3ab96fcf5d`
- URL: `https://org9aade5b6.crm.dynamics.com/`
- Signed-in user: `mike.williams@highspring.com`
- Proposed unmanaged solution: `MahoragaPlatform`
- State: awaiting explicit environment and solution confirmation before the first
  Dataverse mutation.

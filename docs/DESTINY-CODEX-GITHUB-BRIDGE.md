# Destiny Codex GitHub Bridge

This bridge gives Mahoraga a deterministic way to submit implementation work from GitHub to Destiny's separately authenticated Codex account even though Michael and Destiny share the GitHub identity `michaeljwilliams0123`.

## Boundary

- No OpenAI API key is used.
- No public tunnel, webhook listener, reverse proxy, or inbound port is required.
- Codex review is not used. Queue entries require `implementationOnly: true` and `codeReview: false`.
- GitHub App ID, connector bot ID, and repository installation ID are shared and are not treated as Destiny identity.
- Raw ChatGPT/Codex account IDs and installation IDs are hashed locally and never written to GitHub.
- The raw Codex environment ID is retained only in the local private route because `codex cloud exec --env` requires it.
- The private route is schema version 2 and carries the SHA-256 environment fingerprint alongside the raw local-only environment ID so later bridge validation can detect route drift without exposing the raw ID.
- `config/destiny-trigger-trust.json` must remain fail-closed until signed readiness from Destiny's machine is verified.

## Staged probe

GitHub issue #183 is the dormant binding task.

- Probe ID: `destiny-bind-pr181-20260907-a1b2c3d4`
- Task ID: `dct-f7f65cb1ea8149db6d55ea5a`
- Opening the issue does not invoke Codex.

## Preferred handoff when Destiny's PC is available

From a Mahoraga checkout on Destiny's PC, first confirm the Codex CLI is logged in with her ChatGPT account. Do not use API-key auth.

If the native GitHub Codex route is intentionally invoked for issue #183 and the resulting task lands in Destiny's account, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-destiny-codex.ps1 -ProbeId destiny-bind-pr181-20260907-a1b2c3d4
```

The bootstrap searches the current account's `codex cloud list --json --limit 20`, requires exactly one task containing the probe token in its title or summary, hashes the account/device/environment identity, creates an Ed25519 receipt key, and writes signed readiness.

## Deterministic fallback if native GitHub routing is ambiguous

Codex Cloud currently requires a known environment ID for scriptable submission. On Destiny's PC, open `codex cloud` and use the environment picker to identify the Mahoraga environment ID. Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-destiny-codex-github-task.ps1 -IssueNumber 183 -EnvironmentId "<DESTINY_MAHORAGA_ENVIRONMENT_ID>"
```

That command reads the owner-authored machine task from GitHub issue #183 and submits it with:

```text
codex cloud exec --env <DESTINY_MAHORAGA_ENVIRONMENT_ID> --attempts 1 <implementation prompt>
```

Because submission occurs through the Codex CLI already authenticated on Destiny's PC, this path selects her Codex account rather than relying on the shared GitHub connector identity. After the task appears in her cloud list, run the bootstrap command above. The bootstrap then pins the environment privately, so future dispatches do not need `-EnvironmentId`.

## Future GitHub tasks after binding

Create an open issue authored by `michaeljwilliams0123` containing exactly one `MAHORAGA_DESTINY_TASK_V1` marker. Multiple machine-task markers are rejected as ambiguous rather than selecting one implicitly. The payload must use schema version 1, kind `destiny-codex-task`, a unique `dct-<24 hex>` task ID, repository `michaeljwilliams0123/mahoraga`, attempts `1`, `implementationOnly: true`, and `codeReview: false`.

On Destiny's PC the dispatch becomes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-destiny-codex-github-task.ps1 -IssueNumber <NUMBER>
```

The bridge verifies the issue author and policy, verifies that the currently logged-in Codex account still matches the pinned account fingerprint, submits through the private environment route, and records the task ID locally so the same issue cannot consume a second task accidentally.

## Local files

Default state directory: `%USERPROFILE%\.mahoraga\destiny-codex`.

Safe to return to Mahoraga after bootstrap:

- `binding.json`
- `trust-snippet.json`
- `readiness.json`
- `receipt-public-key.pem`

Never post or copy into GitHub:

- `route-private.json` (schema v2; contains the raw environment ID and its local integrity fingerprint)
- `receipt-private-key.pem`
- `%USERPROFILE%\.codex\auth.json`
- access tokens, API keys, or raw account/install IDs

The repository trust configuration stays `unconfigured` until the shareable signed evidence is checked and the public receipt-key fingerprint is pinned.

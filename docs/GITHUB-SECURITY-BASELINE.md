# GitHub security baseline

This baseline covers GitHub controls around the public Mahoraga coordination
repository. It does not change repository visibility. Visibility remains a
user-controlled setting and must never be changed by a workflow or controller
without a new explicit instruction.

## Repository-enforced controls

- `CODEOWNERS` identifies the repository owner for every path.
- Dependabot checks the official GitHub Actions and the Dataverse CLI dependency
  each week. Runtime dependency versions remain exact and lockfile-backed.
- `npm run github:audit` rejects tracked runtime secrets, personal email
  addresses, non-deterministic dependency specifications, workflows without an
  explicit permission block, non-GitHub Action owners, `pull_request_target`,
  non-loopback runtime configuration, and missing governance files.
- The pre-push hook rejects deletion or non-fast-forward updates to `main` and
  the preserved production branch.
- The public-repository privacy checklist remains mandatory for pull requests.

## Live GitHub controls

The following account-level settings were API-verified on 2026-08-24. Re-verify
them after every ownership, plan, or visibility change:

1. Secret scanning, push protection, Dependabot alerts/security updates, private
   vulnerability reporting, and CodeQL default setup are enabled.
2. Actions permits GitHub-owned actions only. Current workflows use only
   `actions/checkout`, `actions/setup-node`, and `actions/github-script`.
3. `main` blocks deletion and force pushes, including administrator bypass, but
   does not require pull requests or status checks. Normal fast-forward updates
   from the owner-gated Chromebook control workflow remain compatible.
4. The registered workflow whose path no longer exists on `main` is disabled.
5. The default workflow token remains read-only and no repository secret stores
   Codex, ChatGPT, browser-session, or local Windows runtime authentication.

## Remaining workflow hardening

GitHub Actions references currently use GitHub-owned major-version tags. Moving
them to immutable commit SHAs requires a workflow-authorized GitHub credential
and a verified cross-platform run. Until that migration is complete, the live
Actions allowlist should remain restricted to GitHub-owned actions.

The Chromebook control workflow still fast-forwards bounded task records to
`main`. Full required-status-check protection depends on first changing that
workflow to publish a scoped branch and pull request. The current history-only
protection deliberately preserves that outbound control path.

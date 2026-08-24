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

## Live GitHub controls to enforce

The following settings are account-level controls and cannot be guaranteed by a
commit. Verify them after every ownership, plan, or visibility change:

1. Enable secret scanning, push protection, Dependabot alerts and security
   updates, private vulnerability reporting, and CodeQL default setup.
2. Restrict Actions to GitHub-owned actions. Current workflows use only
   `actions/checkout`, `actions/setup-node`, and `actions/github-script`.
3. Protect `main` against deletion and force pushes. Do not require pull requests
   until the Chromebook control workflow is migrated from a direct fast-forward
   push to a branch-and-pull-request return path.
4. Disable any registered workflow whose path no longer exists on `main`.
5. Keep the default workflow token read-only and do not add repository secrets
   for Codex, ChatGPT, browser sessions, or the local Windows runtime.

## Remaining workflow hardening

GitHub Actions references currently use GitHub-owned major-version tags. Moving
them to immutable commit SHAs requires a workflow-authorized GitHub credential
and a verified cross-platform run. Until that migration is complete, the live
Actions allowlist should remain restricted to GitHub-owned actions.

The Chromebook control workflow still fast-forwards bounded task records to
`main`. Full required-status-check protection depends on first changing that
workflow to publish a scoped branch and pull request. Do not enable a setting
that silently disables this outbound control path.

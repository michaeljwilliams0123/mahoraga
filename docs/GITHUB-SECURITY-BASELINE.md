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
- `node scripts/github-live-protection.mjs` attests live `main` rulesets against
  the exact-head Verify contract and fails closed when protection is absent or
  when extra required checks (including observational Vercel) are present.

## Live GitHub controls

Live `main` protection is attested by `node scripts/github-live-protection.mjs`
against `config/main-protection.contract.json`. Repository-only `github:audit`
success is not proof of live settings.

Ruleset `22327855` (`Protect main — exact-head Verify`) is the live GitHub-native
gate. It blocks deletion and force-push, requires a pull request, and requires
exact-head success of:

- `Verify (ubuntu-latest)`
- `Verify (windows-latest)`

`Verify unified Vercel workspace` may run. It must not gate PR completion.
The live-protection evaluator fails closed if that job, or any other extra
context, is required.

No actor may bypass the ruleset. Autonomous integration still squash-merges
eligible PRs through the GitHub pull-request merge API after those checks pass.

Account-level controls last verified 2026-08-24 and re-checked 2026-09-05:

1. Secret scanning, push protection, Dependabot alerts/security updates, private
   vulnerability reporting, and CodeQL default setup are enabled.
2. Actions permits GitHub-owned actions only. Current workflows use only
   `actions/checkout`, `actions/setup-node`, and `actions/github-script`.
3. The default workflow token remains read-only except on the write-capable
   Autonomous Integration merge job, and no repository secret stores Codex,
   ChatGPT, browser-session, or local Windows runtime authentication.
4. The Chromebook fast-forward control path is retired. Exact-head required
   checks are now the live merge gate.

## Incumbent trust epoch

`state/incumbent-trust-epoch.json` is the canonical incumbent generation. Trusted
`main` is the only source. Autonomous integration loads that file from the
`main` checkout and binds any candidate sovereign receipt from
`coordination/sovereign-receipts/`. A candidate cannot supply or overwrite the
incumbent epoch. Missing live protection, missing epoch, or incomplete proofs
fail closed.

## Workflow hardening

Every GitHub Action reference is pinned to an immutable, signature-verified
commit SHA with its major version retained in a comment for reviewability.
Dependabot remains responsible for proposing future GitHub Actions updates, and
the live Actions allowlist remains restricted to GitHub-owned actions.


# GitHub security baseline

This baseline covers GitHub controls around the Mahoraga repository. It does
not change repository visibility. Visibility remains a
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
success is not proof of live settings. Because the repository is public, missing
live ruleset evidence now fails closed instead of entering private-plan advisory
mode.

Ruleset `22502690` (`Protect main - exact-head Verify`) is active. In the
2026-10-11 live snapshot it has **two configured bypass actors**: a
`RepositoryRole` actor (`pull_request` bypass mode) and an `Integration`
actor (`always` bypass mode). These settings must be reconciled with the
intended owner-approval policy; configuration does not prove an actual bypass.
It requires strict, exact-head success for exactly these contexts:

- `Verify (ubuntu-latest)`
- `Verify (windows-latest)`

Vercel is retired and non-routable. A Vercel provider or deployment status is
not a PR completion gate, runtime fallback, or authority signal. The
live-protection evaluator fails closed if any context beyond the two required
Verify checks is configured as required.

The live protection evaluator attests configured required checks, PR rules,
deletion and force-push restrictions. It reports observed bypass-actor count,
bypass modes, approving-review count, and code-owner-review requirement as
**diagnostic evidence only**. It does not enforce independent human approval,
zero bypass actors, or owner authorization. The 2026-10-11 live ruleset requires
zero approving reviews and does not require code-owner review. A green Verify
result is not independent approval or permission to bypass protected landing.
Autonomous integration must preserve both exact-head checks, freshness, and
separate owner authorization. Never synthesize or substitute checks.

Account-level controls last verified 2026-08-24 and re-checked 2026-09-21:

1. Secret scanning, push protection, Dependabot alerts/security updates, private
   vulnerability reporting, and CodeQL default setup are enabled.
2. Actions permits GitHub-owned actions only, requires full-length commit SHA
   pinning, and rejects unapproved workflow event classes before workflow YAML
   can broaden execution. Current workflows use only `actions/checkout`,
   `actions/setup-node`, and `actions/github-script`.
3. The default workflow token remains read-only except on explicitly scoped
   write-capable workflow jobs, Actions cannot approve pull requests, and no
   repository secret stores Codex, ChatGPT, browser-session, or local Windows
   runtime authentication.
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

# Mahoraga Maintainers

GitHub is the authoritative source of truth for Mahoraga code, review history, and release-candidate evidence.

## Current maintainer

- `@michaeljwilliams0123` — repository owner and authoritative maintainer for runtime, cloud, browser, repository automation, release/recovery artifacts, governance, and documentation.

## Review areas

The area map in `.github/CODEOWNERS` makes review intent explicit. It does not delegate or broaden authority: all listed areas currently resolve to the same repository owner.

- `.github/` — CI, workflow, issue/PR lifecycle, repository policy artifacts.
- `src/` — supervisor/runtime/workers/routing/policy/provider integration.
- `scripts/` — maintenance, dispatch, validation, release-baseline tooling.
- `test/` — deterministic validation and regression coverage.
- `web/` and `cloud/` — Control Center and cloud workspace surfaces.
- `relay/` — bounded relay implementation and packaging.
- `docs/` — current architecture, operating, and integration documentation.
- `state/release-baseline/` — recovery baseline copies of essential release files.

## Merge and release boundaries

Routine branch work, tests, documentation, evidence preparation, and candidate hardening may proceed autonomously within repository policy. Protected merges, releases/tags, production activation, destructive history or branch operations, protected governance changes, and external exposure remain owner-authorized actions.

For protected-path changes, merge only when the exact candidate head has passed the repository verification workflow on both Ubuntu and Windows. A stale or superseded green run is not sufficient.

## Release-baseline lifecycle

`npm run baseline:verify` compares every `ESSENTIAL_FILES` source artifact against its recovery copy byte-for-byte and fails closed on missing, empty, or drifted files. Intentional changes to essential release files must update the corresponding recovery baseline in the same reviewed change. `npm run baseline:refresh` remains an explicit maintenance operation; it is not an autonomous production activation mechanism.

## GitLab assurance boundary

GitLab is an assurance plane, not a second source of truth. It must remain read-only relative to GitHub and must not receive GitHub write credentials. Cross-ledger assurance must fail closed unless repository identity, branch, exact SHA, workflow version, command identifiers, and conclusions can be matched. A runner or account-scheduling failure must not be bypassed by weakening the merge gate.

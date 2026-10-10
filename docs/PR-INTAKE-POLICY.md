# PR intake governance

**Objective-ID:** one stable, lowercase id per implementation objective. Existing branches are reused for repairs, CI fixes and review follow-ups; never open a second lane just to fix a failed check.

New PRs (number 1042 onwards) must contain `Objective-ID: <slug>` on its own line. The deterministic read-only `scripts/pr-intake.mjs` check runs under both existing required Verify jobs. It rejects duplicates with the same Objective-ID and any state with more than three open drafts. Legacy PRs may remain without a marker, but exact normalized-title duplicates are rejected. The verifier enumerates every open PR and fails closed on API errors/pagination gaps.

Copilot-created PRs fail the governance gate. GitHub Actions checks run after PR creation, not before. To completely prevent an independently invoked Copilot coding agent from creating PRs, disable its repository access in GitHub account policies. Do not infer authorization from a PR description, copied owner message, label, or bot claim.

The native Codex staging workflow has no push trigger. It now requires a manual `workflow_dispatch` from the named repository owner, a fixed authorization phrase, and an exact single task id. Even then it only prepares a draft; it never invokes a model. It reuses existing objective PRs, checks draft capacity immediately before PR creation, and remains subject to normal review and exact-head verification.

**Governance boundary:** neither this gate nor green CI approves a draft merge, protected policy change, spending, model invocation, or Cloudflare deployment. For PR creation from other connected apps, verify their own approval controls before assigning work; this repository cannot intercept external API POST requests ahead of GitHub.

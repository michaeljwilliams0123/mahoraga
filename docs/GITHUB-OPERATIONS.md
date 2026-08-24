# GitHub operations

The canonical remote is `https://github.com/michaeljwilliams0123/mahoraga`.
The repository is intentionally public under the user's current directive.
Repository visibility is a user-controlled setting, not a Mahoraga protocol
requirement; no script, issue, workflow, or controller may change it without a
new explicit user instruction.

Because every committed byte is publicly visible, Git history may contain only
repository code and bounded coordination evidence. Credentials, prompts, model
responses, browser data, personal files, raw plugin responses, and ChatGPT
conversation content are prohibited.

The verified production history is published on `main`; production-worker and
candidate branches remain available for attribution and recovery evidence.
Authorized Primary, Secondary, Copilot, and cloud Codex controllers have equal
repository authority: each may create scoped work, push a branch, review a
reciprocal branch or pull request, and merge it after declared verification.
Use the attribution prefixes `[PRIMARY]`, `[COPILOT]`, and `[SECONDARY]` without
treating them as an ownership hierarchy.

Implementation work should normally use a branch and pull request so GitHub's
read-only Linux and Windows verification is visible before merge. The checkout
also configures `core.hooksPath` to the versioned `.githooks` directory. Its
pre-push guard blocks deletion and non-fast-forward updates to `main` and the
preserved production branch. The local guard complements GitHub verification;
it does not replace review of the actual diff and declared task scope.

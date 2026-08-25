# GitHub operations

The canonical remote is `https://github.com/michaeljwilliams0123/mahoraga`.
The repository is intentionally private under the user's current directive.
Repository visibility is a user-controlled setting, not a Mahoraga protocol
requirement; no script, issue, workflow, or controller may change it without a
new explicit user instruction.

Although the current remote is private, committed bytes can later become visible
through a visibility change, collaborator access, or a returned branch. Git
history may contain only repository code and bounded coordination evidence. Credentials, prompts, model
responses, browser data, personal files, raw plugin responses, and ChatGPT
conversation content are prohibited.

The verified production history is published on `main`; production-worker and
candidate branches remain available for attribution and recovery evidence.
Local and cloud Primary Codex have equal authority over architecture, assignment
creation, implementation, validation, review, and integration. Updating `main`
requires one primary to hold the repository's single bounded integration lease;
path overlap is reported and coordinated, not automatically rejected. The lease
does not auto-merge or bypass verification. Secondary Codex may implement bounded assignments and
push only `secondary/<assignment-id>`; Copilot and cloud Codex return branches
or pull requests for Primary review. Use the attribution prefixes `[PRIMARY]`,
`[COPILOT]`, and `[SECONDARY]` while preserving those authority boundaries.

Implementation work should normally use a branch and pull request so GitHub's
read-only Linux and Windows verification is visible before merge. The checkout
also configures `core.hooksPath` to the versioned `.githooks` directory. Its
pre-push guard blocks deletion and non-fast-forward updates to `main` and the
preserved production branch. The local guard complements GitHub verification;
it does not replace review of the actual diff and declared task scope.

The Cloud Task Gateway accepts only exact issue commands authored by the
repository owner. A workspace issue, label, edit, attachment, or third-party
comment cannot independently invoke a model. The gateway writes only validated,
idempotent coordination metadata to `main`; the existing cloud dispatcher or
outbound Windows poller performs the selected execution later.

Neither primary may activate a core update: that decision belongs only to the
user. The release workflow is also owner-started. It builds only from authoritative
`main`, runs full verification, emits a strict update manifest, and records
provenance. Releases are staging artifacts, not an automatic core activation
mechanism.

Run `npm run github:audit` before publishing a branch. The deterministic audit
checks the candidate repository state without reading GitHub credentials or
emitting file contents. Account-level controls and their compatibility with the
outbound control workflow are documented in
[`GITHUB-SECURITY-BASELINE.md`](GITHUB-SECURITY-BASELINE.md).

# Native GitHub work-item commands

The owner-authenticated chat can execute bounded GitHub App mutations even when the
language-model route is unavailable. The browser only prepares explicit commands;
the paired Cloudflare runtime validates them, mints repository-scoped installation
tokens, performs the write, verifies the returned identity and persists the receipt.

Supported commands:

- `/repo pr create` creates a draft from exact `main`; file entries accept either
  `{"path":"...","content":"..."}` or `{"path":"...","delete":true}`.
- `/repo pr update` edits or closes/reopens an exact-head pull request.
- `/repo issue create` and `/repo issue update` create, edit, close or reopen issues.
- `/repo comment create` and `/repo comment delete` bind the comment to an
  explicitly typed issue or pull request before mutation.
- `/repo branch delete` deletes only a `mahoraga/*` branch at an expected head SHA.
- Existing PR checks, workflow dispatch and exact-head squash merge remain separate.

GitHub's REST issues API represents removal by closing an issue; permanent issue
deletion is not exposed by this lane. Pull requests are likewise closed rather than
deleted. Tracked-file, comment and bounded branch deletion are explicit operations.

Issue operations request `issues:write`; pull-request operations request
`pull_requests:write`; branch and draft-tree operations request `contents:write`.
A missing installation permission fails before mutation. The UI does not store an
installation token or infer authority from assistant prose.

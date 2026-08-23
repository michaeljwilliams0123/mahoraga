# GitHub operations

The canonical private remote is `https://github.com/michaeljwilliams0123/mahoraga`.
The verified production history is published on `main`; the production-worker
and original 3.3 candidate branches remain available for attribution and
recovery evidence.

Ordinary development is direct to `main` with commit prefixes `[PRIMARY]`,
`[COPILOT]`, and `[SECONDARY]`. The checkout configures `core.hooksPath` to the
versioned `.githooks` directory. Its pre-push guard blocks deletion and
non-fast-forward updates to `main` and the preserved production branch.

GitHub rejected a server-side ruleset because private-repository rules require
an upgraded account plan. The repository remains private as required. The local
guard is the active minimum protection; it is not a substitute for server-side
protection on other machines. If the GitHub plan later supports private branch
rules, add deletion and non-fast-forward rules for `main` without adding a pull
request requirement.

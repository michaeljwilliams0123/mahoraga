# Mahoraga Cloud Workspace

The Mahoraga Cloud Workspace is a credential-free static interface deployed by
GitHub Pages. It is a cloud launcher, Skills catalog, approval queue, release
dashboard, and repository-status surface—not a public proxy to Windows.

## Security model

- The page performs unauthenticated, read-only requests to GitHub's public REST
  API when repository visibility permits it.
- The page never requests a GitHub token, uses no browser storage, and sends no
  prompt or attachment to Mahoraga.
- Authenticated writes and file uploads happen on `github.com` through the issue
  form under the user's existing GitHub session.
- Task text is copied to the clipboard for the handoff instead of being placed
  in a query string or retained by the page.
- The localhost runtime remains bound to `127.0.0.1`; no tunnel, public listener,
  browser control, or direct desktop mutation is introduced.
- GitHub attachments inherit repository visibility. The workspace accepts only
  repository-safe references and expressly rejects chats, credentials, personal
  documents, raw plugin results, and unrelated context.

## Owner-approved task gateway

Opening a workspace issue does not invoke a model. The owner reviews the issue,
confirms the selected lane, and posts exactly one of these commands:

- `/mahoraga dispatch codex`
- `/mahoraga dispatch desktop mahoraga`

The GitHub workflow independently revalidates owner identity, form structure,
privacy confirmation, secrets, base commit, tool profile, lane, paths, and
verification commands. It creates a deterministic record ID and reuses that
record on retries. Public contributors cannot dispatch a lane. Attachment URLs
remain in the source issue and are never copied into coordination JSON.

## Credit boundary

Repository verification, gap audits, security scanning, dependency updates, and
status inspection use deterministic GitHub automation and do not invoke a model.
Opening a workspace issue does not automatically invoke Codex. The exact owner
gateway command is the explicit model-spend boundary, preventing a public issue
author from consuming subscription-backed execution.

## Public repository behavior

The static shell contains no private task data. The repository and Pages site are
public, so the dashboard reads current repository, pull-request, workflow, and
release metadata directly from GitHub's unauthenticated REST API. Authenticated
writes still happen only on `github.com` under the user's signed-in session. Use
`http://127.0.0.1:4782` on the Windows host for the live Mahoraga Control Center;
no route makes Windows localhost reachable from GitHub.

## Deployment

`.github/workflows/pages.yml` publishes only `cloud/` and only while the
repository is public. The workflow has explicit least-privilege permissions and
pins every remote Action to an immutable commit. The local desktop receives
source changes only through its ordinary Git sync and outbound relay behavior.

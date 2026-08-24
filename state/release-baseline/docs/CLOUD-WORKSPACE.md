# Mahoraga Cloud Workspace

The Mahoraga Cloud Workspace is a credential-free static interface deployed by
GitHub Pages. It is a cloud launcher and repository-status dashboard, not a
public proxy to the Windows runtime.

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

## Credit boundary

Repository verification, gap audits, security scanning, dependency updates, and
status inspection use deterministic GitHub automation and do not invoke a model.
Opening a workspace issue does not automatically invoke Codex. The repository
owner reviews the issue and makes a deliberate Codex delegation, preventing a
public issue author from consuming subscription-backed execution.

## Private repository behavior

The static shell contains no private task data. If the repository becomes
private, unauthenticated REST status is intentionally unavailable and the page
shows authenticated GitHub links instead. Issue, Actions, pull-request, and App
management links continue to rely on GitHub's own signed-in access control.

## Deployment

`.github/workflows/pages.yml` publishes only `cloud/`. The workflow has explicit
least-privilege permissions and pins every remote Action to an immutable commit.
The local desktop receives source changes only through its ordinary Git sync and
outbound relay behavior.

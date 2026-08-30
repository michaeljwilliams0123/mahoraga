# Mahoraga Cloud Workspace

The Mahoraga Cloud Workspace is a credential-free, conversation-first workspace deployed by GitHub Pages. It removes the GitHub intake form from the primary experience: the user writes one natural request, and the interface classifies its intent immediately without asking for a skill, execution lane, or return mode.

## Current execution state

The static Pages release provides the conversation surface and live read-only repository telemetry. The authenticated execution bridge is still staged. Until that bridge is connected:

- a message is classified locally in the browser;
- the text remains only in the current tab;
- it is not written to browser storage;
- it is not copied into a URL, GitHub issue, or repository record;
- it has not been dispatched to Mahoraga, Codex, a worker, or a model.

The interface states this boundary directly after every message. It does not display a false running or completed state.

## Target connection

The next connection layer is an authenticated, allowlisted MCP adapter joined through the approved tunnel client. The local Mahoraga runtime remains bound to `127.0.0.1`; no public runtime listener or raw HTTP tunnel is introduced. The adapter will issue short-lived authenticated sessions, expose only declared Mahoraga tools, and stream bounded activity and verification receipts back to the conversation.

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
- The page performs unauthenticated, read-only requests to GitHub's public REST API when repository visibility permits it.
- The page requests no GitHub token and uses no local or session storage.
- Conversation text is rendered with DOM text nodes and is neither persisted nor sent by the current static release.
- The localhost runtime remains bound to `127.0.0.1`.
- Credentials, private chats, personal documents, model responses, and enterprise content are not placed in public repository coordination records.
- Repository automation remains available through GitHub, but it is no longer the workspace intake path.

## Fast interaction model

1. Accept one natural-language message.
2. Classify the intent deterministically in the browser.
3. Show the selected work class immediately.
4. When the authenticated bridge is available, route through the fastest compatible healthy worker.
5. Show execution activity and verification evidence in the same thread.

Structured debate is reserved for ambiguous or high-impact work; clear requests remain on the fast path.

## Deployment

`.github/workflows/pages.yml` publishes only `cloud/` while the repository is public. The workflow has explicit least-privilege permissions and pins every remote Action to an immutable commit. GitHub Pages does not provide repository-controlled custom response headers; transport-level header hardening therefore belongs with the authenticated application host introduced alongside the MCP bridge rather than a nonfunctional static-file convention.

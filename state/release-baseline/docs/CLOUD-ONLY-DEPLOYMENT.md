# Cloud-only deployment inputs

Mahoraga presents one public interaction surface even though its execution
plane is separated for security and durability:

| Plane | Deployment | Responsibility |
| --- | --- | --- |
| Workspace | Vercel project rooted at `cloud-app/` | The only browser UI, explicit Cloud Pro, files, research, approvals, and connection state |
| Encrypted relay | Cloudflare Worker + Durable Object at `relay.mahoraga.app` | Owner/origin authentication, replay protection, and ciphertext forwarding only |
| Runtime engine | Long-running remote container/VM with a persistent volume | Deterministic workers, task state, Git coordination, and zero-Codex provider routing |
| Repository ledger | GitHub Actions and pull requests | Deterministic task staging, Primary Codex activation, Secondary fallback, verification, and audit receipts |

The runtime may listen on loopback inside its remote host. That is an internal
service boundary, not a second UI and not a dependency on the device displaying
the Vercel workspace. Vercel Functions should not host the current long-running
SQLite/supervisor process; use a persistent container or VM until the runtime
ledger is migrated to a serverless database and durable workflow system.

## Owner inputs still required

Provide choices and connector authorization, not secret values in chat or Git:

1. **Vercel project access:** reconnect or authorize the `mahoraga-cloud-workspace`
   project, confirm `cloud-app/` is its root, and choose the canonical production
   domain. Git integration should create a preview for every pull request.
2. **Workspace access policy:** choose Vercel Authentication or another approved
   identity boundary for production and previews. The Cloudflare relay origin
   must match the exact canonical production origin.
3. **Remote runtime host:** choose a persistent Linux container/VM provider and
   region. It needs outbound HTTPS/WebSocket and GitHub access plus a persistent
   encrypted volume; it needs no inbound desktop tunnel.
4. **Zero-credit generation provider:** supply the endpoint/model choice for an
   open-weight provider and evidence that its model billing is unmetered with a
   hard zero-dollar ceiling. Without this, deterministic tasks work but ordinary
   generated conversation correctly waits rather than spending Codex credits.
5. **Cloud browser provider:** authorize an isolated browser service and provide
   the domain allowlist. No local Chrome extension or local-file access is used.
6. **Cloudflare deployment access:** connect the Cloudflare account that owns
   `relay.mahoraga.app`, the `RELAY_SESSIONS` Durable Object, and Access policy.
7. **Data policy:** choose conversation retention (current default: none in
   Vercel), runtime backup interval, region, and maximum attachment retention.

Secrets belong in the owning platform's protected environment-variable store.
Do not paste `VERCEL_TOKEN`, provider tokens, GitHub credentials, Cloudflare
credentials, relay keys, or browser-provider secrets into an issue or chat.

## Environment contract

The Vercel workspace uses project OIDC for AI Gateway automatically. The four
browser variables in `cloud-app/.env.example` must all be configured before the
browser tool becomes visible. The relay uses `MAHORAGA_OWNER_IDENTITY`,
`MAHORAGA_WORKSPACE_ORIGIN`, `MAHORAGA_LOCAL_RELAY_TOKEN`, and the
`RELAY_SESSIONS` Durable Object binding. The remote runtime receives the matching
`MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN` only in its protected environment.

No `GITHUB_TOKEN` or `GITLAB_TOKEN` is accepted merely to light up a UI badge.
The GitHub task bridge is the repository's owner-authored issue/comment/PR flow.
Normal GitHub automation remains deterministic; the connected Codex runs only
after the owner writes the activation mention on the prepared draft pull request.

## Production acceptance

- The canonical Vercel URL loads the unified workspace and no Pages, `cloud/`,
  `web/`, or loopback frontend is deployable.
- The default route is `zero-codex`; a missing provider produces a bounded
  unavailable state and no model invocation.
- Cloud Pro runs only after explicit selection and respects the fixed context,
  output, search, and tool-step ceilings.
- The GitHub task link opens the bounded issue form, a validated dispatch creates
  one idempotent draft PR, and only an owner-authored Codex mention starts work.
- Relay owner/origin rejection, encrypted round-trip, replay rejection, revoke,
  and rollback canaries pass against the exact production origins.
- Browser execution is isolated, domain-allowlisted, approval-gated, and produces
  no mutation on the device displaying the workspace.

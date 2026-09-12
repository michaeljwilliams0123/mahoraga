# Cloud-only deployment inputs

Mahoraga presents one owner-facing browser interaction surface even though its
private source repository and execution plane are separated for security and durability:

| Plane | Deployment | Responsibility |
| --- | --- | --- |
| Workspace | Host-neutral `cloud-app/`; canonical origin is runtime-configured and verified; Pages is optional static export; Cloudflare Workers is a server-capable candidate | The only browser UI, files, research, approvals, and connection state |
| Encrypted relay | Cloudflare Worker + Durable Object at `mahoraga-relay.mahoraga-mjw0123.workers.dev` | Owner/origin authentication, replay protection, and ciphertext forwarding only |
| Runtime engine | Long-running remote container/VM with a persistent volume | Deterministic workers, task state, Git coordination, and zero-Codex provider routing |
| Repository ledger | GitHub Actions and pull requests | Deterministic task staging, verification, integration, and audit receipts |

The runtime may listen on loopback inside its remote host. That is an internal
service boundary, not a second UI and not a dependency on the device displaying
the browser workspace. The browser hosting provider must not host or proxy the
current long-running SQLite/supervisor process. Keep the runtime private and use
its authenticated outbound encrypted relay connection.

## Hosting transition

The production browser address is the exact verified origin configured through
`MAHORAGA_WORKSPACE_URL` / `MAHORAGA_WORKSPACE_ORIGIN`. GitHub Pages may publish
a derived static export of `cloud-app/` when enabled, but a Pages URL is not
inferred to be canonical merely because the private repository has Pages enabled.
Vercel is paused and non-canonical.

Cloudflare Workers is the designated replacement-host candidate. This means
Workers hosting, not Cloudflare Tunnel: no `cloudflared` tunnel, ngrok, reverse
SSH, port forwarding, public CDP endpoint, or generic proxy to the Mahoraga core
is permitted. See [`CLOUDFLARE-WORKERS-CUTOVER.md`](CLOUDFLARE-WORKERS-CUTOVER.md).

## Owner inputs still required

Provide choices and connector authorization, not secret values in chat or Git:

1. **Cloudflare Workers project access:** import `michaeljwilliams0123/mahoraga`
   through Workers Builds with `cloud-app/` as the application root, or authorize
   an equivalent protected deployment path. Do not commit account tokens.
2. **Workspace production origin:** keep the currently configured verified origin
   until the replacement root, health route, exact Git SHA, and encrypted pairing
   canary all pass. Then choose the verified Workers/custom domain in a separate cutover.
3. **Workspace access policy:** choose an approved identity boundary for
   production and previews. The relay origin policy must match the exact canonical
   production origin after cutover.
4. **Remote runtime host:** choose a persistent Linux container/VM provider and
   region. It needs outbound HTTPS/WebSocket and GitHub access plus a persistent
   encrypted volume; it needs no inbound desktop tunnel.
5. **Zero-credit generation provider:** supply the endpoint/model choice for an
   open-weight provider and evidence that its model billing is unmetered with a
   hard zero-dollar ceiling. Without this, deterministic tasks work but ordinary
   generated conversation correctly fails closed rather than spending Codex credits automatically. The owner may explicitly authorize one `licensed-approved` answer turn; that authorization is never inferred and cannot authorize actions or repository mutation.
6. **Cloud browser provider:** authorize an isolated browser service and provide
   the domain allowlist. No local Chrome extension or local-file access is used.
7. **Cloudflare relay access:** retain the account configuration that owns
   `mahoraga-relay.mahoraga-mjw0123.workers.dev`, the `RELAY_SESSIONS` Durable Object, and its access
   policy. Browser hosting and relay responsibilities remain separately bounded.
8. **Data policy:** choose conversation retention, runtime backup interval,
   region, and maximum attachment retention.

Secrets belong in the owning platform's protected environment-variable store.
Do not paste hosting tokens, provider tokens, GitHub credentials, Cloudflare
credentials, relay keys, or browser-provider secrets into an issue or chat.

## Host-neutral deployment metadata

`GET /api/health` accepts these non-secret variables on any browser host:

```text
MAHORAGA_DEPLOYMENT_PROVIDER=<hosting-provider>
MAHORAGA_DEPLOYMENT_ENV=<environment>
MAHORAGA_DEPLOYMENT_URL=<https-origin>
MAHORAGA_GIT_COMMIT_SHA=<exact-deployed-commit>
MAHORAGA_GIT_COMMIT_REF=<git-ref>
```

Vercel-specific variables remain fallback-only for the last verified Vercel
site. An example for the Workers candidate is in
[`../cloud-app/hosting.env.example`](../cloud-app/hosting.env.example).

The relay uses `MAHORAGA_OWNER_IDENTITY`, `MAHORAGA_WORKSPACE_ORIGIN`,
`MAHORAGA_LOCAL_RELAY_TOKEN`, and the `RELAY_SESSIONS` Durable Object binding.
The runtime receives the matching local relay access token only in its protected
environment. Deployment metadata does not contain credentials. A successful
remote pair creates a high-entropy browser resume credential; only its SHA-256
digest is retained in Durable Object session state. The raw credential remains
browser-scoped and expires with the bounded relay session.

No `GITHUB_TOKEN` or `GITLAB_TOKEN` is accepted merely to light up a UI badge.
Normal GitHub automation remains deterministic and no browser host becomes a
direct GitHub mutation authority.

## Production acceptance

- The canonical browser origin is configuration-backed, loads the approved
  `main` head, and reports that exact Git SHA; an optional Pages export is not
  treated as canonical without the same evidence.
- A replacement host loads the same unified Chat, Control Center, Operations,
  and Connections workspace and reports its provider plus exact Git SHA.
- No legacy `cloud/`, `web/`, loopback frontend, historical duplicate Vercel
  project, or tunnel is treated as canonical production.
- The default route is `zero-codex`; a missing provider produces a bounded
  **Degraded** state and no paid or licensed model invocation. An optional
  `licensed-approved` retry requires an explicit owner action for that one
  `assistant.respond` turn and cannot authorize build/review/action capabilities.
- First pairing is explicit; subsequent normal reload follows
  **Connecting -> Idle**, an accepted turn follows **Awake -> Idle**, and an
  expired/revoked/invalid stored session returns to **Offline** and manual
  pairing without weakening authentication.
- Relay owner/origin rejection, encrypted round-trip, replay rejection,
  `reattach-remote`, wrong-resume-proof rejection, revoke, and rollback canaries
  pass against the exact production origin.
- Browser persistence contains only relay-scoped reconnect material and a
  non-extractable AES-GCM key. It contains no GitHub/provider/runtime bearer/API
  credential and no conversation plaintext.
- Browser execution is isolated, domain-allowlisted, approval-gated, and produces
  no mutation on the device displaying the workspace.

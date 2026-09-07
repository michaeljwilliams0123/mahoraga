# Cloud-only deployment inputs

Mahoraga presents one public interaction surface even though its execution
plane is separated for security and durability:

| Plane | Deployment | Responsibility |
| --- | --- | --- |
| Workspace | Host-neutral `cloud-app/`; current verified fallback is Vercel `mahoraga-workspace`, Cloudflare Workers is the migration candidate | The only browser UI, files, research, approvals, and connection state |
| Encrypted relay | Cloudflare Worker + Durable Object at `relay.mahoraga.app` | Owner/origin authentication, replay protection, and ciphertext forwarding only |
| Runtime engine | Long-running remote container/VM with a persistent volume | Deterministic workers, task state, Git coordination, and zero-Codex provider routing |
| Repository ledger | GitHub Actions and pull requests | Deterministic task staging, verification, integration, and audit receipts |

The runtime may listen on loopback inside its remote host. That is an internal
service boundary, not a second UI and not a dependency on the device displaying
the browser workspace. The browser hosting provider must not host or proxy the
current long-running SQLite/supervisor process. Keep the runtime private and use
its authenticated outbound encrypted relay connection.

## Hosting transition

The last verified production browser address remains
`https://mahoraga-workspace.vercel.app/`. Vercel Git auto-deployment is frozen
while the account is quota-exhausted, so repository evolution continues without
spending or waiting on Vercel build capacity.

Cloudflare Workers is the designated replacement-host candidate. This means
Workers hosting, not Cloudflare Tunnel: no `cloudflared` tunnel, ngrok, reverse
SSH, port forwarding, public CDP endpoint, or generic proxy to the Mahoraga core
is permitted. See [`CLOUDFLARE-WORKERS-CUTOVER.md`](CLOUDFLARE-WORKERS-CUTOVER.md).

## Owner inputs still required

Provide choices and connector authorization, not secret values in chat or Git:

1. **Cloudflare Workers project access:** import `michaeljwilliams0123/mahoraga`
   through Workers Builds with `cloud-app/` as the application root, or authorize
   an equivalent protected deployment path. Do not commit account tokens.
2. **Workspace production origin:** keep the current verified Vercel origin until
   the Workers root, health route, exact Git SHA, and encrypted pairing canary all
   pass. Then choose the verified Workers/custom domain in a separate cutover.
3. **Workspace access policy:** choose an approved identity boundary for
   production and previews. The relay origin policy must match the exact canonical
   production origin after cutover.
4. **Remote runtime host:** choose a persistent Linux container/VM provider and
   region. It needs outbound HTTPS/WebSocket and GitHub access plus a persistent
   encrypted volume; it needs no inbound desktop tunnel.
5. **Zero-credit generation provider:** supply the endpoint/model choice for an
   open-weight provider and evidence that its model billing is unmetered with a
   hard zero-dollar ceiling. Without this, deterministic tasks work but ordinary
   generated conversation correctly waits rather than spending Codex credits.
6. **Cloud browser provider:** authorize an isolated browser service and provide
   the domain allowlist. No local Chrome extension or local-file access is used.
7. **Cloudflare relay access:** retain the account configuration that owns
   `relay.mahoraga.app`, the `RELAY_SESSIONS` Durable Object, and its access
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
[`../cloud-app/.env.hosting.example`](../cloud-app/.env.hosting.example).

The relay uses `MAHORAGA_OWNER_IDENTITY`, `MAHORAGA_WORKSPACE_ORIGIN`,
`MAHORAGA_LOCAL_RELAY_TOKEN`, and the `RELAY_SESSIONS` Durable Object binding.
The runtime receives the matching local relay access token only in its protected
environment. Deployment metadata does not contain credentials.

No `GITHUB_TOKEN` or `GITLAB_TOKEN` is accepted merely to light up a UI badge.
Normal GitHub automation remains deterministic and no browser host becomes a
direct GitHub mutation authority.

## Production acceptance

- The currently canonical `https://mahoraga-workspace.vercel.app/` remains a
  bounded fallback until another host passes the exact-commit activation gate.
- A replacement host loads the same unified Chat, Control Center, Operations,
  and Connections workspace and reports its provider plus exact Git SHA.
- No Pages, `cloud/`, `web/`, loopback frontend, historical duplicate Vercel
  project, or tunnel is treated as canonical production.
- The default route is `zero-codex`; a missing provider produces a bounded
  unavailable state and no paid model invocation.
- Relay owner/origin rejection, encrypted round-trip, replay rejection, revoke,
  and rollback canaries pass against the exact production origin.
- Browser execution is isolated, domain-allowlisted, approval-gated, and produces
  no mutation on the device displaying the workspace.

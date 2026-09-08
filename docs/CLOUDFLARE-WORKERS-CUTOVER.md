# Cloudflare Workers hosting candidate

## Status

Cloudflare Workers is the designated Vercel-independent hosting candidate for the
single `cloud-app/` browser workspace. This is a hosting migration, not a tunnel.
The last verified `https://mahoraga-workspace.vercel.app/` deployment remains the
production fallback until a Workers deployment is built, fetched, paired, and
verified against an exact Git commit.

Vercel Git auto-deployment is intentionally frozen while its account quota is
exhausted. Repository evolution continues in GitHub and does not depend on a
successful Vercel build.

## Target path

```text
GitHub main
  -> Cloudflare Workers build/deploy
  -> Mahoraga browser workspace
  -> encrypted relay at mahoraga-relay.mahoraga-mjw0123.workers.dev
  -> outbound-connected authoritative Mahoraga core
```

The local/core runtime is never exposed as a public origin. There is no inbound
route to `127.0.0.1:4782` and no generic proxy into the runtime.

## Hard boundary: Workers yes, Tunnel no

This migration must not introduce any of the following:

- Cloudflare Tunnel / `cloudflared` tunnel to the Mahoraga runtime
- ngrok
- reverse SSH
- router port forwarding
- a public Chrome/CDP/debugging endpoint
- a generic HTTP/WebSocket proxy to loopback

Cloudflare Workers hosts the browser application. Runtime pairing continues over
the existing authenticated, encrypted relay with the runtime initiating outbound
connectivity.

## Next.js 16 compatibility gate

Cloudflare's current recommended path for an existing Next.js 16 application is
vinext on Workers. Do not replace the existing Next.js application or rewrite the
UI. Before activating the Workers deployment, run the non-destructive
compatibility gate from `cloud-app/`:

```bash
npx vinext check
```

Only after the compatibility report is acceptable should the Cloudflare Workers
configuration be initialized. Cloudflare's documented migration path is:

```bash
npx vinext init
npm run build:vinext
npx @vinext/cloudflare deploy
```

The existing `next dev` / `next build` path remains authoritative until that
Workers compatibility gate and deployment canary pass.

Official references:

- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/

## Git-integrated setup without putting credentials in the repository

The preferred account-side setup is Cloudflare Workers Builds importing
`michaeljwilliams0123/mahoraga` from GitHub with `cloud-app/` as the application
root. Cloudflare's automatic Next.js configuration uses vinext. Account tokens,
API keys, and deployment credentials stay in Cloudflare/GitHub protected stores
and are never committed to this repository.

Set the following non-secret deployment metadata in the Workers build/runtime
environment so `/api/health` can remain provider-neutral:

```text
MAHORAGA_DEPLOYMENT_PROVIDER=cloudflare-workers
MAHORAGA_DEPLOYMENT_ENV=production
MAHORAGA_DEPLOYMENT_URL=https://<verified-workers-hostname>
MAHORAGA_GIT_COMMIT_SHA=<exact-deployed-commit>
MAHORAGA_GIT_COMMIT_REF=main
```

Vercel variables remain fallback-only for the last verified Vercel deployment.

## Activation gate

Do not change the canonical repository URL to a Workers hostname until all of the
following are true for the same exact commit:

1. Workers build succeeds from `cloud-app/`.
2. The Workers root page returns HTTP 200 and renders Chat, Control Center,
   Operations, and Connections.
3. `/api/health` returns HTTP 200 with `deployment.provider` equal to
   `cloudflare-workers` and the expected exact Git SHA.
4. The browser establishes the existing encrypted pairing flow to the relay.
5. No local port, local browser debugger, or generic tunnel is externally
   reachable.
6. Zero-Codex / no-paid-fallback policy is unchanged.

After those checks pass, use a separate cutover PR to replace the canonical
workspace URL and launcher target. Keep the previous known-good deployment as a
bounded rollback reference until the new host has passed the canary.

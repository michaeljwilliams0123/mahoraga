# Cloudflare Workers hosting candidate

## Status

Cloudflare Workers is the designated Vercel-independent hosting candidate for the
single `cloud-app/` browser workspace. This is a hosting migration, not a tunnel.
The historical `https://mahoraga-workspace.vercel.app/` deployment is retired and is not a production fallback. Cloudflare execution-runtime acceptance passed on exact `eabfedd95877847bc8cdf407dfe0559d7a56bcbe` in hosted run 36087031059; Railway is non-routing rollback/evidence infrastructure. This document's Workers browser-host migration gate remains separate from the accepted execution runtime and still requires an owner browser/domain proof before promotion.

Vercel Git deployment is outside the active production path. Repository evolution continues in GitHub and does not depend on Vercel build or deployment status.

## Target path

```text
GitHub main
  -> Cloudflare Workers build/deploy
  -> Mahoraga browser workspace
  -> encrypted relay at mahoraga-relay.mahoraga-mjw0123.workers.dev
  -> outbound-connected authoritative Mahoraga core
```

The local/core runtime remains private. An owner-authorized authenticated tunnel
may be used as a transport, but it must terminate at a scoped authenticated
gateway/relay and must not expose `127.0.0.1:4782` or `127.0.0.1:4783` directly.

## Boundary: authenticated tunnels allowed, raw loopback exposure denied

Allowed transport options include Cloudflare Tunnel / `cloudflared`, ngrok,
reverse SSH, or an equivalent tunnel when owner-authorized and configured with
authentication, a fixed target, bounded scope, and auditable lifecycle.

The tunnel must not become a generic HTTP/WebSocket proxy, publish a raw runtime
listener, expose Chrome/CDP/debugging, bypass Mahoraga authentication/authority,
or embed credentials in the repository. Router port forwarding to 4782/4783 is
not a substitute for an authenticated tunnel.

Cloudflare Workers may still host the browser application. Runtime pairing can
continue over the existing authenticated encrypted relay, or use an approved
authenticated tunnel as the bounded transport to that gateway.

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

## Root-path static workspace candidate

The same `cloud-app/` source can also be exported as a root-path static asset
bundle for the `mahoraga-workspace-candidate` Worker. From the repository root, install
the `cloud-app/` dependencies, then run `npm run cloudflare:workspace:build`.
The build writes `cloud-app/out/`, checks that its entry uses `/_next/static/`,
and excludes server-only API routes. `deploy/cloudflare-workspace/wrangler.jsonc`
points Static Assets at that output. The existing Pages build keeps its
`/mahoraga` prefix.

This static UI requires a verified owner gateway bridge origin or an authorized
encrypted relay pairing for actions. Set `NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN`
only to the exact HTTPS origin of an Access-protected gateway that implements
the existing Pages bridge protocol; do not use the stale Railway origin or the
execution Worker's `/api/execute` endpoint as the browser bridge. Static
`/api/health.json` identifies only the UI build. The static Worker does not
implement `/api/runtime/*`, assert traffic authority, or prove model execution.
Deploy and promote it only after the owner access, exact-SHA, live action, and
rollback checks in the activation gate and #697 have passed.

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

Retired Vercel variables are ignored by the active health route and cannot become a fallback signal.

## Activation gate

Do not change the canonical repository URL to a Workers hostname until all of the
following are true for the same exact commit:

1. Workers build succeeds from `cloud-app/`.
2. The Workers root page returns HTTP 200 and renders Chat, Control Center,
   Operations, and Connections.
3. `/api/health` returns HTTP 200 with `deployment.provider` equal to
   `cloudflare-workers` and the expected exact Git SHA.
4. The browser establishes the existing encrypted pairing flow to the relay.
5. No raw 4782/4783 listener, local browser debugger, or unauthenticated generic
   proxy is externally reachable; any tunnel is owner-authorized and authenticated.
6. Zero-Codex / no-paid-fallback policy is unchanged.

After those checks pass, use a separate cutover PR to replace the canonical
workspace URL and launcher target. Keep the previous known-good deployment as a
bounded rollback reference until the new host has passed the canary.

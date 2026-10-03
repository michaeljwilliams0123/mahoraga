# Cloudflare Workers hosting candidate

## Status

Cloudflare Workers is the designated Vercel-independent hosting candidate for the
single `cloud-app/` browser workspace. This is a hosting migration, not a tunnel.
The historical `https://mahoraga-workspace.vercel.app/` deployment is retired and is not a production fallback. Cloudflare execution-runtime acceptance passed on exact `eabfedd95877847bc8cdf407dfe0559d7a56bcbe` in hosted run 36087031059; Railway is legacy evidence only: zero-route, zero-influence, zero-fallback, zero-authority. This document's Workers browser-host migration gate remains separate from the accepted execution runtime and still requires an owner browser/domain proof before promotion.

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

## Browser-callable cognitive routes

The owner gateway service binding exposes three separately reported capability
routes from the Cloudflare execution runtime:

- `assistant.respond` remains gated by a fresh zero-credit provider admission.
- `cognitive.predict` executes an explicit `/predict` numeric scenario through
  the canonical counterfactual world model and returns a fingerprinted receipt.
- `cognitive.cycle` executes an explicit `/cycle` payload through the canonical
  collective deliberation, metacognition, objective planning, prediction, and
  decision loop and returns its fingerprinted receipt.

The two cognitive routes are deterministic and do not invoke the language model.
Their user and receipt messages use the existing encrypted conversation vault.
A cognitive cycle can recommend HOLD, ESCALATE, or EXECUTE and can report whether
the planner found mutation authority, but the browser route does not execute the
proposed action or grant traffic authority. Capability discovery reports these
routes from live execution-runtime code rather than from repository presence.

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


## Stronger cloud: Actions builds, Cloudflare serves

For the public repository, standard GitHub-hosted Actions runners are free. More Actions capacity strengthens verification and bounded candidate jobs; it does not turn Pages into a stateful runtime or make Actions jobs persistent servers. Keep standard hosted Ubuntu/Windows runners and protected exact-head checks. Larger runners and artifact storage have separate billing rules.

The recommended target is the existing Cloudflare static workspace plus the existing Access-protected owner gateway and execution Durable Object. Pages remains a derived mirror of the same `cloud-app/` source. No second application or provider is introduced. The candidate URL is https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev; it remains a candidate until the owner bridge and activation transaction are observed end to end.

The gateway permits precisely the configured Pages and Cloudflare workspace origins in its frame CSP and message listener. Replies stay bound to the requesting validated origin even when requests overlap. Owner Access identity, same-origin gateway mutations, signed runtime binding, and one-use replay protection still govern execution. No wildcard origin, public direct action route, browser token, or paid provider fallback is added.

The workspace publisher consumes successful canonical **Cloudflare deployment and acceptance**, including verified bot-merge handoffs. Scheduled provider-renewal runs cannot authorize UI publication. It pins checkout/build health to that source and rechecks current main before deployment. The candidate receives native `_headers` security policy, the exact gateway frame origin, and noncached health metadata. A bounded receipt verifies Cloudflare route headers, static source, security headers, and the paired runtime's exact source/readiness. It explicitly grants no execution authority.

Automatic publication is a dependent reusable job within the active Cloudflare deployment workflow: `workspace-candidate` requires successful `deploy-accept`. It passes the accepted source SHA to the same-commit reusable publisher, avoiding a separate completion-event handoff and duplicate automatic publishing. The publisher validates the canonical caller workflow on protected main, bounded original verification event, and matching SHA before building. The incumbent deployment job retains its bot-dispatch provenance receipt, exact-main, billing, provider admission, and live acceptance gates. Renewal-only runs skip the publishing dependency; owner-only standalone manual publication stays available. The called workflow has its own concurrency group and keeps read-only GitHub permissions. See [GitHub reusable workflow caller context and limits](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations).

Workers Static Assets serves the bundle without a Worker script; static requests and asset storage are free. The stateful runtime and provider remain under their existing independently proved Free billing and admission limits. The owner pause and durable internal schedule remain separate from browser connections.

Sources: [GitHub public standard runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Actions runtime limits](https://docs.github.com/en/actions/reference/limits), [Pages static hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Workers static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), and [native static headers](https://developers.cloudflare.com/workers/static-assets/headers/). Windows production remains `3.6.0`.

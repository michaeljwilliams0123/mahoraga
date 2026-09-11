# Mahoraga Cloud Workspace

`cloud-app/` is the **single browser UI source** for Mahoraga.

GitHub main is the code authority. GitHub Pages is the primary static browser
path for the current approved head at `https://michaeljwilliams0123.github.io/mahoraga/`.
Vercel is paused/historical rather than an active maintenance target; Cloudflare
Workers remains a server-capable replacement-host candidate where server routes are required.
Every host deploys this same Next.js workspace and none gains execution authority
over the paired core. See
[`../docs/CLOUDFLARE-WORKERS-CUTOVER.md`](../docs/CLOUDFLARE-WORKERS-CUTOVER.md).

GitHub Pages receives a derived static export of this same workspace. That export
keeps the UI, encrypted relay client, and public deployment-health metadata, but
does not publish server-only session, action, readiness, or liveness routes.
Those routes remain available only when this workspace is run on a server-capable
host.

Historical Vercel project: `mahoraga-workspace`

Historical Vercel URL: `https://mahoraga-workspace.vercel.app/`

It contains four complete in-app surfaces:

- **Chat** — encrypted RuntimeRelay conversation path using `creditPolicy: zero-codex`.
- **Control Center** — host provider, cloud deployment identity, deployed Git SHA, paired-core state, routing policy, and capability readiness.
- **Operations** — core-mediated runtime/repository/repair actions with owner confirmation where required.
- **Connections** — encrypted relay pairing plus capability/worker readiness reported by the paired core.

`operator-deck/` is not a second application. It remains a TypeScript reference/control-library layer only.

## Runtime

- Next.js 16 App Router with provider-neutral deployment metadata
- React 19 / TypeScript
- fixed `wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair` endpoint for encrypted runtime pairing
- ECDH + HKDF + AES-GCM relay framing in the browser client
- zero-Codex conversation policy with no automatic paid-model fallback
- direct cloud conversation execution disabled
- direct provider selection disabled
- browser direct GitHub authority disabled
- attachments remain fail-closed until the core artifact bridge is available

The ordinary conversation route requires the paired Mahoraga core. The browser
is a client, not an alternate execution plane. Hosting the browser on Workers
does not expose or proxy the core runtime.

## Privacy and authority

Policy, routing, verification, execution, repair, and consequential mutation
authority remain with the paired core. The relay broker cannot read encrypted
RuntimeRelay frame plaintext.

The browser does not auto-confirm owner-gated Operations actions. It does not
select providers directly and does not fall through to a paid model.

## Deployment identity and runtime provenance

`GET /api/health` exposes only non-secret deployment and boundary metadata. The
same route is prerendered for the Pages export,
including:

- product and runtime candidate version
- deployment provider and environment
- deployed provider URL
- deployed Git commit SHA
- deployed Git ref
- paired-core authority boundary and paid-fallback state

Portable `MAHORAGA_*` deployment variables are preferred; Vercel variables are
compatibility fallback for the existing deployment. See `hosting.env.example`.
Control Center renders the provider and deployed commit SHA so stale browser
deployments can be identified directly from the UI.

Deployment identity is not runtime identity. Authoritative runtime provenance is
derived by the paired Mahoraga core from its exact source commit and expected
source commit. Until the core supplies that evidence, cloud health reports
runtime provenance as `unknown` with `source: paired-core-required`; the cloud
surface must not infer `current` merely from deployment environment variables.

## Verification

```bash
npm ci
npm run verify
```

Repository-native exact-head verification remains the merge gate. External
hosting-provider status is not a PR completion requirement. Netlify is a
deployment fallback only; it does not replace GitHub main as authority or the
paired Mahoraga core as the execution plane.

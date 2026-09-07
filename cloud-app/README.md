# Mahoraga Cloud Workspace

`cloud-app/` is the **single cloud-hosted browser UI** for Mahoraga.

Current verified production fallback: `https://mahoraga-workspace.vercel.app/`

The application is host-neutral. Vercel Git auto-deployment is frozen while its
quota is exhausted, and Cloudflare Workers is the designated replacement-host
candidate. See [`../docs/CLOUDFLARE-WORKERS-CUTOVER.md`](../docs/CLOUDFLARE-WORKERS-CUTOVER.md).

It contains four complete in-app surfaces:

- **Chat** — encrypted RuntimeRelay conversation path using `creditPolicy: zero-codex`.
- **Control Center** — host provider, cloud deployment identity, deployed Git SHA, paired-core state, routing policy, and capability readiness.
- **Operations** — core-mediated runtime/repository/repair actions with owner confirmation where required.
- **Connections** — encrypted relay pairing plus capability/worker readiness reported by the paired core.

`operator-deck/` is not a second application. It remains a TypeScript reference/control-library layer only.

## Runtime

- Next.js 16 App Router with provider-neutral deployment metadata
- React 19 / TypeScript
- fixed `wss://relay.mahoraga.app/pair` endpoint for encrypted runtime pairing
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

## Deployment identity

`GET /api/health` exposes only non-secret deployment and boundary metadata,
including:

- product and runtime candidate version
- hosting provider and environment
- deployed HTTPS URL
- deployed Git commit SHA
- deployed Git ref
- paired-core authority boundary and paid-fallback state

Portable `MAHORAGA_*` deployment variables are preferred; Vercel variables are
compatibility fallback for the existing deployment. See `.env.hosting.example`.
Control Center renders the provider and deployed commit SHA so stale production
can be identified directly from the UI.

## Verification

```bash
npm ci
npm run verify
```

Repository-native exact-head verification remains the merge gate. External
hosting provider status is not a PR completion requirement.

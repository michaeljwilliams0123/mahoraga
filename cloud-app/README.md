# Mahoraga Cloud Workspace

`cloud-app/` is the **single Vercel-hosted browser UI** for Mahoraga.

It contains four complete in-app surfaces:

- **Chat** — encrypted RuntimeRelay conversation path using `creditPolicy: zero-codex`.
- **Control Center** — cloud deployment identity, deployed Git SHA, paired-core state, routing policy, and capability readiness.
- **Operations** — core-mediated runtime/repository/repair actions with owner confirmation where required.
- **Connections** — encrypted relay pairing plus capability/worker readiness reported by the paired core.

`operator-deck/` is not a second application. It remains a TypeScript reference/control-library layer only.

## Runtime

- Next.js App Router on Vercel
- React 19 / TypeScript
- fixed `wss://relay.mahoraga.app/pair` endpoint for encrypted runtime pairing
- ECDH + HKDF + AES-GCM relay framing in the browser client
- zero-Codex conversation policy with no automatic paid-model fallback
- direct cloud conversation execution disabled
- direct provider selection disabled
- browser direct GitHub authority disabled
- attachments remain fail-closed until the core artifact bridge is available

The ordinary conversation route requires the paired Mahoraga core. The browser is a client, not an alternate execution plane.

## Privacy and authority

Policy, routing, verification, execution, repair, and consequential mutation authority remain with the paired core. The relay broker cannot read encrypted RuntimeRelay frame plaintext.

The browser does not auto-confirm owner-gated Operations actions. It does not select providers directly and does not fall through to a paid model.

## Deployment identity

`GET /api/health` exposes only non-secret deployment and boundary metadata, including:

- product and runtime candidate version
- Vercel environment
- deployed Vercel URL
- deployed Git commit SHA
- deployed Git ref
- paired-core authority boundary and paid-fallback state

Control Center renders the deployed commit SHA so stale production can be identified directly from the UI.

## Verification

```bash
npm ci
npm run verify
```

Repository-native exact-head verification remains the merge gate. Vercel bot/review output is not a PR completion requirement.

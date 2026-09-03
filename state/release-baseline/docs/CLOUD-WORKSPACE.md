# Unified Mahoraga workspace

`cloud-app/` is Mahoraga's single Vercel-hosted workspace and only browser UI.
It combines the useful cloud and runtime capabilities behind one conversation,
one route selector, and one connection view. No second local or Pages UI remains.

The canonical production address is
`https://mahoraga-cloud-workspace.vercel.app/`. A separately managed custom
domain may replace it by setting `MAHORAGA_WORKSPACE_URL` on the runtime. The
loopback root redirects to that HTTPS address; the loopback process remains an
API and encrypted-relay execution service, not another frontend.

## Execution routes

| Route | Use | Content boundary |
| --- | --- | --- |
| Zero-Codex route (default) | Deterministic work and an attested zero-credit/open-weight provider through the paired runtime | Never falls through to Codex, AI Gateway, or another paid model; unavailable generation waits rather than spending credits |
| Cloud Pro (explicit) | GPT-5.6 Sol through Vercel AI Gateway with pro reasoning and maximum effort | Runs only after the owner selects it; Vercel zero-data-retention routing is requested |

Every conversation locks to the route used for its first turn. A runtime
conversation cannot fall through to cloud after a disconnect. Attachments are
enabled only on the explicitly selected Cloud Pro route because the paired
runtime intentionally rejects relay attachments. The isolated browser is a
cloud tool and remains unavailable until its provider variables are configured.
It never controls the user's installed Chrome and no extension is used.

Cloud Pro keeps the highest declared model but bounds each request to the latest
14 messages, 48,000 retained text characters, 12,000 characters in a new turn,
8,000 output tokens, five tool steps, and 6,000 search-tool tokens. These are ceilings, not a promise that every request
uses the full budget. Ordinary paired-runtime chat sends
`creditPolicy: zero-codex`; both relay boundaries overwrite that field so a
modified browser client cannot request a hidden paid fallback.

## Pairing

1. On the explicitly chosen cloud or secondary runtime, generate a short-lived
   pairing offer using the existing Mahoraga relay command. This does not need
   to be the device displaying the workspace.
2. Open the workspace's **Connections** section, paste the offer, and choose
   **Pair runtime**.
3. Review the count of currently routable runtime capabilities. Use **Revoke**
   to close the session and invalidate the paired device.

Pairing state, decrypted messages, and conversation route state live only in
the browser tab. They are not written to local storage, a Vercel database,
GitHub, or relay logs.

Generation on the default route requires an independently deployed provider
whose zero-credit billing state and fresh capability canary are verified. If no
such provider exists, general conversation stops with
`zero-credit-provider-unavailable`; deterministic health, repository, and
workflow capabilities can still run. This is intentional: zero Codex credits
does not mean that model inference has zero compute cost.

## Deployment and verification

The Vercel Git integration owns previews and production promotion for the
`mahoraga-cloud-workspace` project with `cloud-app/` as its root. Every pull
request also runs the repository's `Verify unified Vercel workspace` job:

```bash
cd cloud-app
npm ci
npm run verify
```

That command type-checks, runs the workspace contract tests, and performs a
production Next.js build. `GET /api/health` reports configured backend
capabilities without claiming that an unconfigured connector is usable.

GitHub Pages and the legacy `cloud/` and `web/` entry points are retired. A
main-branch merge is sufficient for the connected Vercel project to produce the
production deployment; autonomous integration no longer dispatches a separate
Pages workflow.

The remaining infrastructure choices and secret-free owner inputs are listed in
[`CLOUD-ONLY-DEPLOYMENT.md`](CLOUD-ONLY-DEPLOYMENT.md).

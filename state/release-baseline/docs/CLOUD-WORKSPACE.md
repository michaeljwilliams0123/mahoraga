# Unified Mahoraga workspace

`cloud-app/` is Mahoraga's single cloud-hosted workspace and only browser UI.
It is a thin encrypted client of the authoritative Mahoraga core: one
conversation surface, one pairing view, and no browser-side provider or brain
selector. GitHub Pages publishes this same source; no second local or static UI remains.
The workspace source is host-neutral; a hosting provider never becomes a second
execution plane or authority boundary.

The canonical production address is
`https://michaeljwilliams0123.github.io/mahoraga/`. Its Pages workflow exports
`cloud-app/` from every approved `main` head and embeds that exact commit in the
health response. A separately managed custom domain may replace it
by setting `MAHORAGA_WORKSPACE_URL` on the runtime. The loopback root redirects
to the canonical HTTPS address; the loopback process remains the API,
encrypted-relay, Conversation Gateway, policy/router, and execution service—not
another frontend.

## Single-core execution

Every user turn follows one logical path:

`Workspace -> encrypted relay -> Conversation Gateway -> policy/router -> bounded capability -> verification -> receipt/vault -> Workspace`

Pairing changes connectivity only. It does not switch Mahoraga between a local
and cloud brain. The workspace cannot directly invoke AI Gateway, search, a
browser provider, or another model endpoint. There is no direct `/api/chat`
route; conversation work uses only the paired encrypted core.

The default conversation policy remains Zero-Codex: ordinary paired-core chat
sends `creditPolicy: zero-codex`, the relay boundary preserves the authoritative
core policy, and there is no automatic paid fallback. If no verified
zero-credit language provider is routable, model-backed conversation waits or
returns `zero-credit-provider-unavailable` rather than silently buying another
route. Deterministic core capabilities can still run when their own readiness
contracts are satisfied.

Cloud-capable implementations such as GPT-5.6 Sol, search, or the isolated
browser may remain packaged as provider/capability code, but they are not
user-addressable orchestration paths. They may execute only after the core owns
the run, derives policy, selects an eligible capability, and verifies its
receipt. Browser execution remains isolated and approval-gated; it never
controls the user's installed Chrome and no local extension is required.

Attachments are displayed by the workspace but are not sent through the
conversation relay. Until the core artifact bridge is connected, attachment
submission fails closed without upload or paid fallback.

The empty conversation presents three keyboard-accessible task starters:
**Analyze a dataset**, **Improve a repository**, and **Approved browser task**.
Choosing one only places a detailed prompt in the editable composer and moves
focus there. It does not submit work, call a provider, or change routing
authority.

## Pairing

1. Generate a short-lived Mahoraga relay pairing offer from the runtime that
   owns the authoritative core.
2. Open the workspace's **Connections** section, paste the offer, and choose
   **Pair runtime**.
3. Review the bounded capability index returned by the core. Use **Revoke** to
   close the session and invalidate the paired device.

Pairing state, decrypted messages, and conversation content live only in the
browser tab. They are not written to local storage, a hosting-provider database,
GitHub, or relay logs. The relay sees ciphertext; message plaintext is decrypted
only at the paired endpoints.

## Deployment and verification

GitHub is the source/evolution and production presentation plane for the single
workspace. Every push to approved `main` rebuilds `cloud-app/` as a static Pages
export. Historical Vercel projects remain non-canonical while paused.

Cloudflare Workers is the designated Vercel-independent hosting candidate. It
hosts only the browser application; it must not expose the local runtime or
create a Cloudflare Tunnel. The runtime continues to initiate outbound encrypted
relay connectivity. See [`CLOUDFLARE-WORKERS-CUTOVER.md`](CLOUDFLARE-WORKERS-CUTOVER.md).

The workspace health route accepts portable non-secret `MAHORAGA_*` deployment
metadata and is prerendered during a Pages export. Control Center renders the
host provider, environment, Git ref, and commit
SHA so stale production is visible directly.

Every pull request may still run the repository's observational unified cloud
workspace job; Vercel status/bot output must not gate PR completion.

```bash
cd cloud-app
npm ci
npm run verify
```

That command type-checks, runs the workspace contract tests, and performs a
production Next.js build. `GET /api/health` reports the client/core boundary and
never claims direct browser-side provider authority.

The legacy `cloud/` and `web/` entry points remain retired. GitHub Pages deploys
the one `cloud-app/` source rather than maintaining a duplicate frontend.

The remaining infrastructure choices and secret-free owner inputs are listed in
[`CLOUD-ONLY-DEPLOYMENT.md`](CLOUD-ONLY-DEPLOYMENT.md).

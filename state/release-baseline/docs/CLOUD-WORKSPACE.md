# Unified Mahoraga workspace

`cloud-app/` is Mahoraga's single Vercel-hosted workspace and only browser UI.
It is a thin encrypted client of the authoritative Mahoraga core: one
conversation surface, one pairing view, and no browser-side provider or brain
selector. No second local or Pages UI remains.

The canonical production address is
`https://mahoraga-cloud-workspace.vercel.app/`. A separately managed custom
domain may replace it by setting `MAHORAGA_WORKSPACE_URL` on the runtime. The
loopback root redirects to that HTTPS address; the loopback process remains the
API, encrypted-relay, Conversation Gateway, policy/router, and execution
service—not another frontend.

## Single-core execution

Every user turn follows one logical path:

`Workspace -> encrypted relay -> Conversation Gateway -> policy/router -> bounded capability -> verification -> receipt/vault -> Workspace`

Pairing changes connectivity only. It does not switch Mahoraga between a local
and cloud brain. The workspace cannot directly invoke AI Gateway, search, a
browser provider, or another model endpoint, and the legacy `/api/chat` route
fails closed with `core-gateway-required`.

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
browser tab. They are not written to local storage, a Vercel database, GitHub,
or relay logs. The relay sees ciphertext; message plaintext is decrypted only
at the paired endpoints.

## Deployment and verification

The Vercel Git integration owns previews and production promotion for the
`mahoraga-cloud-workspace` project with `cloud-app/` as its root. Every pull
request may also run the repository's `Verify unified Vercel workspace` job.
That job is observational: it must not gate PR completion.

```bash
cd cloud-app
npm ci
npm run verify
```

That command type-checks, runs the workspace contract tests, and performs a
production Next.js build. `GET /api/health` reports the client/core boundary and
never claims direct browser-side provider authority.

GitHub Pages and the legacy `cloud/` and `web/` entry points are retired. A
main-branch merge is sufficient for the connected Vercel project to produce the
production deployment; autonomous integration no longer dispatches a separate
Pages workflow.

The remaining infrastructure choices and secret-free owner inputs are listed in
[`CLOUD-ONLY-DEPLOYMENT.md`](CLOUD-ONLY-DEPLOYMENT.md).

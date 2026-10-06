# Edge-native admission renewal and live capability updates

Provider admission liveness and capability state are owned by the Cloudflare owner gateway, not by GitHub Actions scheduling. GitHub Actions remains CI/CD, deployment checks, and the required `sovereign-eight-hour-cycle.yml`.

## Runtime behavior

- **Primary origin.** `cloud-app/` reaches the gateway through the hidden same-origin bridge frame served from one configured edge origin (`NEXT_PUBLIC_MAHORAGA_PRIMARY_ORIGIN`, falling back to `NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN`). The former top-level `location.replace()` handoff from github.io to workers.dev is removed; Pages is a mirror that embeds the frame and never becomes a runtime authority. Point the primary origin at the Cloudflare custom domain bound to `mahoraga-owner-gateway`.
- **Scheduled renewal.** `deploy/cloudflare-owner-gateway/wrangler.toml` registers a `* * * * *` cron trigger. `scheduled()` calls `performInlineAdmissionRenewal`, which renews through the `MAHORAGA_EXECUTION_RUNTIME` service binding when less than 30 minutes of canary lifetime remain.
- **Lazy renewal.** `chat` and `execute` actions (and each SSE tick) renew in-request when less than 5 minutes remain. One in-flight renewal per isolate (singleflight), a 60 s known-fresh cache, and a jittered 30 s failure cooldown prevent stampedes.
- **Runtime refresh endpoint.** `POST /api/provider/refresh` requires the internal `x-provider-refresh-token` secret (403 otherwise), serializes concurrent refreshes in the Durable Object, replays a result admitted in the last 30 s, and never overwrites a newer admitted state with an older attestation. The gateway builds the hard-zero billing attestation with the same logic as the Actions workflow (`src/cloudflare-zero-credit-billing.ts`); billing remains fail-closed.
- **Live capability updates.** `GET /api/runtime/pages-bridge/events` is an owner-authenticated SSE stream (snapshot on change, 10 s heartbeat, 5 min bounded lifetime). The bridge frame relays it to the workspace, which reconnects with jittered exponential backoff and a 35 s heartbeat timeout. UI states: `Offline`, `Reconnecting`, `Verifying`, `Provider Standby`, `Idle`. Last-known-good abilities are kept for up to 60 s of interruption, then readiness is cleared (fail closed).

## Gateway secrets (Wrangler secrets, no widened permissions)

`PROVIDER_REFRESH_SECRET` (same value as the runtime), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (read-only account settings), optional `CLOUDFLARE_BILLING_READ_TOKEN`. If any is absent, renewal reports `unconfigured` and never attempts a refresh.

## Observability

Structured JSON log events (no secrets): `admission-renewal-triggered` (`trigger`: `lazy`|`scheduled`), `admission-renewal-succeeded`, `admission-renewal-failed` (`reason` code), `sse-connect`, `sse-disconnect` (`durationMs`), and runtime `provider-refresh-admitted|held|replayed`. Workspace state carries a `reconnects` count.

## Rollback switches

- Capability transport: build with `NEXT_PUBLIC_MAHORAGA_CAPABILITY_POLL_FALLBACK=fallback` to fall back to 30 s polling after repeated SSE failures, or `=force` to restore polling-first.
- Renewal: run the **Renew Cloudflare Provider Admission** workflow manually (`workflow_dispatch`, owner on `main`); its schedule was removed. To disable edge renewal, delete `[triggers]` from the gateway `wrangler.toml` and redeploy.
- Origin: unset `NEXT_PUBLIC_MAHORAGA_PRIMARY_ORIGIN` to return to the bridge-origin variable.

Windows production rollback remains `3.6.0`.

# Always-on cloud runtime candidate

This candidate packages the existing Node ESM control plane and TypeScript workspace as one OCI service. The control plane remains bound to `127.0.0.1:4782`; only the Next workspace is exposed on port 3000. `/api/live` proves the UI process is alive and `/api/ready` performs a bounded control-plane status check. Neither endpoint invokes a model.

State is mounted at `/var/lib/mahoraga`. SQLite WAL state, encrypted content, artifacts, cloud-gateway replay nonces, and bounded idle receipts survive process restarts. `scripts/cloud-service.mjs` supervises the control plane and workspace with full-jitter exponential restart delays, an eight-attempt/ten-minute circuit, and a low-duty 30-second idle check that always records `modelInvocations: 0`.

## Owner and command boundary

The browser automatically tries `/api/runtime/session` on page load, then falls back to the encrypted Windows relay only when the cloud session is unavailable. The cloud endpoint does not accept a caller-supplied owner header. A Cloudflare Access-protected Worker must authenticate the pinned owner and add a fresh HMAC assertion. The app exchanges that assertion for an HttpOnly, SameSite=Strict signed session and requires same-origin, CSRF, timestamp, and durable one-use nonce checks for every action.

The gateway has an explicit action allowlist. It cannot execute a caller-supplied command, open a port forward, or select an arbitrary destination. Provider/runtime credentials exist only in Fly secrets. `licensed-approved` remains a one-turn owner action enforced by the existing concurrency, per-turn, and spend ceilings; idle and automatic retry paths never select it.

## Production steps still required

Do not activate Windows production from this candidate.

1. Choose the final Fly app name and region, update `deploy/fly/fly.toml`, then create the app and one encrypted volume in the primary region:
   `fly apps create <app>`
   `fly volumes create mahoraga_state --app <app> --region iad --size 1`
2. Generate four independent secrets: a 32-byte base64 content-vault key, a runtime bearer token of at least 32 characters, a cloud-session HMAC secret of at least 32 characters, and an owner-assertion HMAC secret of at least 32 characters. Set `MAHORAGA_CONTENT_VAULT_MASTER_KEY`, `MAHORAGA_PRIMARY_CODEX_TOKEN`, `MAHORAGA_CLOUD_SESSION_SECRET`, `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`, and `MAHORAGA_CLOUD_OWNER_ID` with `fly secrets set`. Do not place values in Git or `fly.toml`.
3. Deploy the container with `fly deploy --config deploy/fly/fly.toml`. Confirm one Machine remains running while idle, the volume is mounted, and both `/api/live` and `/api/ready` are healthy. The profile explicitly sets `auto_stop_machines = "off"` and `auto_start_machines = false`.
4. Deploy `deploy/cloudflare-owner-gateway` as a Worker. Set its `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET` secret to the same assertion secret, set the exact Fly HTTPS origin, and protect the Worker route with Cloudflare Access restricted to `MAHORAGA_CLOUD_OWNER_ID`.
5. Point the final DNS hostname at the Access-protected Worker, not directly at Fly. Verify a signed owner request returns an Idle session, an unsigned request returns 401, replaying either assertion or action nonce is denied, and a page load reaches Idle without a pasted relay offer.
6. Configure any licensed provider only after its server-side key, model allowlist, hard concurrency, per-turn token ceiling, and dollar ceiling are set. Exercise one explicit owner-approved turn and confirm idle receipts still show zero model invocations.
7. Restart the Fly Machine once and verify the same mounted SQLite/task state returns. Then run exact-head CI and retain its receipts before any deployment promotion. Roll back by deploying the prior image digest; keep Windows at the existing production baseline until the cloud candidate is separately proven.

Fly documents that `auto_stop_machines = "off"` prevents proxy idle stops and that volume mounts require a same-region volume named by `source`. Its secrets are injected as runtime environment variables. See the Fly app configuration, volume, and secrets documentation before applying provider-side changes.

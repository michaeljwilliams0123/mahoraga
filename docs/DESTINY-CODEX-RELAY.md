# Destiny Codex relay

The Destiny Codex relay is an optional ciphertext-only path between the canonical Mahoraga browser application and an outbound-connected loopback runtime. It is not a generic proxy: callers cannot choose a host, port, URL, command, browser target, or filesystem path. The local runtime stays on `127.0.0.1`.

## Trust boundary

- Cloudflare Access authenticates the one owner identity before the browser WebSocket reaches the Worker.
- `MAHORAGA_OWNER_IDENTITY` contains the exact Access-authenticated owner identity.
- `MAHORAGA_WORKSPACE_ORIGIN` contains the canonical HTTPS workspace origin allowed to pair remotely. Repository visibility and workspace hosting are independent; the configured origin is the authorization anchor.
- `MAHORAGA_LEGACY_WORKSPACE_ORIGIN` is optional and exists only for a bounded migration window. When present, that exact HTTPS origin is additionally allowed to pair; when absent, the deployment script explicitly deletes any stale Worker secret so legacy trust closes rather than lingering.
- `MAHORAGA_LOCAL_RELAY_TOKEN` is a high-entropy Worker secret that authenticates only the outbound local WebSocket. Configure the same value on the runtime as `MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN`; never place it in a pairing offer, browser asset, log, or commit.
- `RELAY_SESSIONS` is the Durable Object namespace binding; it is configuration, not user input.
- Deploy credentials belong only in a protected deployment environment. Recommended secret names are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never commit their values or expose them to the browser application.
- The browser connects only to `wss://mahoraga-relay.mahoraga-mjw0123.workers.dev`. Change that origin only through a reviewed source and CSP update.

The relay sees owner/origin routing metadata, device/pairing/session identifiers, counters, IVs, and ciphertext. It never receives conversation plaintext, model responses, provider credentials, local paths, tool inputs, or raw connector/plugin results.

## Cryptographic protocol

Pairing uses ephemeral P-256 ECDH. Both peers derive an AES-256-GCM key with HKDF-SHA-256 over the exact protocol version, pairing ID, eight-character code, and expiry. Each authenticated frame binds protocol, session, direction, and a strictly increasing counter as additional data. Replayed, expired, reordered, or modified frames fail closed.

The public pairing offer expires in at most five minutes. Treat it as short-lived public metadata, show it only to the owner, and discard both ephemeral private keys when the session is revoked or expires.

The socket wire contract is fixed: the Access-authenticated browser connects to `/pair`; the outbound runtime connects to `/pair/local` with the fixed `mahoraga-local-v1` protocol and the local relay secret in a WebSocket subprotocol. A trusted Mahoraga twin may connect to `/pair/twin` with the fixed `mahoraga-twin-v1` protocol and the same protected relay token. Both peers send an `action` envelope and never send a bare frame. The local peer sends `pair-local` with the device ID, pairing ID, code, and local public key. The browser sends `pair-remote` with the same pairing ID, code, and its public key. Once both proofs are accepted, `forward` envelopes carry `{sessionId,from,frame}`; the Worker delivers the ciphertext frame only to the opposite role and returns a bounded acknowledgement. A local reconnect sends `reattach-local` for the same device and session before replaying only counters not yet accepted. `revoke-device` invalidates the Durable Object session and closes both sockets. The assigned session ID is returned by the Worker and is used in frame AAD by both peers.

## Fixed limits

The reference broker defaults to three paired devices, 65,536 bytes per frame, 120 frames per minute, a 30-minute session, and a five-minute reconnect buffer. It stores ciphertext frames only for reconnect replay. The runtime and UI must apply their lower request, response, event, execution, and provider limits as well.

## Deploy

1. Create a Cloudflare Access application for the exact relay hostname and restrict it to the owner identity.
2. Create the `RELAY_SESSIONS` Durable Object binding and deploy `relay/cloudflare-worker.mjs` together with `relay/core.mjs` using the pinned `relay/wrangler.toml` from the attested `mahoraga-relay-<version>.zip` release asset. The local runtime connector is `src/relay-runtime.mjs`; it dispatches decrypted requests only through the authenticated conversation gateway.
3. Supply `MAHORAGA_OWNER_IDENTITY`, `MAHORAGA_WORKSPACE_ORIGIN`, `MAHORAGA_LOCAL_RELAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` only through a protected environment, then run `scripts/configure-cloudflare-relay.ps1`. The script synchronizes the Worker secrets with pinned Wrangler. Set `MAHORAGA_LEGACY_WORKSPACE_ORIGIN` only while a previous workspace host must coexist with the primary origin; unset it and rerun the script to delete that legacy Worker secret. Configure the same relay token as `MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN` only in the protected environment of the cloud or secondary runtime.
4. Start that runtime with `npm start`. It prints one public, base64url pairing offer and connects outbound; paste the offer into **Connections → Encrypted Windows relay** before its five-minute expiry. The secret itself is never printed.
5. Verify the deployed Worker exposes only `/pair`, `/pair/local`, and `/pair/twin`, requires WebSocket upgrade, rejects the wrong Access identity, origin, and local relay token, and returns 404 for proxy-shaped paths.
6. Pair one disposable device, exchange an encrypted canary frame in each direction, force one local reconnect and confirm counter-bounded replay, reject a replayed counter, then revoke the device.

No repository workflow deploys the relay automatically. Packaging and provenance are automated; live hosting remains blocked until the protected Cloudflare environment, Access policy, DNS, and credentials exist.

## Private-repository cutover

GitHub repository visibility is not an authority signal for Microsoft 365, Copilot Studio, Dataverse, or the relay. Before changing repository visibility, set `MAHORAGA_WORKSPACE_ORIGIN` to the workspace host that will remain canonical after the cutover and verify the encrypted relay canary from that origin. If GitHub Pages must overlap temporarily, set its origin explicitly as `MAHORAGA_LEGACY_WORKSPACE_ORIGIN`; remove that value and rerun the configurator as soon as the replacement workspace is proven. Never rely on a hard-coded or implicit Pages exception.

## Operations and privacy

Log fixed error codes and bounded counts only. Do not log WebSocket message bodies, ciphertext, public offers, owner email addresses, IP addresses, headers, or decrypted data. Monitor session count, rejected authentication/origin checks, frame-size/rate-limit failures, canary state, and deployment version without correlating conversation content.

Use the UI’s Revoke control or the broker’s `revokeDevice` operation to remove a device. Rotate the Access policy and deployment credential if ownership changes. A five-minute reconnect does not restore a revoked or expired device.

## Canary and rollback

After deployment, confirm the exact artifact digest and Worker version, run the owner/origin rejection checks, perform the bidirectional encrypted canary, and verify replay rejection. If any canary fails, keep runtime pairing disabled, revoke affected sessions, and roll back to the last attested relay artifact. Do not promote a replacement workspace origin until the rollback check also passes.

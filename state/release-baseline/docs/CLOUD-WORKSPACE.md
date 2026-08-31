# Mahoraga Cloud Workspace

`cloud/` is the canonical Mahoraga conversation-first workspace. GitHub Pages publishes those files, and the loopback runtime snapshots and serves the same asset bytes. The interface accepts one natural-language request, selects a fixed transport, replays content-free run events, supports cancellation and retry, and shows capability or improvement state.

## Transport selection

The application probes the same-origin API. On the Windows host, the localhost runtime remains bound to `127.0.0.1` and the page uses relative authenticated `/api/v2/*` routes. On Pages, the page starts in offline preview and has not dispatched the request unless the owner pairs the exact encrypted relay at `wss://relay.mahoraga.app`.

There is no URL, hostname, port, command, or transport field for callers to edit. Offline preview emits an explicit `offline-preview-not-dispatched` terminal event. It never displays a false running, verified, or deployed state.

## Browser privacy

- Conversation plaintext exists only in DOM and JavaScript memory for the current tab.
- The application uses no local storage, session storage, IndexedDB, browser token, PAT, or platform API key.
- Run persistence, relay metadata, repository coordination, and public telemetry are content-free.
- Remote event values render through DOM text nodes, never HTML injection.
- Read-only repository telemetry comes from GitHub’s public REST API when repository visibility allows it.
- Credentials, private chats, personal documents, model responses, and raw connector/plugin payloads never enter the public repository or Pages build.

## Execution and relay

Direct runs use the runtime-owned gateway for authenticated intake, same-origin mutation checks, SSE replay, cancellation, capability projection, and improvement status. The paired relay uses ephemeral P-256 ECDH, HKDF-SHA-256, AES-256-GCM, direction-bound monotonic counters, fixed origin and owner checks, and ciphertext-only reconnect replay.

See `docs/DESTINY-CODEX-RELAY.md` for deployment, pairing, revocation, limits, canary, and rollback procedures. Packaging the relay does not deploy it; hosting stays blocked until the protected environment, Cloudflare Access policy, DNS, and credentials exist.

## Deployment

`.github/workflows/pages.yml` checks out the exact event SHA, verifies it against `git rev-parse HEAD`, and publishes only `cloud/`. Permissions are limited to repository read, Pages write, and OIDC. Every remote Action is pinned to a full commit SHA. GitHub Pages cannot set repository-controlled response headers, so the HTML contains the exact CSP while the loopback server also sends it as a response header.

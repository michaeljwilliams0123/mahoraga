# Bridge, Brain, UI, and Provider Admission Design

## Goal
Make the production Mahoraga workspace reconnect to its paired runtime after the first secure pairing, while preserving the zero-Codex default and preventing any silent licensed or paid fallback.

## Current failures
1. The browser relay can pair but cannot remotely reattach after reload; only the local runtime has `reattach-local`.
2. The production UI always sends `creditPolicy: "zero-codex"`.
3. Ordinary questions classify to `assistant.respond`, whose currently healthy worker is the Codex CLI-backed `question-model` with `costClass: "licensed-cloud"`.
4. The runtime therefore correctly returns `zero-credit-provider-unavailable` for ordinary questions despite the brain itself being healthy.

## Selected approach
Use durable browser reattach plus strict-first provider admission.
- Preserve `zero-codex` as the automatic/default policy.
- Automatically admit only verified zero-dollar/local/deterministic providers.
- Never relabel the Codex-backed question model as zero-credit.
- Add an explicit owner opt-in policy for a licensed answer on a turn when no zero-credit generator is available.
- Persist only relay-scoped reconnect material; never persist GitHub, provider, runtime bearer, or API credentials in the browser.

## Relay architecture
The existing Cloudflare relay remains the broker and Durable Object state authority.
- Initial pairing remains P-256 ECDH and AES-GCM.
- The relay issues a high-entropy remote resume credential during successful `pair-remote`.
- The broker stores only a SHA-256 digest of that resume credential alongside the session.
- The browser stores `sessionId`, `deviceId`, the non-extractable AES CryptoKey, receive/send counters, and the resume credential in IndexedDB under the canonical Mahoraga origin.
- A new `reattach-remote` action validates owner, allowed origin, session/device identity, unexpired paired state, and the resume-credential digest before assigning the remote socket role.
- Successful reattach resumes replay from the browser's stored receive counter.
## Browser lifecycle
On page load, the workspace first attempts `RuntimeRelay.resume()`.
- If IndexedDB contains a valid, unexpired relay session, state progresses `Connecting -> Idle` without pasted input.
- If resume is rejected, missing, expired, or cryptographically unusable, reconnect state is cleared and the UI falls back to the existing secure pairing flow.
- A manual revoke clears the browser reconnect record and revokes the device at the relay.
- Browser close/reload does not revoke the session.
- Session expiry remains bounded by the relay's existing TTL; this design does not create permanent browser trust.

## Provider admission
Introduce three explicit chat policies:
- `zero-codex`: strict existing behavior. Deterministic/local-model/verified-zero generation only; no Codex or metered fallback.
- `licensed-approved`: owner-authorized licensed `assistant.respond` for this one turn only. This may use `question-model`, but cannot authorize `codex.execute`, `self.evolve`, repository mutation, or any action capability; routing health, data-class, concurrency, and capability canaries still apply.
- `standard`: retained for existing authenticated internal callers; the public workspace does not silently choose it.

The production workspace always sends `zero-codex` first. If the runtime returns `zero-credit-provider-unavailable`, the UI exposes a concise owner action to retry that exact message with `licensed-approved`. No automatic retry occurs. A future verified local/open-weight provider immediately makes the same zero-Codex request succeed without UI changes.

## UI states
Keep the simple Mahoraga One presentation:
- `Connecting`: trying stored relay reattach.
- `Idle`: relay connected and no active work.
- `Awake`: an accepted task/objective is active.
- `Degraded`: relay connected but a requested lane is unavailable or provider admission is blocked.
- `Offline`: no relay session and no resumable pairing.

The licensed opt-in appears only after an actual zero-credit rejection and is hidden otherwise.
## Security and failure handling
- Resume credentials are relay-scoped, random, bounded by session expiry, and stored hashed server-side.
- Reattach requires the same authenticated owner and allowed production origin as initial remote pairing.
- A stolen session identifier alone is insufficient to reattach.
- Invalid resume attempts do not downgrade to licensed execution and do not reveal session existence beyond bounded relay errors.
- Browser persistence failures degrade to manual pairing; they do not disable revocation or weaken crypto.
- Relay counter/replay protections remain authoritative across reconnect.
- `licensed-approved` never changes the zero-Codex selector and cannot be inferred from a failed zero-credit request.

## Files and boundaries
Expected implementation surface:
- `relay/core.mjs`: remote resume credential digest and `reattachRemote` broker operation.
- `relay/cloudflare-worker.mjs`: bounded `reattach-remote` message handling.
- `cloud-app/lib/runtime-relay.ts`: IndexedDB-backed relay session persistence, `resume()`, and reconnect/replay behavior.
- `cloud-app/components/workspace.tsx` and chat UI: startup resume states and explicit licensed retry action.
- `src/server.mjs`: admit the new explicit `licensed-approved` policy without weakening `zero-codex`.
- Tests in relay, runtime chat, and cloud-app contract suites.
- Documentation and release-baseline copies only where verification requires them.

## Verification
Tests must demonstrate:
1. Initial pair produces a resumable remote session without exposing runtime/provider credentials.
2. Browser reload can reattach with the stored relay credential and AES key.
3. Wrong owner, origin, device, session, or resume credential fails closed.
4. Expired/revoked sessions clear browser reconnect state and fall back to manual pairing.
5. `zero-codex` still returns `409 zero-credit-provider-unavailable` for a Codex-only answer path.
6. `licensed-approved` can route a healthy licensed `assistant.respond` worker only after explicit request.
7. Production workspace never auto-retries a zero-credit failure as licensed.
8. Existing deterministic zero-Codex tasks remain unchanged.
9. Full root and cloud-app verification pass before release consideration.

## Deployment constraint
GitHub Pages remains a static Next.js export, so reconnect state and WebSocket behavior must be client-side. Cloudflare Durable Object relay state remains the server-side persistence boundary. No Next.js server-only session dependency is introduced.
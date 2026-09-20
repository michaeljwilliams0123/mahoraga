# GitHub Pages Owner Bridge and Routing Settlement Design

Date: 2026-09-20
Status: owner-approved direction; implementation tracked in PR #630

## Intent

Keep `https://michaeljwilliams0123.github.io/mahoraga/` as the published Mahoraga browser workspace while preserving Railway `mahoraga-runtime-main` as the current server-capable runtime. The Pages workspace must support the same four-digit owner sign-in experience as the Railway workspace without putting runtime credentials, the owner session cookie, PIN hashes, server secrets, or provider tokens into GitHub Pages.

The same tranche also reconciles the browser task lifecycle with the runtime so `waiting` states such as `routing-changed` cannot leave Mahoraga visually or operationally stuck in `Awake`.

## Constraints

- GitHub Pages is a static origin and cannot execute Next.js route handlers.
- The existing Railway owner cookie is `HttpOnly; Secure; SameSite=Strict` and remains Railway-origin only.
- The Pages solution must work on mobile Safari without assuming third-party cookies are available in an embedded frame.
- Existing same-origin owner gateway authorization remains fail-closed.
- No automatic paid-provider fallback is added.
- Recovery pairing remains a separate explicit recovery mechanism and continues to require a complete cryptographic pairing offer.
- GitHub `main` remains source authority; runtime/deployment readiness is separately verified.

## Architecture

### 1. Railway-origin owner bridge frame

Railway serves a dedicated bridge document from a server-only route excluded from the Pages static export. The Pages workspace creates this document in an isolated frame.

The bridge frame:

- accepts messages only when `event.origin` exactly equals the configured Pages origin and `event.source` is its parent;
- receives only a narrow versioned message contract;
- performs owner login and runtime requests from the Railway origin;
- keeps all authenticated bridge-session material inside the Railway-origin JavaScript realm;
- never sends its session token, owner cookie, CSRF material, PIN hash, server secret, or provider credential to the Pages parent;
- returns only sanitized success/error payloads required by the workspace.

The frame response is protected with a route-specific CSP whose `frame-ancestors` contains only the exact Pages origin. The general `X-Frame-Options: DENY` policy is retained for every other surface and is intentionally not applied to this single bridge document.

### 2. Cookie-independent bridge session

The bridge must not rely on the existing `SameSite=Strict` owner cookie being sent from an embedded cross-site frame. Instead:

1. Pages sends the four-digit PIN to the already-loaded Railway bridge frame over the exact-origin message channel.
2. The frame POSTs the PIN to a same-origin bridge-login route.
3. The server reuses the existing PIN verification and lockout policy.
4. On success the server issues a short-lived, signed bridge session bound to the owner and bridge protocol.
5. The bridge session is returned only to the Railway frame and retained in memory there.
6. Subsequent bridge requests include that session plus the existing replay envelope semantics (nonce + timestamp + CSRF-equivalent proof).
7. The Pages parent never receives or persists the session material.

This is intentionally separate from the normal Railway UI cookie session. The normal cookie remains unchanged and `HttpOnly; SameSite=Strict`.

### 3. Versioned message contract

Parent-to-frame messages are restricted to a bounded schema such as:

- `bridge.status`
- `bridge.login`
- `bridge.action`
- `bridge.artifact`
- `bridge.disconnect`

Each request contains a random request ID and protocol version. `bridge.action` accepts only the same current cloud action allowlist already enforced by `/api/runtime/action`. The bridge cannot accept caller-selected URLs, executables, provider credentials, authorization headers, or arbitrary HTTP requests.

The frame replies with the same request ID and either a sanitized result or a public error code. Raw exceptions, headers, cookies, tokens, PINs, and request bodies are never echoed.

### 4. Browser transport integration

`RuntimeRelay` gains a bridge transport only when a validated public bridge origin is present in the static build configuration.

Startup order on Pages:

1. Load the bridge frame.
2. Ask for bridge status.
3. If the frame has an authenticated in-memory bridge session, attach and request capabilities.
4. Otherwise expose the existing four-digit owner-PIN card.
5. On successful PIN entry, authenticate through the frame and continue on the same workspace without interpreting the PIN as a relay pairing offer.
6. If the bridge is unavailable, fail closed and leave explicit Recovery connection available.

The Pages parent does not perform authenticated cross-origin `fetch` calls. All authenticated HTTP stays inside the Railway frame.

### 5. Public bridge-origin configuration

The bridge origin is public routing metadata, not a credential. Pages receives it through a dedicated public build variable. Validation requires:

- HTTPS only;
- origin-only value with no path/query/fragment;
- exact allowlisting against the intended bridge origin;
- no runtime secrets in the generated artifact.

Static artifact inspection is updated to distinguish the allowed public bridge origin from forbidden secret/runtime-auth material. Direct embedded credentials and generic runtime API URLs remain forbidden.

## Task lifecycle settlement

The canonical runtime task lifecycle is:

- active/busy: `queued`, `claimed`, `running`, `verifying`;
- settled/non-busy: `waiting`, `waiting_for_user`, `completed`, `failed`, `cancelled`;
- unknown states: fail closed rather than inventing semantics.

The browser tracks the task created for the submitted request so historical tasks cannot supply the wrong terminal/wait reason.

`waiting` with `errorCode=routing-changed` must:

- clear the active task;
- stop the working spinner and `Awake` state;
- terminate the polling loop;
- surface concise retry guidance;
- preserve the conversation and objective;
- perform no automatic paid fallback.

`waiting_for_user` must stop the spinner while retaining the worker's latest question. `completed` must terminate normally.

## Security boundaries

- Owner PIN is never committed, logged, written to receipts, or emitted into static assets.
- PIN hash and login/session secrets stay server-side.
- Bridge session material exists only inside the Railway-origin frame and server.
- The Pages parent gets no bearer token or cookie value.
- Exact origin and exact source-window checks are mandatory for every message.
- Unknown message types/fields fail closed.
- Replay protection remains nonce/timestamp based and durable server-side.
- Action allowlists remain narrower than arbitrary HTTP or shell execution.
- Existing cost/quota/authority routing gates remain authoritative after bridge authentication.

## Failure behavior

- Wrong PIN: existing owner-login error and lockout behavior; no session issued.
- Bridge unavailable: `cloud-session-unreachable`; Recovery connection remains optional.
- Bridge protocol mismatch: `cloud-runtime-contract-incompatible`; no fallback authority is invented.
- Expired bridge session: `cloud-owner-auth-required`; Pages returns to owner sign-in.
- Invalid origin/source/message schema/replay: request rejected and no runtime action executed.
- Runtime task enters `waiting`: UI settles instead of spinning.

## Required tests

### Routing settlement

1. Only queued/claimed/running/verifying are active.
2. waiting/waiting_for_user/completed/failed/cancelled are settled.
3. `routing-changed` immediately stops polling and surfaces retryable copy even when an assistant message already exists.
4. `waiting_for_user` clears busy state and preserves the latest prompt.
5. `completed` terminates without requiring fictional `succeeded` state.
6. Unknown future states fail closed.
7. Settled state suppresses further duplicate polling.

### Pages bridge

1. Pages displays the owner-PIN path instead of feeding four digits to recovery pairing.
2. Frame rejects every origin except the exact Pages origin.
3. Frame rejects messages from a non-parent source window.
4. Message schemas reject extra fields, unknown actions, arbitrary URLs, and caller-supplied auth headers.
5. Correct PIN creates a bridge session visible only to the Railway frame.
6. Wrong PIN and rate limiting reuse existing owner-login policy.
7. Railway owner cookie remains `HttpOnly; Secure; SameSite=Strict` and is never serialized to Pages.
8. Bridge session expires and fails closed.
9. Replay of bridge mutation envelope is rejected.
10. Static artifact contains no PIN, PIN hash, owner-login secret, cloud-session secret, core/provider token, bridge session, CSRF material, or authorization value.
11. Recovery pairing still requires the complete cryptographic pairing offer.
12. Pages static export, cloud-app tests/typecheck, and exact-head Verify remain green.

## Rollout

1. Land the isolated routing-settlement fix first so current Railway users are not blocked by the larger bridge tranche.
2. Implement bridge server contract and tests on PR #630.
3. Implement Pages bridge client and owner-login UI integration.
4. Verify static artifact and both CI platforms at exact PR head.
5. Validate Railway bridge behavior on a non-production/PR deployment.
6. Merge only after required checks pass.
7. Publish Pages from exact merged `main` and explicitly promote Railway to the same intended source SHA before claiming the cross-origin experience is live.

# GitHub Pages Owner Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub Pages the published Mahoraga workspace with a four-digit owner sign-in that executes through a Railway-origin bridge, while preserving fail-closed runtime authority and preventing `waiting` tasks from leaving the UI stuck in `Awake`.

**Architecture:** GitHub Pages remains static. A narrowly scoped Railway bridge frame owns the authenticated bridge session in its own origin and exposes only a versioned `postMessage` contract to Pages. Runtime actions remain allowlisted and flow to the existing Conversation Gateway; the Pages parent never receives cookies, bridge-session tokens, CSRF material, or provider credentials. The already-isolated `routing-changed` settlement fix ships independently first and is then reconciled into PR #630.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 7.0.2, Node >=24, Web Crypto/browser `postMessage`, Node `crypto`, existing SQLite replay store, GitHub Actions Pages export, Railway runtime.

**Spec:** `docs/superpowers/specs/2026-09-20-pages-owner-bridge-routing-settlement-design.md`

## Global Constraints

- GitHub Pages remains a static origin and does not execute Next.js route handlers.
- Railway remains the server-capable runtime during migration.
- The existing Railway owner cookie remains `HttpOnly; Secure; SameSite=Strict` and Railway-origin only.
- The Pages bridge must work on mobile Safari without relying on third-party cookies.
- The Pages parent must never receive owner cookies, bridge-session tokens, PIN hashes, server secrets, CSRF material, provider tokens, or authorization headers.
- Existing same-origin owner gateway authorization remains fail-closed.
- No automatic paid-provider fallback is added.
- Recovery pairing stays separate and continues to require a complete cryptographic pairing offer.
- GitHub `main` is source authority; deployment readiness is separately verified.
- Runtime actions remain bounded to the current cloud action allowlist; no arbitrary URL, shell command, provider, executable, or authorization header may be caller-selected.
- Testing is intentionally lightweight and focused: targeted unit/contract tests + typecheck + existing required GitHub CI; no Codex review loop.

## Review Focus

1. **Mobile Safari / blocked third-party cookies:** owner sign-in must work because the bridge session is returned only to the Railway frame and retained in frame memory, not because a Railway cookie is available inside an iframe. Covered in Task 3 bridge-frame contract tests.
2. **Origin confusion:** a syntactically valid message from any origin or source window other than the exact configured Pages parent must be ignored. Covered in Task 3 origin/source tests.
3. **Authority expansion by payload:** `bridge.action` must reject unknown action types and payload attempts containing arbitrary URLs or caller-supplied authorization headers before core dispatch. Covered in Task 2 shared allowlist and Task 3 message-schema tests.
4. **Session replay / stale frame:** expired bridge sessions and replayed mutation envelopes must fail closed and force owner re-authentication without falling through to relay or paid execution. Covered in Task 2 authorization tests.
5. **Static artifact leakage:** generated Pages assets must contain only the validated public bridge origin and no PIN/hash/session/core/provider secrets. Covered in Task 5 static artifact inspection tests.

---

### Task 1: Ship the isolated routing-settlement repair

**Files:**
- Existing PR: `#631` (`fix/routing-changed-stuck-ui`)
- Reconcile into: `ui/pages-workspace-7.0.0-alpha.2`
- Test: `cloud-app/test/task-lifecycle-contract.test.mjs`

**Interfaces:**
- Consumes: runtime task statuses from the existing core database contract.
- Produces: `runtimeTaskPhase(status): "active" | "settled" | "unknown"` and polling behavior that settles `waiting`, `waiting_for_user`, and `completed`.

- [ ] **Step 1: Verify the focused lifecycle contract on PR #631**

Run through the existing GitHub Actions exact head for `5673d80c3a3b593b55a72c7b21bf4ea672590817` and require both `Verify Mahoraga` platform jobs plus `Export Mahoraga Workspace to Pages` to complete successfully. Do not trigger Codex review.

- [ ] **Step 2: Merge only after required checks are green**

Use squash merge with the expected PR head SHA:

```text
PR: #631
Expected head: 5673d80c3a3b593b55a72c7b21bf4ea672590817
Method: squash
Title: fix(ui): stop routing-changed tasks from spinning forever
```

- [ ] **Step 3: Reconcile PR #630 with the new main**

Compare `main...ui/pages-workspace-7.0.0-alpha.2`. If the lifecycle files are identical after #631 merges, keep the branch content unchanged and let the duplicate diff collapse naturally; if Git reports conflicts, merge current `main` into the branch without force-push and preserve the #631 lifecycle implementation byte-for-byte.

- [ ] **Step 4: Re-run only the focused lifecycle checks after reconciliation**

Run:

```bash
cd cloud-app
npm run typecheck
node --test test/task-lifecycle-contract.test.mjs
```

Expected: PASS with `waiting`, `waiting_for_user`, and `completed` settled; `routing-changed` produces retry guidance and no repeated polling.

---

### Task 2: Add a cookie-independent Railway bridge authorization contract

**Files:**
- Create: `cloud-app/lib/pages-owner-bridge.ts`
- Create: `cloud-app/lib/cloud-runtime-action.ts`
- Modify: `cloud-app/lib/cloud-owner-gateway.ts`
- Modify: `cloud-app/app/api/runtime/action/route.ts`
- Create: `cloud-app/app/api/runtime/pages-bridge/login/route.ts`
- Create: `cloud-app/app/api/runtime/pages-bridge/action/route.ts`
- Create: `cloud-app/app/api/runtime/pages-bridge/artifacts/route.ts`
- Test: `cloud-app/test/pages-owner-bridge-server.test.mjs`

**Interfaces:**
- Consumes: existing `verifyOwnerLoginPin`, owner-login lockout state, `coreRequest`, `coreArtifactRequest`, `MAX_FILE_BYTES`.
- Produces:
  - `verifyOwnerLoginAttempt(request: Request, suppliedPin: unknown): { ownerId: string }`
  - `issuePagesBridgeSession(ownerId: string, env?: NodeJS.ProcessEnv): { token: string; csrf: string; expiresAt: number }`
  - `authorizePagesBridgeMutation(request: Request, env?: NodeJS.ProcessEnv): { ownerId: string; sessionId: string }`
  - `dispatchCloudRuntimeAction(type: string, payload: Record<string, unknown>): Promise<{ status: number; body: unknown }>`
  - one shared immutable action allowlist used by both same-origin and bridge routes.

- [ ] **Step 1: Write the failing server contract tests**

Create tests that assert the exact public contract:

```js
assert.equal(PAGES_BRIDGE_PROTOCOL_VERSION, 1);
assert.equal(validatePagesOrigin("https://michaeljwilliams0123.github.io"), "https://michaeljwilliams0123.github.io");
assert.throws(() => validatePagesOrigin("http://michaeljwilliams0123.github.io"));
assert.throws(() => validatePagesOrigin("https://michaeljwilliams0123.github.io/path"));
assert.equal(ALLOWED_CLOUD_RUNTIME_ACTIONS.has("chat"), true);
assert.equal(ALLOWED_CLOUD_RUNTIME_ACTIONS.has("arbitrary-http"), false);
```

Also prove bridge session verification rejects expiry, signature tampering, replayed nonce, malformed request timestamp, and missing CSRF proof.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-server.test.mjs
```

Expected: FAIL because the bridge contract modules do not exist yet.

- [ ] **Step 3: Extract one shared cloud action policy**

Create `cloud-runtime-action.ts` with the current exact action set:

```ts
export const ALLOWED_CLOUD_RUNTIME_ACTIONS = new Set([
  "capabilities",
  "chat",
  "tasks",
  "messages",
  "message-content",
  "task-action",
  "composio-github-repository",
  "operations-snapshot",
  "operations-action",
] as const);

export async function dispatchCloudRuntimeAction(type: string, payload: Record<string, unknown>) {
  if (!ALLOWED_CLOUD_RUNTIME_ACTIONS.has(type as never)) {
    throw Object.assign(new Error("cloud-action-not-allowed"), { status: 400 });
  }
  const response = await coreRequest(type, payload);
  return {
    status: response.status,
    body: await response.json().catch(() => ({ error: "cloud-core-response-invalid" })),
  };
}
```

Update `/api/runtime/action` to call this helper so bridge and same-origin paths cannot drift.

- [ ] **Step 4: Refactor owner PIN verification without changing cookie behavior**

Move the shared verification/lockout sequence from `establishOwnerLoginSession` into:

```ts
export function verifyOwnerLoginAttempt(request: Request, suppliedPin: unknown) {
  if (!hasTrustedRequestOrigin(request)) throw gatewayError("cloud-same-origin-required", 403);
  const existingRetryAfter = ownerLoginRequestRetryAfter(request);
  if (existingRetryAfter > 0) throw gatewayError("cloud-owner-login-rate-limited", 429, existingRetryAfter);
  const login = verifyOwnerLoginPin(suppliedPin);
  if (!login.ok) {
    if (login.code === "cloud-owner-login-required") {
      const retryAfter = recordOwnerLoginFailure(request);
      if (retryAfter > 0) throw gatewayError("cloud-owner-login-rate-limited", 429, retryAfter);
    }
    throw gatewayError(login.code, login.code === "cloud-owner-login-required" ? 401 : 503);
  }
  clearOwnerLoginFailures(request);
  return { ownerId: required("MAHORAGA_CLOUD_OWNER_ID") };
}
```

Then make `establishOwnerLoginSession` call it and issue the existing cookie exactly as before.

- [ ] **Step 5: Implement signed in-frame bridge sessions**

In `pages-owner-bridge.ts`, issue an opaque signed token with `{ ownerId, sessionId, protocolVersion: 1, expiresAt }`. Use `MAHORAGA_CLOUD_SESSION_SECRET`, a short bridge TTL (30 minutes), constant-time signature comparison, and the existing durable nonce database for mutation replay protection. Require headers:

```text
x-mahoraga-bridge-session
x-mahoraga-bridge-csrf
x-mahoraga-request-nonce
x-mahoraga-request-timestamp
```

Do not use or modify the normal owner cookie.

- [ ] **Step 6: Implement bridge login/action/artifact routes**

`login/route.ts` accepts only `{ ownerPin: string }`, calls `verifyOwnerLoginAttempt`, then returns `{ authenticated: true, bridgeSession, csrf, expiresAt, protocolVersion: 1 }` with `Cache-Control: no-store`.

`action/route.ts` calls `authorizePagesBridgeMutation`, rejects payloads containing top-level `url`, `authorization`, `headers`, `provider`, or `executable` fields, then calls `dispatchCloudRuntimeAction`.

`artifacts/route.ts` calls `authorizePagesBridgeMutation`, reads at most `MAX_FILE_BYTES`, normalizes file name/MIME exactly like the existing artifact route, and returns only `{ artifactId }`.

- [ ] **Step 7: Run the server bridge tests GREEN**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-server.test.mjs test/owner-login-contract.test.mjs
npm run typecheck
```

Expected: PASS; existing cookie login tests remain unchanged.

- [ ] **Step 8: Commit the server contract**

Commit message:

```text
feat(cloud): add bounded Pages owner bridge contract
```

---

### Task 3: Serve an exact-origin Railway bridge frame

**Files:**
- Create: `cloud-app/app/api/runtime/pages-bridge/frame/route.ts`
- Create: `cloud-app/lib/pages-owner-bridge-frame.ts`
- Modify: `cloud-app/next.config.ts`
- Test: `cloud-app/test/pages-owner-bridge-frame.test.mjs`

**Interfaces:**
- Consumes: Task 2 bridge routes and `validatePagesOrigin`.
- Produces: an embeddable Railway-origin HTML frame implementing protocol version 1 with `bridge.status`, `bridge.login`, `bridge.action`, `bridge.artifact`, and `bridge.disconnect`.

- [ ] **Step 1: Write frame contract tests before implementation**

Tests must assert the generated frame script contains all of these guards:

```js
assert.match(html, /event\.origin !== PAGES_ORIGIN/);
assert.match(html, /event\.source !== window\.parent/);
assert.match(html, /protocolVersion !== 1/);
assert.match(html, /bridge\.status/);
assert.match(html, /bridge\.login/);
assert.match(html, /bridge\.action/);
assert.match(html, /bridge\.artifact/);
assert.match(html, /bridge\.disconnect/);
assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie/);
```

Also assert the frame route CSP contains exactly one configured Pages origin in `frame-ancestors`, has `default-src 'none'`, and does not emit `X-Frame-Options: DENY`.

- [ ] **Step 2: Run frame tests RED**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-frame.test.mjs
```

Expected: FAIL because the frame module/route does not exist.

- [ ] **Step 3: Implement the in-memory bridge frame**

The generated frame JavaScript keeps these values only in its closure:

```js
let bridgeSession = null;
let bridgeCsrf = null;
let bridgeExpiresAt = 0;
```

For every message:

```js
if (event.origin !== PAGES_ORIGIN || event.source !== window.parent) return;
if (!isExactBridgeRequest(event.data)) return;
```

`bridge.login` POSTs the PIN to the same-origin bridge login route and stores returned bridge material only in the frame closure. `bridge.action` and `bridge.artifact` attach the bridge headers internally. Replies contain only `{ protocolVersion, requestId, ok, result? , error? }` and use `window.parent.postMessage(reply, PAGES_ORIGIN)`.

- [ ] **Step 4: Make only the bridge frame embeddable**

Change `next.config.ts` so normal routes retain the existing `X-Frame-Options: DENY` and `frame-ancestors 'none'`, while `/api/runtime/pages-bridge/frame` receives a dedicated CSP:

```text
default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors https://michaeljwilliams0123.github.io; base-uri 'none'; form-action 'none'
```

The configured Pages origin comes from `MAHORAGA_PAGES_ORIGIN`, validated server-side; default it to `https://michaeljwilliams0123.github.io` only when unset.

- [ ] **Step 5: Run frame tests GREEN**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-frame.test.mjs
npm run typecheck
```

Expected: PASS, including exact-origin/source and storage-negative assertions.

- [ ] **Step 6: Commit the frame boundary**

Commit message:

```text
feat(cloud): add isolated Pages bridge frame
```

---

### Task 4: Add a bridge transport to RuntimeRelay and reuse the existing owner-PIN UI

**Files:**
- Create: `cloud-app/lib/pages-owner-bridge-client.ts`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Test: `cloud-app/test/pages-owner-bridge-client.test.mjs`
- Test: `cloud-app/test/owner-login-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 frame protocol and public `NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN`.
- Produces:
  - `validatePublicBridgeOrigin(value: string | undefined): string | null`
  - `PagesOwnerBridgeClient.attach(): Promise<"authenticated" | "owner-auth-required">`
  - `PagesOwnerBridgeClient.login(pin: string): Promise<void>`
  - `PagesOwnerBridgeClient.call<T>(type: string, payload: Record<string, unknown>): Promise<T>`
  - `PagesOwnerBridgeClient.uploadArtifact(file: File): Promise<{ id: string }>`
  - `RuntimeRelay.loginOwnerPin(pin: string): Promise<void>`

- [ ] **Step 1: Write client validation/contract tests**

Prove HTTPS origin-only configuration and exact target origin:

```js
assert.equal(validatePublicBridgeOrigin("https://mahoraga-runtime-main-production.up.railway.app"), "https://mahoraga-runtime-main-production.up.railway.app");
assert.equal(validatePublicBridgeOrigin("http://mahoraga-runtime-main-production.up.railway.app"), null);
assert.equal(validatePublicBridgeOrigin("https://mahoraga-runtime-main-production.up.railway.app/api"), null);
```

Read `workspace.tsx` and assert owner login delegates to `transport.loginOwnerPin(ownerLoginPin)` instead of calling `/api/runtime/login` directly.

- [ ] **Step 2: Run client tests RED**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-client.test.mjs test/owner-login-contract.test.mjs
```

Expected: FAIL because the client transport does not exist.

- [ ] **Step 3: Implement the Pages bridge client**

Create one hidden iframe with:

```ts
iframe.src = `${bridgeOrigin}/api/runtime/pages-bridge/frame`;
iframe.hidden = true;
iframe.referrerPolicy = "no-referrer";
```

Use random request IDs, exact `targetOrigin = bridgeOrigin`, exact reply-origin/source checks, and a bounded 10-second timeout. Keep no credentials or auth material in the parent.

- [ ] **Step 4: Integrate bridge selection into RuntimeRelay**

Selection order:

```text
1. If a valid public bridge origin is configured and differs from window.location.origin, attach the Pages bridge.
2. Otherwise use the existing same-origin owner session.
3. Only if neither authenticated cloud path is usable, allow the existing encrypted relay recovery path.
```

When the bridge reports `owner-auth-required`, keep the `RuntimeRelay` instance attached to `relay.current` so the existing PIN form can call `loginOwnerPin` without reinterpreting the PIN as a pairing offer.

`call()` and `uploadArtifact()` dispatch through the bridge client when bridge-backed, same-origin routes when cookie-backed, and the encrypted relay only for explicit recovery.

- [ ] **Step 5: Reuse the existing PIN card without cookie-specific copy**

Change the PIN explanation from:

```text
Verified server-side and exchanged only for a secure session cookie.
```

to:

```text
Verified server-side and exchanged only for a secure owner session.
```

Keep the separate `Recovery connection` details section unchanged.

- [ ] **Step 6: Make owner login transport-aware**

Replace direct fetch/reload with:

```ts
const transport = relay.current;
if (!transport) throw new Error("cloud-session-unavailable");
await transport.loginOwnerPin(ownerLoginPin);
const capabilities = await transport.capabilities();
setPairedRelay(transport);
setRuntimeCapabilities(capabilities);
setRelayState("connected");
setOwnerLoginRequired(false);
setOwnerLoginPin("");
```

Same-origin login may still set the normal cookie internally; Pages login remains frame-local.

- [ ] **Step 7: Run client/UI tests GREEN**

Run:

```bash
cd cloud-app
node --test test/pages-owner-bridge-client.test.mjs test/owner-login-contract.test.mjs test/task-lifecycle-contract.test.mjs
npm run typecheck
```

Expected: PASS and recovery pairing remains separate.

- [ ] **Step 8: Commit the browser transport**

Commit message:

```text
feat(ui): route Pages owner sessions through Railway bridge
```

---

### Task 5: Configure Pages export and harden static artifact inspection

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `scripts/build-pages-static.mjs`
- Modify: `test/pages-static-build.test.mjs`
- Test: `cloud-app/test/pages-owner-bridge-client.test.mjs`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN` from the Pages build.
- Produces: a static artifact containing only validated public bridge routing metadata and no secret/authentication material.

- [ ] **Step 1: Extend the Pages build contract test RED**

Require the workflow to inject only public bridge metadata:

```js
assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN/);
assert.doesNotMatch(workflow, /MAHORAGA_CLOUD_OWNER_LOGIN_SECRET/);
assert.doesNotMatch(workflow, /MAHORAGA_CLOUD_OWNER_PIN_HASH/);
assert.doesNotMatch(workflow, /MAHORAGA_CLOUD_SESSION_SECRET/);
assert.doesNotMatch(workflow, /MAHORAGA_PRIMARY_CODEX_TOKEN/);
```

- [ ] **Step 2: Add customizable public bridge origin configuration**

In `.github/workflows/pages.yml` set:

```yaml
NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN: ${{ vars.MAHORAGA_PAGES_BRIDGE_ORIGIN || 'https://mahoraga-runtime-main-production.up.railway.app' }}
```

This is public routing metadata only. Runtime secrets remain absent from Pages CI.

- [ ] **Step 3: Strengthen secret-marker scanning**

Add these markers to `FORBIDDEN_STATIC_MARKERS`:

```text
MAHORAGA_CLOUD_OWNER_LOGIN_SECRET
MAHORAGA_CLOUD_OWNER_PIN_HASH
MAHORAGA_CLOUD_SESSION_SECRET
MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET
MAHORAGA_PRIMARY_CODEX_TOKEN
MAHORAGA_CONTENT_VAULT_MASTER_KEY
mahoraga_cloud_session
x-mahoraga-bridge-session
```

Do not forbid the Railway hostname itself because it is now intentional public bridge routing metadata.

- [ ] **Step 4: Run focused static export tests**

Run:

```bash
node --test test/pages-static-build.test.mjs
cd cloud-app
node --test test/pages-owner-bridge-client.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Build and inspect one actual static artifact**

Run:

```bash
cd cloud-app
MAHORAGA_PAGES_EXPORT=1 \
MAHORAGA_DEPLOYMENT_PROVIDER=github-pages \
MAHORAGA_DEPLOYMENT_ENV=production \
MAHORAGA_DEPLOYMENT_URL=https://michaeljwilliams0123.github.io/mahoraga/ \
NEXT_PUBLIC_HEALTH_ENDPOINT=/mahoraga/api/health.json \
NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN=https://mahoraga-runtime-main-production.up.railway.app \
node ../scripts/build-pages-static.mjs
```

Expected: exit 0; artifact inspection passes and no forbidden markers are found.

- [ ] **Step 6: Commit export hardening**

Commit message:

```text
ci(pages): publish bounded Railway bridge metadata
```

---

### Task 6: Lightweight end-to-end verification, merge, and promotion

**Files:**
- PR: `#630`
- GitHub Pages deployment from merged `main`
- Railway service: `mahoraga-runtime-main`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: merged source, published Pages workspace, Railway bridge runtime at the same intended source head, and exact evidence.

- [ ] **Step 1: Run the focused local/connector verification set**

Run only:

```bash
cd cloud-app
npm run typecheck
node --test \
  test/pages-owner-bridge-server.test.mjs \
  test/pages-owner-bridge-frame.test.mjs \
  test/pages-owner-bridge-client.test.mjs \
  test/owner-login-contract.test.mjs \
  test/task-lifecycle-contract.test.mjs
cd ..
node --test test/pages-static-build.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Require existing GitHub CI at exact PR head**

Require:

```text
Verify Mahoraga / Verify (ubuntu-latest): success
Verify Mahoraga / Verify (windows-latest): success
Export Mahoraga Workspace to Pages / Build and inspect static workspace: success
```

Treat Destiny relay validation as non-required if skipped. Do not request Codex review.

- [ ] **Step 3: Squash merge PR #630 only at the verified exact head**

Use `expected_head_sha` from the final PR snapshot and squash title:

```text
feat(ui): bridge GitHub Pages to bounded Railway owner runtime
```

- [ ] **Step 4: Verify Pages publishes merged main**

Confirm the post-merge Pages workflow uses the merged main SHA and completes `Publish exact-main static workspace`. Do not claim live status from a PR artifact.

- [ ] **Step 5: Promote Railway deliberately to the merged main source**

Because Railway autodeploy is intentionally disabled, trigger or promote the canonical `mahoraga-runtime-main` service from merged `main` using the existing Railway deployment control. Do not create a replacement service. Confirm the resulting deployment source SHA equals the intended merged main SHA.

- [ ] **Step 6: Perform one bounded browser smoke test**

From the published Pages workspace verify only this path:

```text
Pages loads -> owner PIN card appears -> correct PIN authenticates -> Mahoraga becomes connected -> send "status" -> one assistant response or governed waiting state -> no infinite Awake spinner -> disconnect works -> Recovery connection remains separate.
```

Also verify a wrong PIN returns the existing owner-login failure without changing to relay pairing.

- [ ] **Step 7: Record final evidence**

Report exact values:

```text
routing fix PR + merge SHA
bridge PR + final head SHA + merge SHA
Ubuntu Verify conclusion
Windows Verify conclusion
Pages build/publish conclusion + source SHA
Railway deployment ID + source SHA
smoke-test result
remaining blocker, if any
```

No completion claim is allowed unless each claimed item has current evidence.

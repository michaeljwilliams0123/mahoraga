# Bridge, Brain, UI, and Provider Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mahoraga One securely reconnect to its paired runtime after browser reload and preserve zero-Codex-by-default chat while allowing a one-turn licensed answer only after explicit owner approval.

**Architecture:** Extend the existing Cloudflare relay with a hashed remote resume credential and `reattach-remote`; persist only relay-scoped reconnect state in browser IndexedDB; keep `zero-codex` unchanged; add a separate `licensed-approved` chat policy restricted to `assistant.respond`; surface a one-click retry only after a real zero-credit rejection.

**Tech Stack:** Node.js 24, Next.js 16 static export, React 19, TypeScript 7, Web Crypto, IndexedDB, WebSocket, Cloudflare Worker + Durable Object relay, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-bridge-brain-ui-admission-design.md`

## Global Constraints
- GitHub Pages remains a static Next.js export; no Next.js server-only session dependency.
- `zero-codex` must never admit the Codex CLI-backed `question-model` or any metered fallback.
- `licensed-approved` is one-turn and answer-only; it cannot authorize action, build, review, repository mutation, or self-evolution capabilities.
- Browser persistence may contain relay-scoped reconnect material only; never GitHub, provider, runtime bearer, or API credentials.
- Reattach must require authenticated owner, canonical allowed origin, matching session/device, unexpired paired state, and a high-entropy resume credential verified by digest.
- Manual revoke and session expiry must invalidate browser resume state.

---

### Task 1: Add cryptographically bounded remote relay reattach

**Files:**
- Modify: `relay/core.mjs`
- Modify: `relay/cloudflare-worker.mjs`
- Test: `test/relay-core.test.mjs`
- Test: `test/cloudflare-relay-adapter.test.mjs`

**Interfaces:**
- Produces: async `broker.pairRemote(input)` returning normal projection plus `resumeCredential`.
- Produces: async `broker.reattachRemote({ owner, origin, deviceId, sessionId, resumeCredential, socket })`.
- Persisted session field: `remoteResumeDigest: string | null`; raw resume credential is never included in `snapshot()`.

- [ ] **Step 1: Write failing broker tests**

```js
const paired = await broker.pairRemote({ owner, origin, pairingId, code, devicePublicKey: remoteKey });
assert.match(paired.resumeCredential, /^[A-Za-z0-9_-]{43,64}$/);
assert.equal(broker.snapshot().sessions[0].resumeCredential, undefined);
assert.match(broker.snapshot().sessions[0].remoteResumeDigest, /^[A-Za-z0-9_-]{43}$/);
const resumed = await broker.reattachRemote({ owner, origin, deviceId, sessionId: paired.sessionId, resumeCredential: paired.resumeCredential, socket: remote2 });
assert.equal(resumed.paired, true);
await assert.rejects(() => broker.reattachRemote({ owner, origin, deviceId, sessionId: paired.sessionId, resumeCredential: "A".repeat(43), socket: remote3 }), /relay-session-reattach-invalid/);
```

- [ ] **Step 2: Run focused relay tests and verify failure**

Run: `node --test --test-isolation=none test/relay-core.test.mjs test/cloudflare-relay-adapter.test.mjs`
Expected: FAIL because `resumeCredential`, `remoteResumeDigest`, and `reattachRemote` do not exist.
- [ ] **Step 3: Implement minimal broker support**

```js
async pairRemote(input) {
  authorize(input, true);
  const session = sessionFor(pairingIndex.get(input.pairingId));
  // existing proof checks stay intact
  const resumeCredential = randomResumeCredential();
  session.remoteResumeDigest = await sha256Base64Url(resumeCredential);
  session.remotePaired = true;
  if (input.socket) registerSocket({ owner: input.owner, origin: input.origin, sessionId: session.sessionId, side: "remote", socket: input.socket });
  return Object.freeze({ ...projection(session), resumeCredential });
}

async reattachRemote(input) {
  authorize(input, true); prune(); token(input.deviceId, "relay-device-invalid");
  const session = sessionFor(input.sessionId);
  const supplied = await sha256Base64Url(resumeCredential(input.resumeCredential));
  if (session.deviceId !== input.deviceId || !session.remotePaired || !timingSafeTextEqual(session.remoteResumeDigest, supplied)) fail("relay-session-reattach-invalid");
  if (input.socket) registerSocket({ owner: input.owner, origin: input.origin, sessionId: session.sessionId, side: "remote", socket: input.socket });
  return projection(session);
}
```

`randomResumeCredential()` uses `crypto.getRandomValues(new Uint8Array(32))`; `sha256Base64Url()` uses `crypto.subtle.digest("SHA-256", ...)`. Restore accepts `remoteResumeDigest` only when it matches base64url SHA-256 length; legacy sessions restore with `null` and therefore cannot remote-reattach.

- [ ] **Step 4: Add Worker action and negative cases**

```js
} else if (input.action === "reattach-remote") {
  if (request.headers.get("x-mahoraga-relay-role") !== "remote") throw relayMessageError("relay-socket-role-invalid");
  exact(input, ["action", "deviceId", "resumeCredential", "sessionId"]);
  result = await this.broker.reattachRemote({ owner, origin, deviceId: input.deviceId, sessionId: input.sessionId, resumeCredential: input.resumeCredential, socket });
  this.roles.set(socket, { sessionId: result.sessionId, side: "remote" });
  send(socket, { type: "paired", accepted: true, result });
```

Test wrong origin, wrong owner, wrong device, wrong session, wrong resume credential, expired session, and revoked device.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test --test-isolation=none test/relay-core.test.mjs test/cloudflare-relay-adapter.test.mjs`
Expected: PASS.

Commit: `git add relay/core.mjs relay/cloudflare-worker.mjs test/relay-core.test.mjs test/cloudflare-relay-adapter.test.mjs && git commit -m "feat: add secure remote relay reattach"`

---

### Task 2: Persist and resume the encrypted browser relay session

**Files:**
- Create: `cloud-app/lib/relay-session-store.ts`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Create: `cloud-app/test/runtime-relay-resume-contract.test.mjs`

**Interfaces:**
- `loadRelaySession(): Promise<StoredRelaySession | null>`
- `saveRelaySession(record: StoredRelaySession): Promise<void>`
- `clearRelaySession(): Promise<void>`
- `RuntimeRelay.resume(): Promise<{ sessionId: string } | null>`
- Stored record fields: `schemaVersion`, `sessionId`, `deviceId`, `expiresAt`, `resumeCredential`, `key: CryptoKey`, `sendCounter`, `receivedCounter`.
- [ ] **Step 1: Write failing browser contract tests**

```js
assert.match(storeSource, /indexedDB\.open\("mahoraga-relay",\s*1\)/);
assert.match(storeSource, /CryptoKey/);
assert.match(relaySource, /async resume\(\)/);
assert.match(relaySource, /action:\s*"reattach-remote"/);
assert.match(relaySource, /saveRelaySession/);
assert.match(relaySource, /clearRelaySession/);
```

Also assert the workspace source invokes `resume()` during startup and does not persist any string matching `github_pat_|ghp_|AI_GATEWAY_API_KEY|MAHORAGA_PRIMARY_CODEX_TOKEN`.

- [ ] **Step 2: Run cloud-app tests and verify failure**

Run: `npm --prefix cloud-app test`
Expected: FAIL because the session store and `RuntimeRelay.resume()` are absent.

- [ ] **Step 3: Implement IndexedDB store**

Use database `mahoraga-relay`, object store `sessions`, key `primary`. Reject malformed or expired records. Store the non-extractable AES `CryptoKey` through IndexedDB structured cloning; never export the key. `clearRelaySession()` deletes only the relay record.

```ts
export type StoredRelaySession = {
  schemaVersion: 1;
  sessionId: string;
  deviceId: string;
  expiresAt: string;
  resumeCredential: string;
  key: CryptoKey;
  sendCounter: number;
  receivedCounter: number;
};
```

- [ ] **Step 4: Implement `RuntimeRelay.resume()` and persistence**

On successful `pair()`, require `result.resumeCredential` and `result.expiresAt`, then save the record after `sessionId` is replaced with the broker session id. `resume()` loads the record, opens the existing remote WebSocket endpoint, sends `reattach-remote`, requires a successful paired response for the same session/device, restores counters, requests replay to `remote`, and returns the session id. On any resume rejection or crypto/state validation error, close the socket, clear the record, and return `null`.

`revoke()` must call `clearRelaySession()` in `finally`. Browser disconnect/reload must not call `revoke()` automatically.

- [ ] **Step 5: Run cloud-app tests/typecheck and commit**

Run: `npm --prefix cloud-app run typecheck && npm --prefix cloud-app test`
Expected: PASS.

Commit: `git add cloud-app/lib/relay-session-store.ts cloud-app/lib/runtime-relay.ts cloud-app/test/runtime-relay-resume-contract.test.mjs && git commit -m "feat: resume paired brain from browser"`

---

### Task 3: Add explicit one-turn licensed answer admission without weakening zero-Codex

**Files:**
- Modify: `src/server.mjs`
- Modify: `test/chat-runtime.test.mjs`
- Modify: `docs/ZERO-CREDIT-AUTOMATION.md`

**Interfaces:**
- Accepted public chat credit policies become `"standard" | "zero-codex" | "licensed-approved"`.
- `licensed-approved` is valid only when classification resolves to `decision.execution === "task"` and `decision.capability === "assistant.respond"`.
- Any other classified execution under `licensed-approved` returns HTTP 400 with `licensed-policy-answer-only` before conversation/task persistence.
- [ ] **Step 1: Write failing chat-policy tests**

```js
const licensed = await fetch(`${base}/api/chat`, {
  method: "POST", headers: AUTH,
  body: JSON.stringify({ mode: "auto", content: "Explain why it rains", creditPolicy: "licensed-approved", idempotencyKey: "licensed-answer" }),
});
assert.equal(licensed.status, 202);
assert.equal((await licensed.json()).task.capability, "assistant.respond");

const forbidden = await fetch(`${base}/api/chat`, {
  method: "POST", headers: AUTH,
  body: JSON.stringify({ mode: "act", content: "Update the repository", creditPolicy: "licensed-approved", idempotencyKey: "licensed-action" }),
});
assert.equal(forbidden.status, 400);
assert.equal((await forbidden.json()).error, "licensed-policy-answer-only");
assert.equal(runtime.database.listObjectives().length, 0);
```

Keep the existing assertion that zero-Codex ordinary questions return `409 zero-credit-provider-unavailable` and create no conversation.

- [ ] **Step 2: Run focused chat tests and verify failure**

Run: `node --test --test-isolation=none test/chat-runtime.test.mjs`
Expected: FAIL because `licensed-approved` is rejected by `chatCreditPolicy()`.

- [ ] **Step 3: Implement policy guard before persistence**

```js
if (creditPolicy === "licensed-approved" && !(decision.execution === "task" && decision.capability === "assistant.respond")) {
  return { status: 400, value: { error: "licensed-policy-answer-only", decision } };
}
```

Update `chatCreditPolicy()` to accept `licensed-approved`. Do not alter the existing `zero-codex` worker-cost check or zero-credit provider selector.

- [ ] **Step 4: Run chat tests and commit**

Run: `node --test --test-isolation=none test/chat-runtime.test.mjs test/zero-credit-provider-selector.test.mjs`
Expected: PASS.

Commit: `git add src/server.mjs test/chat-runtime.test.mjs docs/ZERO-CREDIT-AUTOMATION.md && git commit -m "feat: add explicit licensed answer admission"`

---

### Task 4: Make Mahoraga One auto-resume and expose licensed retry only after zero-credit rejection

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Modify: `cloud-app/test/mahoraga-one-contract.test.mjs`
- Modify: `cloud-app/test/singular-ui-contract.test.mjs`

**Interfaces:**
- UI relay states map to product states: `pairing/resuming -> Connecting`, connected+idle -> `Idle`, connected+busy -> `Awake`, connected+blocked -> `Degraded`, disconnected -> `Offline`.
- `submitCore(text, mode, actionLabel, creditPolicy = "zero-codex")` accepts the explicit policy.
- Store `licensedRetry: { text: string; mode: TaskMode } | null` only after `zero-credit-provider-unavailable`.
- [ ] **Step 1: Write failing UI contract tests**

```js
assert.match(workspace, /\.resume\(\)/);
assert.match(workspace, /creditPolicy:\s*"zero-codex"/);
assert.match(workspace, /licensed-approved/);
assert.match(workspace + chat, /Use licensed brain for this message/);
assert.doesNotMatch(workspace, /zero-credit-provider-unavailable[\s\S]*licensed-approved[\s\S]*submitCore\(/); // no automatic fallback chain
```

Also assert the pairing input remains present as fallback and that action buttons remain disabled while relay state is offline/connecting.

- [ ] **Step 2: Run cloud-app tests and verify failure**

Run: `npm --prefix cloud-app test`
Expected: FAIL because resume startup and licensed retry UI are absent.

- [ ] **Step 3: Implement startup resume and product states**

Create the `RuntimeRelay` once, set state to `resuming`, call `await transport.resume()`, and if a session is returned load capabilities/messages as the normal paired path does. If resume returns `null`, set `unpaired` and leave secure manual pairing available.

Do not show a technical relay control while resume is pending. Surface only the human state label `Connecting`.

- [ ] **Step 4: Implement explicit licensed retry**

When `submitCore(..., "zero-codex")` catches `zero-credit-provider-unavailable`, preserve the original text/mode in `licensedRetry`, mark product state `Degraded`, and render a compact action:

```tsx
<button type="button" onClick={() => retryLicensed()}>
  Use licensed brain for this message
</button>
```

`retryLicensed()` clears the pending retry before calling `submitCore(saved.text, saved.mode, null, "licensed-approved")`. It is never called automatically. Any new user message replaces/clears the old retry.

- [ ] **Step 5: Run cloud app verification and commit**

Run: `npm --prefix cloud-app run verify`
Expected: typecheck, tests, and static export build PASS.

Commit: `git add cloud-app/components/workspace.tsx cloud-app/components/workspace/chat-view.tsx cloud-app/components/workspace/workspace-types.ts cloud-app/test/mahoraga-one-contract.test.mjs cloud-app/test/singular-ui-contract.test.mjs && git commit -m "feat: reconnect Mahoraga One to the brain"`

---

### Task 5: Integrate release baseline, run end-to-end verification, and production-facing simulation

**Files:**
- Modify only generated release-baseline files required by repository verification.
- Modify: `docs/CLOUD-WORKSPACE.md`
- Modify: `docs/CLOUD-ONLY-DEPLOYMENT.md`
- Modify: `docs/PROVIDER-ADAPTER-CONTRACTS.md` if admission semantics are described there.

**Interfaces:**
- Production contract: `Open -> Connecting -> Idle -> Awake -> Idle`; manual pairing is fallback, not routine reload behavior.
- Zero-Codex rejection is observable as `Degraded`; licensed execution occurs only after owner action.

- [ ] **Step 1: Run focused integration tests**

Run: `node --test --test-isolation=none test/relay-core.test.mjs test/cloudflare-relay-adapter.test.mjs test/relay-runtime.test.mjs test/chat-runtime.test.mjs test/zero-credit-provider-selector.test.mjs`
Expected: PASS.

- [ ] **Step 2: Refresh/verify release baseline if required**

Run: `npm run baseline:verify`
If it fails only because intentional source copies changed, run `npm run baseline:refresh`, inspect the exact changed baseline paths, then rerun `npm run baseline:verify`. Do not accept unrelated baseline drift.

- [ ] **Step 3: Run complete repository verification**

Run: `npm run verify`
Expected: PASS with no Vercel requirement and no Codex review invocation.

Run: `npm --prefix cloud-app run verify`
Expected: PASS.

- [ ] **Step 4: Run local production simulation**

Start one exact-branch Mahoraga runtime with the relay credential already present on the machine. Pair once through a production-equivalent static workspace, reload the browser, and verify the browser reconnects without a pasted offer. Submit a deterministic health request under zero-Codex and verify completion. Submit an ordinary question with no verified zero-credit generator and verify the UI shows the licensed opt-in without executing it. Trigger the opt-in and verify exactly one `assistant.respond` task is created under `licensed-approved`.

- [ ] **Step 5: Security challenge**

Attempt remote reattach with wrong resume credential and verify no socket role is assigned. Revoke the paired device and reload; verify the browser clears persisted relay state and returns to `Offline`/manual pairing. Confirm browser storage contains no GitHub/provider/runtime bearer/API credentials.

- [ ] **Step 6: Commit integration/docs**

Commit: `git add docs state/release-baseline && git commit -m "docs: document persistent brain bridge"`

- [ ] **Step 7: Final diff and branch check**

Run: `git status --short && git log --oneline origin/main..HEAD && git diff --check origin/main...HEAD`
Expected: clean worktree, only scoped commits, no whitespace errors.
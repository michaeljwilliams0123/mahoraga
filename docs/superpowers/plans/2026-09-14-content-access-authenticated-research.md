# Content Access and Authenticated Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trusted owner-relay message content readable through the existing audited content boundary and prove repository research remains authenticated and fail-closed.

**Architecture:** The relay already emits the exact mechanism `owner-paired-relay`, while `RuntimeDatabase.recordContentAccess()` currently accepts only `bearer` and `cookie`. Expand the database allowlist only to the exact trusted relay mechanism, mirror the governed baseline, and add focused tests. Reuse merged PR #488 for authenticated GitHub reads rather than adding public fallbacks.

**Tech Stack:** Node.js >=24, node:test, SQLite, Mahoraga content vault, owner paired relay, GitHub authenticated server reader.

**Spec:** `docs/superpowers/specs/2026-09-14-primary-controller-readiness-design.md`

## Global Constraints

- Unauthorized paid-provider spend is forbidden.
- Destructive data loss requires owner approval.
- Do not broaden the content access mechanism allowlist with wildcards or arbitrary caller strings.
- Preserve owner/classification/reference checks and content-access audit events.
- Repository research must use authenticated GitHub API reads and fail closed when authentication is unavailable.
- Mirror runtime changes under `state/release-baseline/`.

---

### Task 1: Reproduce the relay/content mechanism mismatch

**Files:**
- Inspect: `src/relay-runtime.mjs`
- Inspect: `src/database.mjs`
- Test: `test/content-boundary-runtime.test.mjs`

**Interfaces:**
- Consumes: relay context `{ mechanism: "owner-paired-relay" }` and `RuntimeDatabase.recordContentAccess(...)`.
- Produces: a failing regression that demonstrates the exact mismatch without changing production behavior first.

- [ ] **Step 1: Confirm the relay emits the exact trusted mechanism**

Run:

```bash
git grep -n 'owner-paired-relay' -- src/relay-runtime.mjs test/chat-runtime.test.mjs test/relay-runtime.test.mjs
```

Expected: the live relay path uses `owner-paired-relay`.

- [ ] **Step 2: Add the failing database regression**

Append to `test/content-boundary-runtime.test.mjs` after the existing content-access evidence test:

```js
test("content access audit accepts the exact trusted owner paired relay mechanism", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-relay-evidence-"));
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 15) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });

  const task = database.submitTask({
    capability: "system.health",
    dataClass: "local-only",
    requestedOutcome: "relay content boundary proof",
    idempotencyKey: "content-owner-relay-evidence",
  });

  assert.doesNotThrow(() => database.recordContentAccess({
    reference: task.requestedOutcomeReference,
    ownerType: "task",
    ownerId: task.id,
    classification: "local-only",
    mechanism: "owner-paired-relay",
    sessionId: "rls-00000000000000000000000000000000",
  }));

  const event = database.listEvents().find((item) => item.eventType === "content.accessed");
  assert.equal(event.metadata.mechanism, "owner-paired-relay");
  assert.equal(event.metadata.sessionBound, true);
});
```

- [ ] **Step 3: Run the test and verify the intended failure**

Run:

```bash
node --test --test-isolation=none test/content-boundary-runtime.test.mjs
```

Expected before implementation: FAIL with `Content access mechanism is invalid.`

### Task 2: Admit only the exact trusted relay mechanism

**Files:**
- Modify: `src/database.mjs`
- Modify: `state/release-baseline/src/database.mjs`
- Test: `test/content-boundary-runtime.test.mjs`

**Interfaces:**
- Consumes: `recordContentAccess({ reference, ownerType, ownerId, classification, mechanism, sessionId })`.
- Produces: audited content access for `bearer`, `cookie`, and `owner-paired-relay` only.

- [ ] **Step 1: Make the minimal live-source change**

Replace the mechanism check in `src/database.mjs` with:

```js
const CONTENT_ACCESS_MECHANISMS = new Set(["bearer", "cookie", "owner-paired-relay"]);
```

and inside `recordContentAccess(...)` use:

```js
if (!CONTENT_ACCESS_MECHANISMS.has(mechanism)) throw new TypeError("Content access mechanism is invalid.");
```

Keep the constant module-private unless another production module has a demonstrated need for it.

- [ ] **Step 2: Mirror the exact change in the release baseline**

Apply the same constant and validation line to `state/release-baseline/src/database.mjs`.

- [ ] **Step 3: Add a negative arbitrary-mechanism regression**

In `test/content-boundary-runtime.test.mjs`, add:

```js
test("content access audit rejects untrusted mechanisms", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-mechanism-deny-"));
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 16) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const task = database.submitTask({ capability: "system.health", dataClass: "local-only", requestedOutcome: "x", idempotencyKey: "deny-content-mechanism" });

  assert.throws(() => database.recordContentAccess({
    reference: task.requestedOutcomeReference,
    ownerType: "task",
    ownerId: task.id,
    classification: "local-only",
    mechanism: "arbitrary-browser-string",
    sessionId: "rls-00000000000000000000000000000000",
  }), /Content access mechanism is invalid/);
});
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
node --test --test-isolation=none test/content-boundary-runtime.test.mjs test/chat-runtime.test.mjs test/relay-runtime.test.mjs
npm run baseline:verify
```

Expected: PASS.

- [ ] **Step 5: Commit the bounded fix**

Run:

```bash
git add src/database.mjs state/release-baseline/src/database.mjs test/content-boundary-runtime.test.mjs
git commit -m "fix(content): admit trusted owner relay access evidence"
```

### Task 3: Prove real relay message-content retrieval

**Files:**
- Modify if necessary: `test/relay-runtime.test.mjs`
- Inspect: `src/server.mjs`
- Inspect: `src/relay-runtime.mjs`

**Interfaces:**
- Consumes: relay `message-content` dispatch and server `gateway.messageContent(payload, context)`.
- Produces: an end-to-end test that reads vault-backed content through the owner paired relay and records an audit event.

- [ ] **Step 1: Extend the relay fixture with one vault-backed assistant message**

Use the existing relay-runtime test fixture and assert the request path sends:

```js
{
  type: "message-content",
  payload: {
    conversationId,
    messageId,
    contentReference,
    classification: "local-only",
  },
}
```

The gateway fixture must receive context exactly equal to:

```js
{
  attendedSession: { active: true, sessionId: expectedSessionId },
  mechanism: "owner-paired-relay",
}
```

- [ ] **Step 2: Assert content bytes never enter the audit event**

The regression must verify the returned content equals the expected plaintext while serialized `content.accessed` evidence does not contain that plaintext or the raw session ID.

- [ ] **Step 3: Run relay and content tests**

Run:

```bash
node --test --test-isolation=none test/relay-runtime.test.mjs test/content-boundary-runtime.test.mjs
```

Expected: PASS.

### Task 4: Reconcile authenticated GitHub research with merged PR #488

**Files:**
- Inspect: `cloud-app/src/lib/fleet/github.server.ts` if present, otherwise the actual merged `github.server.ts` path reported by Git history.
- Inspect: tests added by PR #488.
- Inspect: cloud workspace research path.

**Interfaces:**
- Consumes: `MAHORAGA_GITHUB_READ_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` on the server only.
- Produces: repository reads that use authenticated `api.github.com`, reject redirects, use `cache: "no-store"`, and return `authenticated-read-unavailable` when credentials cannot be used.

- [ ] **Step 1: Confirm public HTML/RAW fallbacks are absent**

Run:

```bash
git grep -n "raw.githubusercontent.com\|loadFromPublicWeb\|webText(" -- cloud-app operator-deck src || true
```

Expected: no active repository-reader fallback remains in the merged operator path.

- [ ] **Step 2: Run the exact authenticated-reader regressions introduced by PR #488**

Identify the changed test filename from PR #488, then run that test directly with `node --test --test-isolation=none <path>` or the package-specific test command used by that workspace.

Expected: authenticated private fixture passes; missing/rejected credential returns `authenticated-read-unavailable`; no stale private snapshot is served.

- [ ] **Step 3: Verify credential scope is server-only**

Run:

```bash
git grep -n "MAHORAGA_GITHUB_READ_TOKEN\|GH_TOKEN\|GITHUB_TOKEN" -- cloud-app operator-deck
```

Expected: no `NEXT_PUBLIC_` exposure and no browser component reads the secret.

### Task 5: Full repository verification and live research canary

**Files:**
- Create after proof: `docs/readiness/content-and-research-evidence.md`

**Interfaces:**
- Consumes: fixed content mechanism, authenticated GitHub reader, exact-head CI, canonical production.
- Produces: readiness evidence showing both screenshot-class failures are resolved without widening trust.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: exit code 0.

- [ ] **Step 2: Deploy the verified merge to canonical Railway**

Use only `mahoraga-runtime-main`; confirm deployed source SHA equals merged GitHub `main`.

- [ ] **Step 3: Run two live canaries**

Canary A: retrieve a vault-backed message through the connected workspace. Expected: content returned; no `content access mechanism is invalid` error.

Canary B: ask Mahoraga to inspect the connected GitHub repository. Expected: authenticated repository evidence or the explicit fail-closed `authenticated-read-unavailable` state; never an unauthenticated public fallback.

- [ ] **Step 4: Record evidence**

Create:

```markdown
# Content and Authenticated Research Evidence

- Main SHA: `<40-hex-sha>`
- Content mechanism regression: `pass`
- Arbitrary mechanism rejection: `pass`
- Relay message-content canary: `pass`
- Authenticated GitHub reader: `pass|fail-closed`
- Public/RAW fallback observed: `no`
- Canonical Railway source matches main: `yes`
- Result: `GREEN|AMBER`
```

Use `AMBER` only when GitHub credentials are operationally unavailable but the path fails closed correctly.

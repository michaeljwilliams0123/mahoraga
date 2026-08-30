# Mahoraga 7.0 Truth and Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Mahoraga `7.0.0-alpha.1` with authenticated sensitive surfaces, server-derived task policy, typed receipts, evidence-backed routing, isolated Codex execution, content-vault references, and incident-only repair records.

**Architecture:** Preserve the Node.js supervisor, process-isolated workers, SQLite WAL ledger, and loopback server while inserting explicit trust contracts between intake, routing, execution, persistence, and presentation. Add focused modules instead of expanding `server.mjs`, `supervisor.mjs`, and `database.mjs`; retain 3.6.0 as the rollback target until the alpha canary passes.

**Tech Stack:** Node.js 24+, ECMAScript modules, `node:http`, `node:crypto`, `node:sqlite`, PowerShell 7 on Windows 11, native Git worktrees, HTML/CSS/JavaScript Control Center, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-mahoraga-7-truth-containment-design.md`

## Global Constraints

- Target product version is `7.0.0-alpha.1`; Control Center version is `7.0.0-alpha.1`.
- Runtime remains bound to `127.0.0.1:4782`; no public listener is introduced.
- Normal authorized operation is prompt-free; standing policy replaces routine approval prompts.
- Only `GET /api/status`, `GET /api/identity`, and static shell assets are public on loopback.
- Callers cannot authoritatively select capability, data class, execution plane, worker, or attended-state requirements.
- A heartbeat proves process liveness only; write-capable routing requires a fresh successful canary.
- Operational SQLite tables contain metadata, references, hashes, classifications, TTLs, and bounded summaries only.
- Codex never writes, merges, pushes, or deploys from the authoritative checkout.
- No currently disabled provider is enabled by this plan.
- Tests are authored with their implementation task but executed only at the large integration gate, full-suite gate, and live-smoke gate.
- Production activation is outside ordinary implementation tasks and occurs only through the release task at the end of this plan.

---

## File map

### New modules

- `src/control-session.mjs` — single-use bootstrap nonces, in-memory sessions, cookie parsing, origin enforcement.
- `src/task-policy.mjs` — authoritative task-policy derivation and intake rejection codes.
- `src/receipt-registry.mjs` — common receipt envelope and capability-family detail validation.
- `src/capability-readiness.mjs` — process/provider/canary state normalization and route eligibility.
- `src/execution-cell.mjs` — creation, inspection, quarantine, and removal contracts for Codex Git worktrees.
- `src/content-vault.mjs` — encrypted local content records and metadata-only references.
- `src/repair-incidents.mjs` — stable incident identities and state-transition deduplication.
- `scripts/open-control-center.ps1` — prompt-free authenticated Control Center bootstrap.
- `scripts/content-vault-key.ps1` — DPAPI protect/unprotect helper for the vault master key.

### Existing modules to change

- `src/server.mjs` — route classification, authenticated projections, policy-driven intake, bootstrap exchange.
- `src/runtime.mjs` — construct sessions, vault, receipt registry, and readiness dependencies.
- `src/database.mjs` — additive migrations, policy fields, normalized receipt persistence, content references, repair incidents.
- `src/supervisor.mjs` — safe receipt completion, readiness updates, canary scheduling, incident-only repair behavior.
- `src/worker-process.mjs` — report process readiness separately from provider and canary results.
- `src/capability-registry.mjs` — route only through `capability-readiness.mjs` eligibility.
- `src/router.mjs` — return durable blocked reasons without optimistic fallback.
- `src/codex-builder-worker.mjs` — execute in candidate worktrees and emit repository receipts.
- `src/local-artifact-store.mjs` — remove persisted content previews and return vault references.
- `src/repair.mjs` — expose scan observations and recovery results without creating periodic tasks.
- `web/app.js`, `web/index.html`, `web/styles.css` — session bootstrap state and truthful readiness language.
- `mahoraga.manifest.json`, `package.json` — alpha versions and new runtime policy declarations.
- `src/gap-audit.mjs` — evaluate working contracts rather than declarations/file presence.
- `README.md`, `docs/PRODUCTION-STATUS.md`, `docs/IMPLEMENTATION-LOG.md` — generated, evidence-aligned alpha status.
- `src/repair.mjs` `ESSENTIAL_FILES` and release baseline — include every new essential runtime file.

### Test files

- `test/control-session.test.mjs`
- `test/server-security-runtime.test.mjs`
- `test/task-policy.test.mjs`
- `test/receipt-registry.test.mjs`
- `test/receipt-runtime.test.mjs`
- `test/capability-readiness.test.mjs`
- `test/readiness-runtime.test.mjs`
- `test/execution-cell.test.mjs`
- `test/codex-execution-cell-runtime.test.mjs`
- `test/content-vault.test.mjs`
- `test/content-boundary-runtime.test.mjs`
- `test/repair-incidents.test.mjs`
- `test/truth-containment-wave.test.mjs`

---

### Task 1: Establish authenticated local Control Center sessions

**Files:**
- Create: `src/control-session.mjs`
- Create: `scripts/open-control-center.ps1`
- Modify: `src/server.mjs`
- Modify: `src/runtime.mjs`
- Modify: `web/app.js`
- Test: `test/control-session.test.mjs`
- Test: `test/server-security-runtime.test.mjs`

**Interfaces:**
- Consumes: `bearerMatches(request, token)` from `src/local-auth.mjs`.
- Produces: `createControlSessionManager({ now, randomBytes, idleTtlMs, nonceTtlMs })`, `authenticateLocalRequest(request, context)`, and `classifyApiRoute(method, pathname)`.

- [ ] **Step 1: Add contract tests without running them**

```js
const sessions = createControlSessionManager({
  now: () => clock,
  randomBytes: (size) => Buffer.alloc(size, 7),
  idleTtlMs: 28_800_000,
  nonceTtlMs: 30_000,
});
const nonce = sessions.issueBootstrapNonce();
assert.equal(sessions.exchangeBootstrapNonce(nonce).authenticated, true);
assert.throws(() => sessions.exchangeBootstrapNonce(nonce), /bootstrap-nonce-invalid/);
clock += 30_001;
assert.throws(() => sessions.exchangeBootstrapNonce(sessions.issueBootstrapNonce()), /bootstrap-nonce-expired/);
```

Add runtime assertions that unauthenticated `POST /api/tasks`, `GET /api/tasks`, `GET /api/conversations`, and artifact-content requests return `401`, while status and identity remain readable.

- [ ] **Step 2: Implement the session manager**

```js
export function createControlSessionManager({
  now = Date.now,
  randomBytes: random = randomBytes,
  idleTtlMs = 8 * 60 * 60 * 1000,
  nonceTtlMs = 30_000,
} = {}) {
  const nonces = new Map();
  const sessions = new Map();
  return {
    issueBootstrapNonce() { /* random 32-byte base64url value + expiry */ },
    exchangeBootstrapNonce(value) { /* delete-on-read and create session */ },
    authenticateCookie(value) { /* refresh idle expiry on success */ },
    revokeSession(value) { sessions.delete(value); },
  };
}
```

Use `crypto.timingSafeEqual` for bearer and cookie comparisons. Emit cookies with `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`; do not emit `Secure` because the server is HTTP-only loopback.

- [ ] **Step 3: Classify and protect routes**

```js
export function classifyApiRoute(method, pathname) {
  if (method === "GET" && ["/api/status", "/api/identity"].includes(pathname)) return "public";
  if (pathname.startsWith("/api/") || pathname.startsWith("/artifacts/")) return method === "GET" ? "sensitive-read" : "mutation";
  return "static";
}
```

Authenticate protected routes before reading request bodies. For cookie-authenticated mutations, require `Origin` or `Referer` to resolve exactly to `http://127.0.0.1:4782`.

- [ ] **Step 4: Implement prompt-free bootstrap**

`scripts/open-control-center.ps1` loads the primary token, requests a one-time nonce from an authenticated local endpoint, and opens the bootstrap URL. The server sets the session cookie and returns `302 Location: /`.

- [ ] **Step 5: Update the Control Center client**

All same-origin calls use `credentials: "same-origin"`. A `401` renders a neutral “Local session required” state with a command to run `scripts/open-control-center.ps1`; it does not leak cached task data.

- [ ] **Step 6: Commit the completed authentication slice without running tests**

```text
git add src/control-session.mjs src/server.mjs src/runtime.mjs web/app.js scripts/open-control-center.ps1 test/control-session.test.mjs test/server-security-runtime.test.mjs
git commit -m "feat: add authenticated local control sessions"
```

### Task 2: Derive task authority on the server

**Files:**
- Create: `src/task-policy.mjs`
- Modify: `src/server.mjs`
- Modify: `src/database.mjs`
- Modify: `src/cli.mjs`
- Test: `test/task-policy.test.mjs`
- Test: `test/server-security-runtime.test.mjs`

**Interfaces:**
- Consumes: authenticated source identity, manifest worker definitions, attended-session state, integration lease state.
- Produces: `deriveTaskPolicy(input, context) -> TaskPolicy` and `sanitizeTaskIntake(body) -> RequestedIntent`.

- [ ] **Step 1: Add policy tests without executing them**

```js
assert.deepEqual(
  deriveTaskPolicy({ intent: "repository.inspect", requestedOutcome: "Inspect status" }, context),
  {
    source: "control-center",
    intent: "repository.inspect",
    capability: "repository.inspect",
    dataClass: "local-only",
    executionPlane: "local-process",
    attendedRequired: false,
    allowedWorkerIds: ["repository"],
    authoritySessionId: null,
    integrationLeaseId: null,
    contentReferences: [],
    policyVersion: "7.0.0-alpha.1",
  },
);
assert.throws(
  () => sanitizeTaskIntake({ intent: "repository.inspect", capability: "codex.execute" }),
  /caller-authority-field-forbidden/,
);
```

Cover Desktop without an attended session, Codex without a lease/base commit/allowed paths, enterprise attachments without classification, and unknown intent.

- [ ] **Step 2: Implement fixed intent templates**

```js
const INTENTS = Object.freeze({
  "system.health": { capability: "system.health", dataClass: "synthetic", executionPlane: "local-process" },
  "repository.inspect": { capability: "repository.inspect", dataClass: "local-only", executionPlane: "local-process" },
  "browser.observe": { capability: "browser.observe", dataClass: "local-only", executionPlane: "browser-session" },
  "desktop.interact": { capability: "desktop.interact", dataClass: "local-only", executionPlane: "attended-desktop", attendedRequired: true },
  "m365.open": { capability: "m365.open", dataClass: "enterprise", executionPlane: "microsoft-session", attendedRequired: true },
  "codex.execute": { capability: "codex.execute", dataClass: "local-only", executionPlane: "candidate-worktree" },
});
```

Templates may narrow authority using route-specific context; no body field can widen it.

- [ ] **Step 3: Make database task creation accept policy output only**

Add additive columns for `intent`, `execution_plane`, `attended_required`, `allowed_worker_ids_json`, `authority_session_id`, `integration_lease_id`, `content_references_json`, and `policy_version`. Rename the existing low-level creator to `createPolicyTask(policy, requestedOutcomeReference)` and keep a private migration adapter for legacy tests until all callers move.

- [ ] **Step 4: Update every task intake caller**

Route CLI, Control Center, cloud-return validation, repair incidents, Microsoft queue polling, and conversation tasks through either a fixed internal policy template or `deriveTaskPolicy`. Internal callers identify themselves with a closed enum; they do not bypass policy.

- [ ] **Step 5: Commit the policy slice without running tests**

```text
git add src/task-policy.mjs src/server.mjs src/database.mjs src/cli.mjs test/task-policy.test.mjs test/server-security-runtime.test.mjs
git commit -m "feat: derive task authority at intake"
```

### Task 3: Introduce typed capability receipts

**Files:**
- Create: `src/receipt-registry.mjs`
- Modify: `src/database.mjs`
- Modify: `src/supervisor.mjs`
- Modify: enabled worker modules under `src/*-worker.mjs`
- Test: `test/receipt-registry.test.mjs`
- Test: `test/receipt-runtime.test.mjs`

**Interfaces:**
- Consumes: raw worker result and claimed task capability.
- Produces: `validateCapabilityReceipt(capability, value) -> CapabilityReceipt` and `receiptFailure(error) -> { errorCode, boundedSummary }`.

- [ ] **Step 1: Add receipt tests without executing them**

```js
const receipt = validateCapabilityReceipt("repository.inspect", {
  schemaVersion: 1,
  capability: "repository.inspect",
  outcome: "succeeded",
  summary: "Repository status inspected.",
  evidence: [{ type: "git-status", ref: "git:397aceb", sha256: DIGEST, observedAt: NOW }],
  metrics: { durationMs: 31 },
  details: { repositoryPathHash: DIGEST, baseCommit: FULL_SHA, headCommit: FULL_SHA, changedPaths: [], validationState: "not-requested" },
});
assert.equal(receipt.capability, "repository.inspect");
assert.throws(() => validateCapabilityReceipt("repository.inspect", { ...receipt, prompt: "secret" }), /receipt-field-unknown/);
assert.throws(() => validateCapabilityReceipt("codex.execute", { ...receipt, capability: "codex.execute" }), /codex-receipt-details-invalid/);
```

Add a cross-module test that sends a Desktop/M365/Codex receipt through the supervisor and database. Add malformed receipt and forced SQLite persistence failure assertions proving the worker stays available.

- [ ] **Step 2: Implement the common envelope and family validators**

Use exact-key validation. Require lowercase capability identity to match the task. Bound summary to 512 characters and prohibit content-bearing keys recursively: `prompt`, `response`, `content`, `preview`, `token`, `secret`, `documentText`.

```js
export function validateCapabilityReceipt(capability, value) {
  exactKeys(value, ["schemaVersion", "capability", "outcome", "summary", "evidence", "metrics", "details"]);
  if (value.schemaVersion !== 1 || value.capability !== capability) throw receiptError("receipt-envelope-invalid");
  return Object.freeze({ ...normalizeEnvelope(value), details: validatorFor(capability)(value.details) });
}
```

- [ ] **Step 3: Replace browser-only receipt persistence**

Store the normalized envelope as canonical JSON with a receipt SHA-256 and indexed capability/outcome columns. Remove `normalizeReceiptMetadata()` and its browser-only key list. Return metadata projections by default; authenticated evidence routes may retrieve the canonical receipt.

- [ ] **Step 4: Make supervisor completion failure-safe**

```js
try {
  const receipt = validateCapabilityReceipt(task.capability, message.result?.receipt);
  this.database.completeTaskWithReceipt(task.id, receipt);
} catch (error) {
  this.database.failTaskSafely(task.id, receiptFailure(error));
  this.database.recordIncidentOnce({ kind: "task-completion", taskId: task.id, errorCode: receiptFailure(error).errorCode });
} finally {
  this.#release(state);
}
```

Never throw from the IPC message handler because a receipt or persistence operation failed.

- [ ] **Step 5: Convert every enabled worker result**

Convert Local Core, Repository, Self-Healer, Browser, Codex Builder, Desktop, and Microsoft 365 results to the common `receipt` property. Health results remain observations until promoted by the readiness engine.

- [ ] **Step 6: Commit the receipt slice without running tests**

```text
git add src/receipt-registry.mjs src/database.mjs src/supervisor.mjs src/*-worker.mjs test/receipt-registry.test.mjs test/receipt-runtime.test.mjs
git commit -m "feat: validate typed capability receipts"
```

### Task 4: Separate liveness, readiness, canary evidence, and routing

**Files:**
- Create: `src/capability-readiness.mjs`
- Modify: `src/worker-process.mjs`
- Modify: `src/supervisor.mjs`
- Modify: `src/capability-registry.mjs`
- Modify: `src/router.mjs`
- Modify: `src/provider-readiness.mjs`
- Modify: `src/server.mjs`
- Test: `test/capability-readiness.test.mjs`
- Test: `test/readiness-runtime.test.mjs`

**Interfaces:**
- Consumes: worker heartbeat state, provider probe receipt, capability canary receipt, policy requirements.
- Produces: `deriveCapabilityReadiness(input, now) -> CapabilityReadiness` and `isCapabilityRoutable(policy, readiness) -> { eligible, reason }`.

- [ ] **Step 1: Add readiness tests without running them**

```js
assert.deepEqual(
  deriveCapabilityReadiness({ processState: "live", providerState: "unknown", canaryState: "never" }, NOW),
  expect.objectContaining({ routable: false, evidenceLevel: "observed", reason: "provider-not-ready" }),
);
assert.equal(
  isCapabilityRoutable(writePolicy, verifiedFreshReadiness).eligible,
  true,
);
assert.equal(
  isCapabilityRoutable(writePolicy, { ...verifiedFreshReadiness, lastVerifiedAt: EXPIRED }).reason,
  "canary-stale",
);
```

Prove that `ready` IPC alone cannot route any capability and that failure of one capability does not disable unrelated capabilities on the same worker.

- [ ] **Step 2: Implement readiness normalization**

```js
export function deriveCapabilityReadiness({ process, provider, canary, capabilityClass }, now = Date.now()) {
  const ttlMs = capabilityClass === "deterministic-read" ? 86_400_000 : 900_000;
  const fresh = canary?.status === "verified" && now - Date.parse(canary.verifiedAt) <= ttlMs;
  const routable = process?.status === "live" && provider?.status === "ready" && fresh;
  return { process: process?.status ?? "stopped", provider: provider?.status ?? "unknown", canary: fresh ? "verified" : canary?.status ?? "never", routable, evidenceLevel: fresh ? "verified" : provider ? "inferred" : "observed", lastObservedAt: process?.observedAt ?? null, lastVerifiedAt: canary?.verifiedAt ?? null, reason: routeBlockReason({ process, provider, canary, fresh }) };
}
```

- [ ] **Step 3: Change worker startup semantics**

`worker-process.mjs` sends `process-ready` after manifest load. It then executes the worker health probe and sends `provider-readiness`. Canaries are separate supervisor-assigned tasks and return typed receipts.

- [ ] **Step 4: Persist readiness evidence**

Add capability-level readiness rows keyed by worker and capability. Heartbeat writes update process observation only. Provider probes and successful canaries update their own fields. Failed or expired canaries immediately make the capability unroutable.

- [ ] **Step 5: Replace optimistic routing**

Remove `starting` and `configured` from routable states. Route ranking first applies `isCapabilityRoutable`; sorting among eligible routes may retain interface, cost, availability, workload, latency, and reliability scoring. Return stable blocked reasons when no route exists.

- [ ] **Step 6: Commit the readiness slice without running tests**

```text
git add src/capability-readiness.mjs src/worker-process.mjs src/supervisor.mjs src/capability-registry.mjs src/router.mjs src/provider-readiness.mjs src/server.mjs test/capability-readiness.test.mjs test/readiness-runtime.test.mjs
git commit -m "feat: route on verified capability readiness"
```

### Task 5: Isolate Codex execution in candidate worktrees

**Files:**
- Create: `src/execution-cell.mjs`
- Modify: `src/codex-builder-worker.mjs`
- Modify: `src/controller-authority.mjs`
- Modify: `src/database.mjs`
- Modify: `src/repair.mjs`
- Test: `test/execution-cell.test.mjs`
- Test: `test/codex-execution-cell-runtime.test.mjs`

**Interfaces:**
- Consumes: policy task with `baseCommit`, `allowedPaths`, integration lease, and repository root.
- Produces: `createExecutionCell(contract, dependencies)`, `inspectExecutionCell(cell, dependencies)`, `quarantineExecutionCell(cell, reason)`, and a `codex.execute` receipt.

- [ ] **Step 1: Add execution-cell tests without running them**

```js
const cell = await createExecutionCell({
  taskId: TASK_ID,
  repositoryRoot: repo,
  baseCommit: BASE_SHA,
  allowedPaths: ["src/receipt-registry.mjs", "test/receipt-registry.test.mjs"],
  integrationLeaseId: LEASE_ID,
}, fakeGit);
assert.match(cell.path, /state[\\/]execution-cells[\\/]codex/);
assert.notEqual(cell.path, repo);
assert.deepEqual((await inspectExecutionCell(cell, fakeGit)).violations, []);
```

Cover path escape, symlink escape, base drift, dirty authoritative checkout, missing lease, unresolved conflicts, changed path outside the allowlist, and cleanup of a completed cell.

- [ ] **Step 2: Implement Git worktree creation**

Resolve and validate all paths beneath `state/execution-cells/codex`. Use `git rev-parse --verify <base>^{commit}`, `git worktree add --detach`, then create `mahoraga/task-<task-id>` inside the cell. Refuse creation if the authoritative checkout is dirty or its HEAD differs from the policy base.

- [ ] **Step 3: Enforce leases and changed paths**

Acquire or verify the integration lease before creating the cell. After Codex exits, resolve changed paths using Git porcelain output, normalize separators, reject symlinks/reparse points escaping the worktree, and compare every path against the exact allowlist.

- [ ] **Step 4: Invoke Codex only inside the cell**

Pass the worktree path as the subprocess working directory. The prompt includes outcome, acceptance contract, allowed paths, and the prohibition on merge/push/deploy. Remove any direct authoritative-root working directory fallback.

- [ ] **Step 5: Produce a typed candidate receipt**

The receipt includes base/head commit, branch, hashed worktree identity, allowed and changed paths, execution session, token usage, validation state, and quarantine state. It excludes prompts and model output.

- [ ] **Step 6: Commit the execution-cell slice without running tests**

```text
git add src/execution-cell.mjs src/codex-builder-worker.mjs src/controller-authority.mjs src/database.mjs src/repair.mjs test/execution-cell.test.mjs test/codex-execution-cell-runtime.test.mjs
git commit -m "feat: isolate codex execution cells"
```

### Task 6: Introduce the encrypted content-vault boundary

**Files:**
- Create: `src/content-vault.mjs`
- Create: `scripts/content-vault-key.ps1`
- Modify: `src/database.mjs`
- Modify: `src/server.mjs`
- Modify: `src/local-artifact-store.mjs`
- Modify: `src/runtime.mjs`
- Test: `test/content-vault.test.mjs`
- Test: `test/content-boundary-runtime.test.mjs`

**Interfaces:**
- Consumes: UTF-8 bytes, classification, owner reference, TTL, DPAPI-protected master key.
- Produces: `createContentVault(options) -> { put, get, metadata, deleteExpired }` and opaque references matching `vault:<uuid>`.

- [ ] **Step 1: Add vault tests without running them**

```js
const ref = await vault.put(Buffer.from("private"), { classification: "local-only", ownerType: "task", ownerId: TASK_ID, ttlMs: 60_000 });
assert.match(ref, /^vault:[a-f0-9-]{36}$/);
assert.equal((await vault.get(ref, { ownerType: "task", ownerId: TASK_ID })).toString(), "private");
assert.throws(() => vault.get(ref, { ownerType: "task", ownerId: OTHER_ID }), /vault-owner-mismatch/);
assert.doesNotMatch(JSON.stringify(database.getTask(TASK_ID)), /private/);
```

Cover AES-256-GCM tamper detection, expired records, classification mismatch, path traversal, DPAPI helper failure, and absence of document previews in summaries.

- [ ] **Step 2: Implement key protection and record encryption**

Generate a 32-byte master key once. Protect it with Windows DPAPI current-user scope through `scripts/content-vault-key.ps1`. Store encrypted content beneath `state/content-vault/<two-character-prefix>/<uuid>.vault` using AES-256-GCM with random 12-byte IV and authenticated metadata.

- [ ] **Step 3: Route new task and conversation content through references**

Replace new plaintext writes with vault references. Keep legacy columns readable for migration but do not write new plaintext. Metadata projections return reference identity, classification, size, hash, and expiry—not bytes.

- [ ] **Step 4: Remove artifact previews from persistence**

`local-artifact-store.mjs` may return structural metadata and a vault reference for explicitly captured content. Result summaries contain type, size, hash, and inspection method only.

- [ ] **Step 5: Add authenticated content resolution**

Expose a narrow content endpoint that validates session, owner identity, classification, reference format, and expiry. Record a content-access evidence event without storing returned bytes.

- [ ] **Step 6: Commit the content-boundary slice without running tests**

```text
git add src/content-vault.mjs scripts/content-vault-key.ps1 src/database.mjs src/server.mjs src/local-artifact-store.mjs src/runtime.mjs test/content-vault.test.mjs test/content-boundary-runtime.test.mjs
git commit -m "feat: separate content from operational state"
```

### Task 7: Replace periodic repair task churn with incident transitions

**Files:**
- Create: `src/repair-incidents.mjs`
- Modify: `src/repair.mjs`
- Modify: `src/supervisor.mjs`
- Modify: `src/database.mjs`
- Test: `test/repair-incidents.test.mjs`

**Interfaces:**
- Consumes: `scanRepairState()` observations and recovery results.
- Produces: `repairIncidentId(issue)`, `reconcileRepairIncidents(previous, current)`, and durable incident state transitions.

- [ ] **Step 1: Add incident tests without running them**

```js
const first = reconcileRepairIncidents([], [issue]);
assert.deepEqual(first.events.map((event) => event.type), ["repair-incident-opened"]);
const unchanged = reconcileRepairIncidents(first.incidents, [issue]);
assert.deepEqual(unchanged.events, []);
const resolved = reconcileRepairIncidents(first.incidents, []);
assert.deepEqual(resolved.events.map((event) => event.type), ["repair-incident-resolved"]);
```

Cover issue identity stability, changed digest as a new incident, recovery attempt, verification failure, rollback, and resolution.

- [ ] **Step 2: Implement incident identity and reconciliation**

Hash normalized relative path, expected digest, observed condition, and baseline version. Store opened/updated/resolved timestamps and recovery state. Do not store file content.

- [ ] **Step 3: Remove healthy scheduled repair tasks**

The supervisor invokes the scanner directly. It persists only opened, changed, actioned, failed, rolled-back, and resolved transitions. Healthy scans update an in-memory timestamp exposed by status.

- [ ] **Step 4: Commit the repair-ledger slice without running tests**

```text
git add src/repair-incidents.mjs src/repair.mjs src/supervisor.mjs src/database.mjs test/repair-incidents.test.mjs
git commit -m "fix: record repair incidents instead of polling noise"
```

### Task 8: Make the Control Center and generated status truthful

**Files:**
- Modify: `src/server.mjs`
- Modify: `src/gap-audit.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Modify: `test/control-center-source.test.mjs`
- Create: `test/truth-containment-wave.test.mjs`

**Interfaces:**
- Consumes: authenticated status projections, capability readiness, incidents, receipt metadata.
- Produces: evidence-labelled runtime, provider, capability, routing, and incident views.

- [ ] **Step 1: Add UI source and projection assertions without running them**

```js
assert.doesNotMatch(indexSource, /User-controlled core updates/);
assert.doesNotMatch(indexSource, /Review candidate changes before activation/);
assert.match(appSource, /evidenceLevel/);
assert.match(appSource, /lastVerifiedAt/);
assert.match(appSource, /routingReason/);
```

The wave test must reject any API capability projection that reports `routable: true` without fresh verified canary evidence.

- [ ] **Step 2: Replace overloaded health language**

Render separate Runtime, Provider, Canary, Routing, and Evidence fields. Use neutral labels for unknown and never-tested state. Show exact block reasons and evidence expiry.

- [ ] **Step 3: Generate product and authority copy from runtime contracts**

Version, activation policy, worker counts, enabled providers, and readiness summaries come from the authenticated API. Static HTML contains headings only, not mutable claims.

- [ ] **Step 4: Make the gap audit evidence-based**

The audit closes a gap only when its contract test or runtime evidence exists. File presence and manifest declarations are supporting evidence, not completion evidence.

- [ ] **Step 5: Commit the truth-surface slice without running tests**

```text
git add src/server.mjs src/gap-audit.mjs web/index.html web/app.js web/styles.css test/control-center-source.test.mjs test/truth-containment-wave.test.mjs
git commit -m "feat: expose evidence-backed capability truth"
```

### Task 9: Align versions, migrations, documentation, and recovery baseline

**Files:**
- Modify: `package.json`
- Modify: `mahoraga.manifest.json`
- Modify: `README.md`
- Modify: `docs/PRODUCTION-STATUS.md`
- Modify: `docs/IMPLEMENTATION-LOG.md`
- Modify: `src/repair.mjs`
- Modify: `scripts/create-release-baseline.mjs`
- Modify: `test/config.test.mjs`
- Modify: `test/gap-audit.test.mjs`
- Modify: `test/repair.test.mjs`

**Interfaces:**
- Consumes: implemented alpha contracts and test evidence identifiers.
- Produces: consistent `7.0.0-alpha.1` metadata and a baseline containing every essential runtime file.

- [ ] **Step 1: Update canonical version and policy declarations**

Set product, manifest, API, and Control Center versions to `7.0.0-alpha.1`. Declare session TTL, nonce TTL, canary TTL classes, content-vault root, execution-cell root, and receipt schema version in the manifest.

- [ ] **Step 2: Add every essential module to repair coverage**

Include the seven new runtime modules and the two PowerShell helpers in `ESSENTIAL_FILES`. Baseline validation must fail if any essential file is missing or differs from the candidate release digest set.

- [ ] **Step 3: Document observed alpha state**

README and production documents distinguish installed candidate, active production, verified capabilities, disabled providers, rollback target, and pending release gates. Do not claim production activation before Task 11.

- [ ] **Step 4: Commit the release-metadata slice without running tests**

```text
git add package.json mahoraga.manifest.json README.md docs/PRODUCTION-STATUS.md docs/IMPLEMENTATION-LOG.md src/repair.mjs scripts/create-release-baseline.mjs test/config.test.mjs test/gap-audit.test.mjs test/repair.test.mjs
git commit -m "docs: stage Mahoraga 7 truth and containment alpha"
```

### Task 10: Execute the single large integration gate

**Files:**
- Modify only files required by observed failures.
- Record: `docs/verification/7.0.0-alpha.1-truth-containment.json`

**Interfaces:**
- Consumes: all implementation and tests from Tasks 1-9.
- Produces: one machine-readable integration receipt containing command, commit, start/end time, counts, failures, and environment identity.

- [ ] **Step 1: Run the focused wave gate once**

```text
node --test test/control-session.test.mjs test/server-security-runtime.test.mjs test/task-policy.test.mjs test/receipt-registry.test.mjs test/receipt-runtime.test.mjs test/capability-readiness.test.mjs test/readiness-runtime.test.mjs test/execution-cell.test.mjs test/codex-execution-cell-runtime.test.mjs test/content-vault.test.mjs test/content-boundary-runtime.test.mjs test/repair-incidents.test.mjs test/truth-containment-wave.test.mjs
```

Expected: all focused tests pass; no orphan worker, browser, worktree, or listener remains.

- [ ] **Step 2: Correct only observed failures**

For each actual failure, capture the failing test and root cause in the verification receipt, make the smallest contract-consistent correction, and rerun only that failing file. Do not perform speculative suite reruns.

- [ ] **Step 3: Re-run the focused gate once after corrections**

Expected: all focused tests pass and the receipt records both the original failures and final result.

- [ ] **Step 4: Commit the verified wave**

```text
git add src scripts web test docs package.json mahoraga.manifest.json
git commit -m "test: verify Mahoraga 7 truth and containment wave"
```

### Task 11: Run release-candidate verification and inactive-runtime smoke

**Files:**
- Modify only release evidence and fixes for observed failures.
- Create: `docs/verification/7.0.0-alpha.1-release.json`
- Modify: `docs/PRODUCTION-STATUS.md`

**Interfaces:**
- Consumes: focused-gate commit and 3.6.0 rollback baseline.
- Produces: full-suite receipt, inactive-runtime smoke receipt, rollback-drill receipt, and promotion recommendation.

- [ ] **Step 1: Run the complete test suite once**

```text
npm test
```

Expected: all tests pass. If failures occur, apply targeted corrections and rerun the failing files, then run the complete suite one final time.

- [ ] **Step 2: Refresh and verify the isolated release baseline**

```text
npm run baseline:refresh
npm run verify:release
```

Expected: baseline contains exact candidate digests for all essential files and release verification passes.

- [ ] **Step 3: Start an inactive candidate runtime on an alternate loopback port**

Use a temporary state copy and port `4783`. Do not stop or mutate the 3.6.0 production runtime. Verify public status, authenticated session bootstrap, one deterministic repository inspection, one forced malformed-receipt failure that leaves the worker alive, and zero new repair records across three healthy scans.

- [ ] **Step 4: Perform the rollback drill**

Stop the inactive candidate, start it once from the 3.6.0 rollback slot/state copy, and confirm its status endpoint reports 3.6.0. Restore the inactive slot to the alpha candidate. This proves rollback mechanics without changing production.

- [ ] **Step 5: Request GitHub Codex adversarial review**

Push the exact verified commit. Create a non-draft review-only PR from current `main` that changes only the coordination task record and names the immutable pre-change and post-change SHAs, paths, privacy boundary, verification receipt, and `maxAttempts: 1`. Request `@codex review`. Do not merge the review-only PR.

- [ ] **Step 6: Resolve review defects through isolated fixes**

Treat each verified defect as a new bounded fix against current main. Do not implement stylistic or unsupported feedback. Repeat only the affected focused test and the final full-suite gate after all accepted fixes.

- [ ] **Step 7: Produce the promotion recommendation**

Record exact commit, suite counts, smoke evidence, rollback evidence, open defects, capability states, disabled providers, and whether the candidate is eligible for production cutover. Update production documentation only after actual activation.

---

## Plan self-review

- Spec coverage: authentication, server-derived policy, receipts, readiness, isolated Codex execution, content boundary, repair deduplication, truthful UI, batch verification, and rollback evidence each map to a task.
- Scope boundary: objective planning, councils, long-term memory, provider activation, Agent Foundry, A/B production slots, and the full Control Center redesign remain outside this alpha plan.
- Type consistency: task policy, receipt, readiness, execution-cell, vault, and incident interfaces have one canonical name and producer.
- Placeholder scan: the plan contains no unresolved implementation placeholders. Commented code describes exact required behavior and is expanded by the adjacent steps.
- User testing preference: tests are written during slices but run only at Tasks 10 and 11.

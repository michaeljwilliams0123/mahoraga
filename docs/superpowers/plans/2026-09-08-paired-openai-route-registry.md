# Paired OpenAI Route Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved paired OpenAI route registry so Mahoraga can distinguish `openai-primary` from `openai-destiny` behind the shared `chatgpt-codex-connector`, reject cross-lane execution, reuse PR activity as the wake surface, and expose only proven routes to the existing Universal Capability Graph.

**Architecture:** Add a non-secret route registry plus deterministic transport observation, reuse the existing Codex identity fingerprints and Ed25519 trust primitives for account-side pairing/result receipts, harden the Destiny bridge submission ledger, and adapt proven route readiness into existing capability routes. GitHub remains authoritative; the registry is evidence/configuration only and never becomes a second router.

**Tech Stack:** Node.js 24+, ESM `.mjs`, built-in `node:test`, JSON manifests, existing Ed25519 helpers, existing GitHub/Work/Destiny event contracts, existing Universal Capability Graph.

**Spec:** `docs/superpowers/specs/2026-09-08-paired-openai-route-registry-design.md`

## Global Constraints

- Authoritative implementation base is `c43e646e7587fc73359e974fe7c9dd669de9d53e` (squash merge of approved PR #245). If `main` moves before implementation starts, re-read the new head and revalidate this plan before editing.
- GitHub remains the repository/task/receipt authority. No direct-main write, force-push, or bypass of exact-head verification.
- `chatgpt-codex-connector` is transport identity only; GitHub username, bot login, permissions, or App actor alone never prove Mike vs Destiny executor identity.
- Raw OpenAI account IDs, Codex installation IDs, environment IDs, OAuth material, tokens, credentials, private keys, chats, prompts, and model output never enter Git.
- `openai-primary` and `openai-destiny` are logical route IDs. A route declaration never makes it routable.
- `codeReview: false`, `implementationOnly: true`, and `attempts: 1` remain mandatory for paired-route work. Repository-owned logic must reject review authority.
- No Codex code review. Externally generated Codex review comments are non-authoritative noise and never readiness, receipt, verification, or merge evidence.
- No paid connectivity probe or paid fallback. Unknown/stale readiness remains not routable.
- Reuse existing Ed25519 canonical-signature validation; do not add a second cryptographic implementation.
- Reuse the existing PR event wake lane in v1. Do not add an issue-created wake mechanism.
- The Universal Capability Graph remains the only runtime routing projection.
- New essential runtime modules and modified essential files must be mirrored in `state/release-baseline/` and pass `npm run baseline:verify`.
- Exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` remain required evidence. Vercel and Codex review are not completion requirements.

---

### Task 1: Non-secret Paired Route Registry

**Files:**
- Create: `config/openai-route-registry.json`
- Create: `src/openai-route-registry.mjs`
- Create: `test/openai-route-registry.test.mjs`
- Create: `state/release-baseline/src/openai-route-registry.mjs`

**Interfaces:**
- Consumes: checked-in JSON manifest.
- Produces: `validateOpenAiRouteRegistry(value)` and `findOpenAiRoute(registry, routeId)`.
- Route IDs are exactly `openai-primary` and `openai-destiny` in v1.

- [ ] **Step 1: Write failing registry tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateOpenAiRouteRegistry, findOpenAiRoute } from "../src/openai-route-registry.mjs";

const manifest = {
  schemaVersion: 1,
  kind: "openai-route-registry",
  repository: "michaeljwilliams0123/mahoraga",
  transport: { githubAppSlug: "chatgpt-codex-connector", githubAppId: 1144995 },
  routes: [
    { routeId: "openai-primary", executorLane: "primary-cloud-codex", receiptTrustMode: "signed-receipt", bindingState: "unconfigured" },
    { routeId: "openai-destiny", executorLane: "destiny-codex", receiptTrustMode: "signed-receipt", bindingState: "unconfigured" },
  ],
};

test("paired route registry accepts only the two bounded v1 routes", () => {
  const parsed = validateOpenAiRouteRegistry(manifest);
  assert.equal(findOpenAiRoute(parsed, "openai-destiny").executorLane, "destiny-codex");
});

test("route declaration cannot claim live readiness", () => {
  assert.throws(() => validateOpenAiRouteRegistry({ ...manifest, routes: [{ ...manifest.routes[1], bindingState: "ready" }] }), /openai-route-registry/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/openai-route-registry.test.mjs`

Expected: FAIL because `src/openai-route-registry.mjs` does not exist.

- [ ] **Step 3: Implement exact-schema validation**

```js
export function validateOpenAiRouteRegistry(value) {
  // Require exact top-level keys, exact repository, exact shared transport,
  // unique sorted route IDs, signed-receipt trust mode, and either
  // bindingState="unconfigured" or a bounded public trust record.
}

export function findOpenAiRoute(registry, routeId) {
  const valid = validateOpenAiRouteRegistry(registry);
  const route = valid.routes.find((item) => item.routeId === routeId);
  if (!route) throw new TypeError("openai-route-id-unknown");
  return route;
}
```

The configured manifest begins with both routes `unconfigured`; it must contain no public key until a real account-side pairing receipt is verified.

- [ ] **Step 4: Run GREEN and baseline checks**

Run: `node --test --test-isolation=none test/openai-route-registry.test.mjs`

Run: `npm run baseline:refresh && npm run baseline:verify`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/openai-route-registry.json src/openai-route-registry.mjs test/openai-route-registry.test.mjs state/release-baseline/src/openai-route-registry.mjs
git commit -m "feat: add paired OpenAI route registry"
```

---

### Task 2: Pairing Receipt and Cross-lane Identity Verification

**Files:**
- Modify: `src/codex-connection-identity.mjs`
- Modify: `src/destiny-trigger-trust.mjs`
- Create: `src/openai-route-identity.mjs`
- Create: `test/openai-route-identity.test.mjs`
- Modify: `test/destiny-codex-bootstrap.test.mjs`
- Mirror modified/new essential modules under `state/release-baseline/src/`.

**Interfaces:**
- Consumes: validated route registry entry, existing account/installation/environment fingerprints, route private binding, pairing/result receipt, Ed25519 public key.
- Produces: `buildOpenAiPrivateRouteBinding(...)`, `validateOpenAiPairingReceipt(...)`, and `validateOpenAiRouteResult(...)`.

- [ ] **Step 1: Write failing identity tests**

```js
test("Destiny result is rejected when signed by the primary route", () => {
  assert.throws(
    () => validateOpenAiRouteResult({ route: destinyRoute, privateBinding: destinyBinding, receipt: primarySignedReceipt }),
    /openai-route-(public-key|account|installation|environment|route)-mismatch/,
  );
});

test("pairing nonce cannot be replayed", () => {
  const first = validateOpenAiPairingReceipt({ route: destinyRoute, privateBinding: destinyBinding, receipt, nonceLedger: new Set() });
  assert.equal(first.routeId, "openai-destiny");
  assert.throws(() => validateOpenAiPairingReceipt({ route: destinyRoute, privateBinding: destinyBinding, receipt, nonceLedger: new Set([receipt.pairingNonce]) }), /pairing-nonce-replay/);
});
```

Terminal result correlation must require route ID, repository, source task ID, task digest, exact base SHA, candidate head SHA or null, account/install/environment fingerprints, receipt-key fingerprint, status, observed time, and canonical signature.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/openai-route-identity.test.mjs test/destiny-codex-bootstrap.test.mjs`

Expected: FAIL because route identity helpers are unavailable.

- [ ] **Step 3: Implement by composing existing identity/trust primitives**

Do not duplicate `fingerprintCodexAccountId`, `fingerprintCodexInstallationId`, `fingerprintCodexEnvironmentId`, `fingerprintPublicKeySpki`, or canonical Ed25519 verification. `src/openai-route-identity.mjs` must adapt those existing primitives and add only route/task/base correlation.

```js
export function buildOpenAiPrivateRouteBinding({ routeId, repository, codexBinding, boundAt }) {
  return Object.freeze({
    schemaVersion: 1,
    kind: "openai-private-route-binding",
    routeId,
    repository,
    codexAccountFingerprint: codexBinding.codexAccountFingerprint,
    codexInstallationFingerprint: codexBinding.codexInstallationFingerprint,
    codexEnvironmentFingerprint: codexBinding.codexEnvironmentFingerprint,
    receiptKeyFingerprint: codexBinding.receiptKeyFingerprint,
    boundAt,
  });
}
```

- [ ] **Step 4: Add wrong-lane, wrong-key, wrong-task, wrong-base, stale, malformed, and raw-secret rejection cases**

Run: `node --test --test-isolation=none test/openai-route-identity.test.mjs test/destiny-trigger-trust.test.mjs test/destiny-codex-bootstrap.test.mjs`

Expected: PASS.

- [ ] **Step 5: Refresh baseline and commit**

```bash
npm run baseline:refresh
npm run baseline:verify
git add src state/release-baseline/src test
git commit -m "feat: bind OpenAI route identity to signed receipts"
```

---

### Task 3: Zero-model GitHub Transport Fingerprint Observation

**Files:**
- Create: `src/openai-transport-observation.mjs`
- Create: `test/openai-transport-observation.test.mjs`
- Create: `state/release-baseline/src/openai-transport-observation.mjs`

**Interfaces:**
- Consumes: supported GitHub event payload plus event/action and optional delivery ID supplied by the caller.
- Produces: `observeOpenAiGithubTransport({ payload, eventName, action, deliveryId })` with canonical bounded fields and SHA-256 fingerprint.

- [ ] **Step 1: Write RED tests for shared and distinct transport metadata**

```js
test("transport observation is content-free and deterministic", () => {
  const a = observeOpenAiGithubTransport(input);
  const b = observeOpenAiGithubTransport(structuredClone(input));
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify(a), /token|prompt|body|credential|secret/i);
});

test("transport observation records installation id only when GitHub supplied it", () => {
  assert.equal(observeOpenAiGithubTransport(withInstallation).installationId, 12345);
  assert.equal(observeOpenAiGithubTransport(withoutInstallation).installationId, null);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/openai-transport-observation.test.mjs`

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement bounded observation**

Include only App slug/App ID if supplied, installation ID if supplied, sender login/id, repository ID/full name, event/action, PR/issue number, delivery ID, observed timestamp, and a canonical fingerprint. Reject extra caller-selected content fields rather than persisting raw payload.

- [ ] **Step 4: Run GREEN, refresh baseline, commit**

```bash
node --test --test-isolation=none test/openai-transport-observation.test.mjs
npm run baseline:refresh
npm run baseline:verify
git add src/openai-transport-observation.mjs test/openai-transport-observation.test.mjs state/release-baseline/src/openai-transport-observation.mjs
git commit -m "feat: observe OpenAI GitHub transport identity"
```

---

### Task 4: Crash-safe Digest-bound Destiny Submission Ledger

**Files:**
- Modify: `src/destiny-github-task.mjs`
- Modify: `scripts/destiny-codex-github-bridge.mjs`
- Create or modify: `test/destiny-codex-github-bridge.test.mjs`
- Modify: `test/destiny-github-task.test.mjs`
- Mirror essential source/script changes in release baseline where the existing baseline registry requires them.

**Interfaces:**
- `destinyGithubTaskDigest(task)` returns canonical SHA-256 over the accepted bounded task.
- Ledger state per task: `pending | submitting | submitted | failed-closed`.
- Reuse of a task ID with a different digest is always `submission-conflict`.

- [ ] **Step 1: Write RED tests for digest and crash windows**

```js
test("same task id with different immutable digest fails closed", () => {
  assert.throws(() => planSubmission({ ledger: existingSubmitted, task: conflictingTask }), /submission-conflict/);
});

test("submitting state blocks an automatic second external call", () => {
  assert.deepEqual(planSubmission({ ledger: inFlight, task }), { execute: false, reason: "submission-in-progress" });
});
```

Also add a child-process/injected-executor test proving the bridge persists `submitting` before invoking `codex cloud exec` and never auto-retries an indeterminate `submitting` record after process failure.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/destiny-github-task.test.mjs test/destiny-codex-github-bridge.test.mjs`

Expected: current bridge fails these atomic/idempotency cases.

- [ ] **Step 3: Implement atomic ledger state**

Use same-directory temp-file + rename semantics for ledger replacement and an exclusive single-flight lock (`open(..., "wx")` or equivalent) around mutation. Do not create an unbounded retry loop. Persist only issue number, task ID, task digest, state, timestamps, task URL if known, output hash if known, and bounded failure reason.

- [ ] **Step 4: Run concurrency/replay/adversarial tests**

Run: `node --test --test-isolation=none test/destiny-github-task.test.mjs test/destiny-codex-github-bridge.test.mjs test/destiny-codex-bootstrap.test.mjs`

Expected: PASS with one external submission maximum per task digest.

- [ ] **Step 5: Commit**

```bash
git add scripts/destiny-codex-github-bridge.mjs src/destiny-github-task.mjs test
git commit -m "fix: make Destiny submission crash-safe and digest-bound"
```

---

### Task 5: PR Wake Envelope and Repository-owned Review Suppression

**Files:**
- Modify: `src/destiny-github-task.mjs`
- Modify: `src/github-audit.mjs`
- Modify: `test/destiny-github-task.test.mjs`
- Modify: GitHub-audit tests already covering workflow/instruction policy.
- Modify docs: `docs/GITHUB-CODEX-COORDINATION.md`, `docs/DESTINY-EVENT-DISPATCH-LANE.md`.

**Interfaces:**
- Produces a bounded v1 wake envelope that references a source issue/task but is carried by qualifying PR activity.
- Envelope binds `routeId`, repository, exact base SHA, source task ID, task digest, one pairing/wake nonce, `implementationOnly: true`, `codeReview: false`, `attempts: 1`.

- [ ] **Step 1: Write RED policy tests**

```js
test("paired route wake rejects review authority", () => {
  assert.throws(() => parsePairedRouteWake({ ...validWake, codeReview: true }), /paired-route-review-forbidden/);
});

test("paired route wake requires exact base and immutable task digest", () => {
  assert.throws(() => parsePairedRouteWake({ ...validWake, baseSha: "deadbeef" }), /paired-route-base-sha-invalid/);
});
```

Add a GitHub audit fixture showing any active Mahoraga-owned workflow/instruction that requests `@codex review` or equivalent Codex review authority is blocking. Historical docs may be exempt only by explicit path/archival rule; active workflow/instruction surfaces must fail.

- [ ] **Step 2: Run RED**

Run focused task and GitHub-audit tests.

- [ ] **Step 3: Implement PR wake parsing/rendering by reusing the existing Work/event marker path**

Do not add `issues` as a model wake event. The issue remains the durable objective ledger; the PR event is the wake surface. Do not make a wake PR itself an implementation candidate or grant merge authority.

- [ ] **Step 4: Update coordination docs with the exact flow**

Document:

`issue/task ledger -> exact-head wake PR -> shared OpenAI GitHub transport -> account-side signed route identity -> result/candidate -> exact-head Verify`.

Explicitly state shared App metadata is supplemental transport evidence only.

- [ ] **Step 5: Run GREEN and commit**

```bash
node --test --test-isolation=none test/destiny-github-task.test.mjs
npm run github:audit
git add src/destiny-github-task.mjs src/github-audit.mjs test docs/GITHUB-CODEX-COORDINATION.md docs/DESTINY-EVENT-DISPATCH-LANE.md
git commit -m "feat: add paired route PR wake contract"
```

---

### Task 6: Capability Graph Projection for Proven Routes

**Files:**
- Create: `src/openai-route-capabilities.mjs`
- Modify: `src/world-state-observer.mjs`
- Modify: `test/delegated-work-fabric.test.mjs`
- Modify: `test/runtime.test.mjs`
- Create/modify corresponding release-baseline source files.

**Interfaces:**
- Consumes: validated registry, bounded readiness evidence, route health/workload metadata.
- Produces: capability-route records already accepted by `buildUniversalCapabilityGraph`.

- [ ] **Step 1: Write RED tests**

```js
test("unconfigured OpenAI route is visible but not routable", () => {
  const [route] = projectOpenAiCapabilityRoutes({ registry, routeId: "openai-destiny", readiness: null });
  assert.equal(route.workerId, "openai-destiny");
  assert.equal(route.routable, false);
  assert.equal(route.routingReason, "route-unconfigured");
});

test("signed ready route becomes a worker without becoming a second router", () => {
  const graph = buildUniversalCapabilityGraph({ capabilityRoutes: projectOpenAiCapabilityRoutes(readyInput), agents: [], observedAt: NOW });
  assert.equal(graph.nodes.find((node) => node.id === "worker:openai-destiny").enabled, true);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs test/runtime.test.mjs`

Expected: route adapter unavailable.

- [ ] **Step 3: Implement the adapter**

Use existing route schema fields: `workerId`, `workerLabel`, `enabled`, `availability`, `routable`, `evidenceLevel`, `routingReason`, `interfaceType`, `permissionClass`, `reliability`, `requiresAttendedDesktop`, `executionType`, `latencyMs`, `maximumWorkload`, `workload`, `fallbackWorkerIds`, `costClass`, `dataClasses`, `executionPlane`. Never include raw account/private route state.

Start both routes not-routable until legitimate readiness exists. Do not synthesize a ready observation in checked-in config or tests outside fixtures.

- [ ] **Step 4: Wire only bounded projection into world state**

Do not modify `planDelegatedWork` authority semantics. The graph continues to decide whether the route is selectable.

- [ ] **Step 5: Run GREEN, baseline, commit**

```bash
node --test --test-isolation=none test/delegated-work-fabric.test.mjs test/runtime.test.mjs test/openai-route-registry.test.mjs test/openai-route-identity.test.mjs
npm run baseline:refresh
npm run baseline:verify
git add src state/release-baseline/src test
git commit -m "feat: project paired OpenAI routes into capability graph"
```

---

### Task 7: Full Verification, Live Transport Probe Readiness, and Issue Reconciliation

**Files:**
- Modify only directly necessary docs/tests discovered by full verification.
- No trust-manifest promotion unless a real account-side signed pairing receipt is available and verified.

**Interfaces:**
- Final candidate branch: `feature/paired-openai-route-registry-20260908`.
- Exact implementation base recorded as `c43e646e7587fc73359e974fe7c9dd669de9d53e`; re-check actual `main` immediately before PR creation.

- [ ] **Step 1: Run focused suite**

```bash
node --test --test-isolation=none \
  test/openai-route-registry.test.mjs \
  test/openai-route-identity.test.mjs \
  test/openai-transport-observation.test.mjs \
  test/destiny-codex-bootstrap.test.mjs \
  test/destiny-github-task.test.mjs \
  test/destiny-codex-github-bridge.test.mjs \
  test/delegated-work-fabric.test.mjs \
  test/runtime.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Run repository verification**

Run: `npm run verify`

Expected: zero failures; no Codex review invocation; Vercel status is not used as completion evidence.

- [ ] **Step 3: Inspect exact changed-path boundary**

Run: `git diff --check origin/main...HEAD`

Run: `git diff --name-status origin/main...HEAD`

Expected: only route registry/identity/transport, Destiny bridge/task, capability projection, tests, directly necessary docs/audit policy, and release-baseline mirrors.

- [ ] **Step 4: Re-check `main` head before opening PR**

If `main` moved, compare/rebase only after re-reading overlapping files and rerunning focused tests. Never review or merge against a stale candidate head.

- [ ] **Step 5: Open one focused PR without review traffic**

PR body must state:
- exact base/head SHAs;
- `codeReview: false` and no Codex review requested;
- both checked-in OpenAI routes remain unconfigured unless real signed pairing evidence was obtained;
- no raw account identity or private key in Git;
- issue reconciliation targets: #85 umbrella, #238 Work wake lane, #244 stale issue-task attempt, #183 historical probe.

- [ ] **Step 6: Require exact-head Ubuntu + Windows verification on unchanged PR head**

Do not count Codex comments or Vercel status as merge evidence.

- [ ] **Step 7: After merge, reconcile open issues based on evidence**

Recommended dispositions only after merged `main` is verified:
- #85: keep open until a real `openai-destiny` signed pairing/readiness receipt is verified; close only when identity/readiness acceptance criteria are actually met.
- #238: keep open until Destiny's account-persistent PR wake trigger is proven; then close completed.
- #244: close as superseded by the paired-route implementation once its crash-safe submission/review-suppression work is present on main; its recorded base is already stale after #245.
- #183: close as superseded/not-planned once the paired route handshake replaces the one-off probe; preserve PR #237 as historical evidence.
- #220: close completed if current UI/package metadata remains `7.0.0-alpha.2`; it is a completed-state note, not an actionable issue.
- #208: close not-planned if Vercel remains intentionally non-gating/retired from the active completion architecture; otherwise move it to an external-service maintenance backlog rather than blocking Mahoraga.
- #165: re-evaluate against current live Windows runtime before closing; repository still exposes `start:candidate` and the original host canary evidence has not been recorded.
- #83: rewrite/split before closing; Wave A and exact-head ruleset work are already complete, while Wave B reconciliation and stale GitLab assurance are separate remaining concerns.

## Self-Review

- Spec coverage: registry, private binding, pairing receipt, cross-lane rejection, transport observation, PR wake, review suppression, crash-safe submission, capability graph projection, zero-credit policy, exact-head integration, and issue reconciliation are all assigned to explicit tasks.
- Placeholder scan: no `TBD`, `TODO`, or implementation-later placeholders remain.
- Type consistency: route IDs, binding fields, task digest/base SHA correlation, and capability route fields are consistent across tasks.
- Scope: economic credit metering itself is intentionally excluded; this implementation supplies distinct route identity/readiness for that later layer.

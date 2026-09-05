# Sovereign Coworker Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic contracts for durable AI coworkers, teach-once routines, specialized-purpose adaptive apertures, and sovereign core evolution without replacing Mahoraga's existing control plane.

**Architecture:** New focused Node ESM modules provide immutable contracts for coworker runtime state, routine learning, aperture leases, and trust epochs. `src/autonomous-integration.mjs` remains the integration gate but gains a second fail-closed path for protected changes carrying an exact-head sovereign-evolution receipt. Existing ordinary integration behavior remains unchanged.

**Tech Stack:** Node.js 24 ESM, `node:test`, `node:assert/strict`, existing Mahoraga validation patterns.

**Spec:** `docs/superpowers/specs/2026-09-05-sovereign-coworker-fabric-design.md`

## Global Constraints

- Preserve the existing Node ESM `.mjs` control plane and TypeScript UI surfaces.
- No permanently open arbitrary TCP tunnel.
- No direct public exposure of Mahoraga's loopback API.
- No routine may store credentials or secret values.
- Protected paths remain rejected unless complete sovereign-evolution evidence is present.
- Trusted epoch N, not candidate N+1, validates N+1.
- The requesting worker cannot extend or override its own aperture lease.
- Owner sovereignty, seal/revoke authority, and at least one viable rollback generation remain outside autonomous modification.
- Every new production behavior must have a failing test first and pass the full `npm run verify` gate before PR completion.

---

### Task 1: Teach-once Routine Library

**Files:**
- Create: `test/routine-library.test.mjs`
- Create: `src/routine-library.mjs`

**Interfaces:**
- Produces: `compileRoutineDemonstration(input, options)` -> immutable routine record.
- Produces: `correctRoutine(routine, correction, options)` -> next immutable routine version.
- Produces: `rankRoutines(routines, context)` -> ordered immutable candidates.
- Produces: `verifyRoutineReplay(routine, replay)` -> `{ verified, reason }`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/routine-library.mjs'); } catch {}

test('a semantic demonstration compiles without storing secret parameter values', () => {
  assert.equal(typeof subject.compileRoutineDemonstration, 'function');
  const routine = subject.compileRoutineDemonstration({
    agentId: 'mahoraga-invoice-specialist',
    capability: 'invoice-collection',
    intent: 'Collect an invoice PDF and verify the account match.',
    parameters: [{ name: 'account-id', secret: false }, { name: 'session-token', secret: true }],
    surfaces: ['browser'],
    steps: [
      { action: 'open-account-record', evidence: ['account-visible'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
    successEvidence: ['invoice-file-present'],
  }, { learnedAt: '2026-09-05T08:00:00.000Z' });
  assert.equal(routine.version, 1);
  assert.deepEqual(routine.parameters.map((item) => item.name), ['account-id', 'session-token']);
  assert.equal(JSON.stringify(routine).includes('secret-value'), false);
});

test('a correction creates a new immutable version and replay requires declared evidence', () => {
  const base = subject.compileRoutineDemonstration({
    agentId: 'mahoraga-invoice-specialist', capability: 'invoice-collection', intent: 'Collect invoice.',
    parameters: [], surfaces: ['browser'], steps: [{ action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' }],
    successEvidence: ['invoice-file-present'],
  }, { learnedAt: '2026-09-05T08:00:00.000Z' });
  const corrected = subject.correctRoutine(base, {
    reason: 'Verify account before download.',
    steps: [
      { action: 'verify-account-match', evidence: ['account-match'], sideEffect: 'none' },
      { action: 'download-invoice-pdf', evidence: ['invoice-file-present'], sideEffect: 'download' },
    ],
  }, { learnedAt: '2026-09-05T09:00:00.000Z' });
  assert.equal(base.version, 1);
  assert.equal(corrected.version, 2);
  assert.deepEqual(subject.verifyRoutineReplay(corrected, { evidence: ['account-match'] }), { verified: false, reason: 'success-evidence-missing' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-isolation=none test/routine-library.test.mjs`
Expected: FAIL because `src/routine-library.mjs` does not exist / exported functions are missing.

- [ ] **Step 3: Write minimal implementation**

Implement strict exact-shape validation, deterministic SHA-256 routine IDs, immutable versions, parameter metadata only, semantic steps, correction history, confidence fields, ranking by capability/surface/confidence/failure penalty, and success-evidence verification.

Core signatures:

```js
export function compileRoutineDemonstration(input, { learnedAt = new Date().toISOString() } = {}) {}
export function correctRoutine(routine, correction, { learnedAt = new Date().toISOString() } = {}) {}
export function rankRoutines(routines, context = {}) {}
export function verifyRoutineReplay(routine, replay = {}) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-isolation=none test/routine-library.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/routine-library.test.mjs src/routine-library.mjs
git commit -m "feat: add semantic routine learning contracts"
```

### Task 2: Durable Coworker Runtime and Handoffs

**Files:**
- Create: `test/coworker-fabric.test.mjs`
- Create: `src/coworker-fabric.mjs`

**Interfaces:**
- Consumes: existing Foundry agent IDs and Feat Ledger IDs.
- Produces: `createCoworkerState(input, options)`.
- Produces: `createHandoffEnvelope(input, options)`.
- Produces: `enqueueHandoff(state, envelope)` with idempotent insertion.
- Produces: `recordCoworkerOutcome(state, outcome, options)`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
let subject = {};
try { subject = await import('../src/coworker-fabric.mjs'); } catch {}

test('coworker state is durable-shaped and handoffs are idempotent', () => {
  assert.equal(typeof subject.createCoworkerState, 'function');
  const state = subject.createCoworkerState({ agentId: 'mahoraga-browser-specialist' }, { at: '2026-09-05T08:00:00.000Z' });
  const handoff = subject.createHandoffEnvelope({
    fromAgentId: 'mahoraga-steward', toAgentId: 'mahoraga-browser-specialist', objectiveId: 'objective-42',
    capability: 'signed-browser-session', task: 'Verify the signed browser session.', inputs: ['artifact:session'],
    expectedOutputs: ['receipt:browser-verification'], urgency: 'normal', mayDelegate: true,
  }, { createdAt: '2026-09-05T08:01:00.000Z' });
  const once = subject.enqueueHandoff(state, handoff);
  const twice = subject.enqueueHandoff(once, handoff);
  assert.equal(once.inbox.length, 1);
  assert.deepEqual(twice, once);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-isolation=none test/coworker-fabric.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement immutable lifecycle state (`idle`, `working`, `waiting`, `blocked`, `draining`, `sealed`), deterministic handoff IDs, objective/routine/feat arrays, inbox, scorecard counters, and timestamp validation. `recordCoworkerOutcome` updates success/failure/blocked counters and heartbeat/activity timestamps without changing identity.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-isolation=none test/coworker-fabric.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/coworker-fabric.test.mjs src/coworker-fabric.mjs
git commit -m "feat: add durable coworker handoff fabric"
```

### Task 3: Specialized-Purpose Aperture Contracts

**Files:**
- Create: `test/aperture-policy.test.mjs`
- Create: `src/aperture-policy.mjs`

**Interfaces:**
- Produces: `createApertureRequest(input, options)`.
- Produces: `validateApertureDecision(request, decision, options)`.
- Produces: `issueApertureLease(request, decision, options)`.
- Produces: `shouldCloseAperture(lease, state, options)`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
let subject = {};
try { subject = await import('../src/aperture-policy.mjs'); } catch {}

test('a novel specialized aperture can be auto-authorized only by an independent validator', () => {
  assert.equal(typeof subject.createApertureRequest, 'function');
  const request = subject.createApertureRequest({
    objectiveId: 'objective-42', requestingAgentId: 'mahoraga-builder-specialist', capability: 'service-specialized',
    purpose: 'Expose a temporary local validation server.', target: 'worker-2:5173', expectedPeer: 'validator-1', protocol: 'tcp',
    ttlMs: 1_200_000, idleTtlMs: 180_000, novel: true,
  }, { requestedAt: '2026-09-05T08:00:00.000Z' });
  assert.throws(() => subject.issueApertureLease(request, {
    validatorAgentId: 'mahoraga-builder-specialist', approved: true, reason: 'self approved',
  }, { issuedAt: '2026-09-05T08:00:01.000Z' }), /aperture-validator-independent-required/);
  const lease = subject.issueApertureLease(request, {
    validatorAgentId: 'mahoraga-validator', approved: true, reason: 'bounded specialized purpose',
  }, { issuedAt: '2026-09-05T08:00:01.000Z' });
  assert.equal(lease.lateralRoutingAllowed, false);
  assert.equal(lease.ownerApprovalRequired, false);
});

test('objective completion deterministically closes the lease', () => {
  const request = subject.createApertureRequest({ objectiveId: 'objective-42', requestingAgentId: 'mahoraga-builder-specialist', capability: 'developer-preview', purpose: 'Preview candidate.', target: 'worker-2:5173', expectedPeer: 'validator-1', protocol: 'tcp', ttlMs: 60_000, idleTtlMs: 10_000, novel: false }, { requestedAt: '2026-09-05T08:00:00.000Z' });
  const lease = subject.issueApertureLease(request, { validatorAgentId: 'mahoraga-validator', approved: true, reason: 'valid' }, { issuedAt: '2026-09-05T08:00:01.000Z' });
  assert.deepEqual(subject.shouldCloseAperture(lease, { objectiveComplete: true }, { now: '2026-09-05T08:00:02.000Z' }), { close: true, reason: 'objective-complete' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-isolation=none test/aperture-policy.test.mjs`
Expected: FAIL because aperture contracts are absent.

- [ ] **Step 3: Write minimal implementation**

Validate declared purpose, objective, capability, target, expected peer, protocol, TTL (`1s..24h`), idle TTL (`1s..TTL`), and independent validator. Generate deterministic request/lease IDs. Novel requests require independent approval; known requests still require a validator receipt but no owner approval. Closure precedence: seal/revoke/integrity/peer/heartbeat/objective/expiry/idle/post-update.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-isolation=none test/aperture-policy.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/aperture-policy.test.mjs src/aperture-policy.mjs
git commit -m "feat: add adaptive aperture lease contracts"
```

### Task 4: Trust Epoch and Sovereign Evolution Receipt

**Files:**
- Create: `test/sovereign-evolution.test.mjs`
- Create: `src/sovereign-evolution.mjs`

**Interfaces:**
- Produces: `createTrustEpoch(input, options)`.
- Produces: `createSovereignEvolutionReceipt(input, options)`.
- Produces: `validateSovereignEvolutionReceipt(receipt, context)`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
let subject = {};
try { subject = await import('../src/sovereign-evolution.mjs'); } catch {}

test('trusted epoch N can attest exact-head candidate N+1 only with rollback and canary evidence', () => {
  assert.equal(typeof subject.createTrustEpoch, 'function');
  const epoch = subject.createTrustEpoch({
    epochId: 'epoch-41', trustedCommit: 'a'.repeat(40), verifierFingerprint: 'b'.repeat(64), rollbackCheckpointId: 'checkpoint-41', policyGeneration: 41,
  }, { activatedAt: '2026-09-05T08:00:00.000Z' });
  const receipt = subject.createSovereignEvolutionReceipt({
    trustedEpoch: epoch, candidateCommit: 'c'.repeat(40), candidateEpochId: 'epoch-42', validatorAgentId: 'mahoraga-validator',
    validatorPassed: true, deterministicVerificationPassed: true, rollbackCheckpointCreated: true, rollbackRehearsalPassed: true,
    canaryPassed: true, stateCompatibilityPassed: true, sovereigntyInvariantPassed: true,
  }, { evaluatedAt: '2026-09-05T08:30:00.000Z' });
  assert.equal(subject.validateSovereignEvolutionReceipt(receipt, { headSha: 'c'.repeat(40), trustedEpochId: 'epoch-41' }).valid, true);
  assert.equal(subject.validateSovereignEvolutionReceipt(receipt, { headSha: 'd'.repeat(40), trustedEpochId: 'epoch-41' }).reason, 'sovereign-head-mismatch');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-isolation=none test/sovereign-evolution.test.mjs`
Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Write minimal implementation**

Require exact commit/fingerprint formats, monotonically different candidate epoch ID, independent validator identity, every required boolean proof set to true, exact-head match, and exact trusted-epoch match. Return immutable records.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-isolation=none test/sovereign-evolution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/sovereign-evolution.test.mjs src/sovereign-evolution.mjs
git commit -m "feat: add trust epoch evolution receipts"
```

### Task 5: Protected-Path Autonomous Integration via Sovereign Receipt

**Files:**
- Modify: `test/autonomous-integration.test.mjs`
- Modify: `src/autonomous-integration.mjs`

**Interfaces:**
- Consumes: `validateSovereignEvolutionReceipt(receipt, context)` from Task 4.
- Existing `evaluateAutonomousIntegration(input, policy)` signature remains unchanged.

- [ ] **Step 1: Write the failing test**

Add a case proving protected paths remain rejected without a receipt, but become eligible with a complete exact-head receipt:

```js
test('protected paths require a valid sovereign-evolution receipt', () => {
  const headSha = 'c'.repeat(40);
  const base = candidate({ headSha, changedFiles: ['src/autonomy-policy.mjs'] });
  base.workflow.headSha = headSha;
  assert.equal(evaluateAutonomousIntegration(base, policy).reason, 'protected-path');

  const sovereign = candidate({
    headSha,
    changedFiles: ['src/autonomy-policy.mjs'],
    sovereignEvolution: validReceiptFor(headSha),
    trustedEpochId: 'epoch-41',
  });
  sovereign.workflow.headSha = headSha;
  assert.equal(evaluateAutonomousIntegration(sovereign, policy).eligible, true);
  assert.equal(evaluateAutonomousIntegration(sovereign, policy).reason, 'sovereign-eligible');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-isolation=none test/autonomous-integration.test.mjs`
Expected: FAIL because protected paths are always rejected.

- [ ] **Step 3: Write minimal implementation**

Import `validateSovereignEvolutionReceipt`. Compute whether any changed file is protected. If none are protected, preserve the exact existing eligibility path and reason `eligible`. If protected files exist, require `pullRequest.sovereignEvolution` and `pullRequest.trustedEpochId`; validate against `pullRequest.headSha`; reject with `protected-path` when absent and the sovereign validator's reason when malformed. Return `reason: 'sovereign-eligible'` only on complete proof.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-isolation=none test/autonomous-integration.test.mjs`
Expected: PASS including all pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add test/autonomous-integration.test.mjs src/autonomous-integration.mjs
git commit -m "feat: gate core autonomous integration by trust epoch"
```

### Task 6: Replace Blanket Tunnel Ban with Specialized-Purpose Policy

**Files:**
- Modify: `docs/ECOSYSTEM-LOCK.md`

**Interfaces:**
- Documents the Task 3 contract; no runtime API change.

- [ ] **Step 1: Update the governing text**

Replace language that categorically rejects inbound tunnels with the exact rule:

```md
Persistent, unbounded public exposure is prohibited. Mahoraga-controlled specialized-purpose apertures are a first-class capability. They must be objective-bound, independently validated, time-limited, peer/target scoped, auditable, and automatically closed. The loopback Mahoraga API must never be exposed directly to the public internet.
```

Also state that core self-evolution may proceed autonomously only through incumbent trust-epoch validation, canary, and rollback evidence.

- [ ] **Step 2: Run static policy tests**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/ECOSYSTEM-LOCK.md
git commit -m "docs: permit bounded adaptive apertures"
```

### Task 7: Full Verification and PR Finalization

**Files:**
- Inspect all changed files.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run focused tests**

```bash
node --test --test-isolation=none test/routine-library.test.mjs test/coworker-fabric.test.mjs test/aperture-policy.test.mjs test/sovereign-evolution.test.mjs test/autonomous-integration.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run authoritative verification**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 3: Review diff for accidental scope expansion**

Run: `git diff main...HEAD -- src test docs`
Expected: only the files declared by this plan plus the design/plan docs.

- [ ] **Step 4: Ensure PR remains merge-gated**

Open/update a PR from `feature/sovereign-coworker-fabric` to `main`. Do not bypass failed checks. The PR description must state that OS/network adapters are not included in this first contract PR.

## Self-Review

- Spec coverage: Tasks 1-6 cover routine learning, coworkers/handoffs, aperture leases, trust epochs, protected-path sovereign integration, and governing documentation. Actual network/desktop adapters are explicitly outside this PR per spec.
- Placeholder scan: no TBD/TODO/future-placeholder implementation steps are used.
- Type consistency: Task 5 consumes the exact `validateSovereignEvolutionReceipt(receipt, context)` interface from Task 4. Other tasks are independent deterministic modules.

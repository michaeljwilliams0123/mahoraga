# UCF Graph v2 + Adaptive Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Mahoraga's existing universal capability graph into an execution-aware graph and make recoverable routing failures automatically retry or reroute instead of terminating the objective.

**Architecture:** Extend the existing graph/registry rather than adding a second router. A deterministic recovery planner consumes route evidence and returns bounded recovery actions; `routeTask` exposes that plan and the supervisor requeues only recoverable route failures. Structural authority, data, identity, and explicit-user gates remain non-recoverable.

**Tech Stack:** Node.js ESM `.mjs`, `node:test`, existing SQLite task store, existing capability registry/router/supervisor.

**Spec:** `docs/superpowers/specs/2026-09-10-universal-capability-fabric-design.md`

## Global Constraints

- One user-facing Mahoraga conversation; provider/lane switching stays behind the scenes.
- Effective privileged execution remains owner grant ∩ platform permission ∩ capability declaration.
- No secrets, bearer tokens, refresh tokens, cookies, or private content in graph/recovery records.
- No public tunnels, reverse proxies, port forwarding, DevTools/CDP listeners, or caller-selected transports.
- Development communication targets remain the owner and stable registered Mahoraga agent identities only.
- Deterministic/local and already-licensed routes remain preferred over metered routes.
- Preserve existing exact-head verification, idempotency, canary, rollback, and stop/override behavior.
- Use `npm.cmd` on Windows.

---

### Task 1: Universal Capability Graph v2 Route Metadata

**Files:**
- Modify: `src/universal-capability-graph.mjs`
- Modify: `test/delegated-work-fabric.test.mjs`

**Interfaces:**
- Consumes existing capability-route records from `buildCapabilityRegistry`.
- Produces graph schema v2 `provides` edges with `authorityScopes`, `idempotencyClass`, `recoveryClasses`, and deterministic `routeFingerprint`.

- [ ] **Step 1: Write failing graph-v2 tests**

Add assertions that a route with `authorityScopes: ["connector.invoke"]` yields a `provides` edge with the same scopes, `idempotencyClass: "task-key"`, normalized recovery classes, and a 64-hex `routeFingerprint`. Add a validator test rejecting `credential`, `token`, or unknown route fields.

```js
const edge = graph.edges.find((item) => item.type === "provides");
assert.equal(graph.schemaVersion, 2);
assert.deepEqual(edge.authorityScopes, ["connector.invoke"]);
assert.equal(edge.idempotencyClass, "task-key");
assert.match(edge.routeFingerprint, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the graph test RED**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`
Expected: FAIL because schema v1 edges do not carry the new route metadata.

- [ ] **Step 3: Implement minimal graph-v2 normalization and validation**

Bump `UNIVERSAL_CAPABILITY_GRAPH_SCHEMA_VERSION` to `2`. Normalize optional route metadata to safe defaults:

```js
authorityScopes: tokenList(value.authorityScopes ?? [], 32, 96, "capability-graph-authority-invalid"),
idempotencyClass: value.idempotencyClass ?? "task-key",
recoveryClasses: tokenList(value.recoveryClasses ?? [], 16, 64, "capability-graph-recovery-invalid"),
routeFingerprint: digest(routeIdentityCore),
```

The fingerprint core contains only worker/capability/interface/permission/execution-plane/cost/data-class metadata; never runtime credential material.

- [ ] **Step 4: Run the graph test GREEN**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/universal-capability-graph.mjs test/delegated-work-fabric.test.mjs
git commit -m "feat(ucf): enrich universal capability graph routes"
```
### Task 2: Deterministic Capability Recovery Planner

**Files:**
- Create: `src/capability-recovery.mjs`
- Create: `test/capability-recovery.test.mjs`

**Interfaces:**
- Produces `planCapabilityRecovery({ reason, task, consideredRoutes, excludedWorkerIds })`.
- Returns frozen `{ recoverable, reason, actions, exhausted }` with no provider calls.
- Action kinds are `refresh-readiness`, `retry-route`, `reroute`, `repair-worker`, `refresh-auth`, `configure-adapter`, `provision-adapter`.

- [ ] **Step 1: Write failing recovery classification tests**

Cover `canary-stale`, `worker-excluded`, `routing-evidence-missing`, `provider-unavailable`, `platform-authority-missing`, `owner-grant-missing`, `data-class-not-supported`, and attempt exhaustion.

```js
assert.deepEqual(
  planCapabilityRecovery({ reason: "canary-stale", task, consideredRoutes: [route], excludedWorkerIds: [] }).actions.map((x) => x.kind),
  ["refresh-readiness", "retry-route"]
);
assert.equal(planCapabilityRecovery({ reason: "owner-grant-missing", task, consideredRoutes: [], excludedWorkerIds: [] }).recoverable, false);
```

- [ ] **Step 2: Run recovery tests RED**

Run: `node --test --test-isolation=none test/capability-recovery.test.mjs`
Expected: FAIL because the module does not exist.
- [ ] **Step 3: Implement bounded reason-to-action mapping**

Use fixed reason classes. Recoverable examples:

```js
const RECOVERY = Object.freeze({
  "canary-stale": ["refresh-readiness", "retry-route"],
  "provider-unavailable": ["refresh-readiness", "reroute"],
  "worker-excluded": ["reroute"],
  "routing-evidence-missing": ["refresh-readiness", "configure-adapter", "reroute"],
  "platform-authority-missing": ["refresh-auth"]
});
```

Structural reasons such as `owner-grant-missing`, `scope-revoked`, `data-class-not-supported`, `agent-capability-not-declared`, `owner-confirmation-required`, and explicit recipient restrictions return `recoverable: false`.

The planner must cap actions at 8, reject unknown fields, and never emit arbitrary command text, URLs, credentials, recipients, or executable paths.

- [ ] **Step 4: Run recovery tests GREEN**

Run: `node --test --test-isolation=none test/capability-recovery.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/capability-recovery.mjs test/capability-recovery.test.mjs
git commit -m "feat(ucf): add deterministic capability recovery planner"
```
### Task 3: Router Recovery Metadata and Alternate Preservation

**Files:**
- Modify: `src/capability-registry.mjs`
- Modify: `src/router.mjs`
- Modify: `test/router.test.mjs`

**Interfaces:**
- `rankCapabilityRoutes(...)` additionally returns `considered` safe route records.
- Waiting results from `routeTask(...)` additionally expose `recoveryPlan` when deterministic recovery is possible.
- Routable results continue to expose `worker`, `decision`, and `alternates` unchanged.

- [ ] **Step 1: Write failing router tests**

Add one case where all eligible routes are stale and the router returns a `refresh-readiness` / `retry-route` recovery plan, plus one case where missing owner authority produces no automatic recovery. Preserve the existing behavior where a healthy alternate is selected immediately rather than entering recovery.

```js
const result = routeTask(manifest, task, { workerStates });
assert.equal(result.status, "waiting");
assert.equal(result.recoveryPlan.recoverable, true);
assert.equal(result.recoveryPlan.actions.some((x) => x.kind === "refresh-readiness"), true);
```

- [ ] **Step 2: Run router tests RED**

Run: `node --test --test-isolation=none test/router.test.mjs test/readiness-routing.test.mjs`
Expected: FAIL because waiting routes do not expose recovery metadata.
- [ ] **Step 3: Preserve safe considered routes and attach recovery**

In `rankCapabilityRoutes`, return the static-eligible/evaluated route set as `considered` without secrets. In `router.mjs`, centralize waiting responses through a helper:

```js
function waitingWithRecovery(reason, task, ranked, extra = {}) {
  const recoveryPlan = planCapabilityRecovery({
    reason,
    task,
    consideredRoutes: ranked?.considered ?? [],
    excludedWorkerIds: task.excludedWorkerIds ?? [],
  });
  return { status: "waiting", reason, worker: null, ...(recoveryPlan.recoverable ? { recoveryPlan } : {}), ...extra };
}
```

Authority-denied waiting passes the authority reason through the same helper; only reasons classified recoverable receive an automatic recovery plan.

- [ ] **Step 4: Run router tests GREEN**

Run: `node --test --test-isolation=none test/router.test.mjs test/readiness-routing.test.mjs test/openai-route-registry.test.mjs test/capability-recovery.test.mjs`
Expected: PASS with existing routable behavior unchanged.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/capability-registry.mjs src/router.mjs test/router.test.mjs
git commit -m "feat(ucf): attach adaptive recovery to routing decisions"
```
### Task 4: Supervisor Auto-Requeue for Recoverable Route Drift

**Files:**
- Modify: `src/database.mjs`
- Modify: `src/supervisor.mjs`
- Modify: `test/supervisor.test.mjs`

**Interfaces:**
- Add `database.requeueForRouteRecovery({ taskId, reason, excludedWorkerId })` for a running task.
- Requeue preserves objective/conversation/idempotency identity, clears the lease/assignment, increments no synthetic attempt, and optionally excludes one failed route.
- Supervisor uses it only when `routeTask(...).recoveryPlan.recoverable === true` and task attempts remain.

- [ ] **Step 1: Write failing supervisor/database tests**

Create a task claimed by a worker, then simulate route drift to `canary-stale`. Assert that the task returns to `queued`, retains its objective/correlation/idempotency identity, records the bounded reason, and does not create an `approval-required` run event. Add an exhaustion case that retains existing terminal waiting behavior.

```js
const recovered = database.requeueForRouteRecovery({ taskId: task.id, reason: "canary-stale", excludedWorkerId: "desktop" });
assert.equal(recovered.status, "queued");
assert.equal(recovered.errorCode, "route-recovery-canary-stale");
assert.deepEqual(recovered.excludedWorkerIds, ["desktop"]);
```

- [ ] **Step 2: Run focused supervisor tests RED**

Run: `node --test --test-isolation=none test/supervisor.test.mjs`
Expected: FAIL because the database recovery method and supervisor branch do not exist.
- [ ] **Step 3: Implement route-recovery requeue and supervisor use**

Database method validates a bounded reason token, updates only `running` tasks to `queued`, clears `assigned_worker`/lease, optionally adds the current worker to the existing exclusion set, and records `task.route-recovered` metadata only.

In `Supervisor.#tick()`, replace the immediate terminal waiting path with:

```js
if (route.status !== "routable" || route.worker.id !== state.definition.id) {
  if (route.recoveryPlan?.recoverable === true && task.attemptCount < task.maximumAttempts) {
    this.database.requeueForRouteRecovery({
      taskId: task.id,
      reason: route.reason ?? "routing-changed",
      excludedWorkerId: route.recoveryPlan.actions.some((x) => x.kind === "reroute") ? state.definition.id : null,
    });
  } else {
    this.database.finishTask(task.id, { status: "waiting", errorCode: route.reason ?? "routing-changed" });
  }
  continue;
}
```

No external connector call is performed by this recovery branch; it only keeps the objective alive and allows the normal scheduler to select the next eligible route.

- [ ] **Step 4: Run focused tests GREEN**

Run: `node --test --test-isolation=none test/supervisor.test.mjs test/router.test.mjs test/capability-recovery.test.mjs test/delegated-work-fabric.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/database.mjs src/supervisor.mjs test/supervisor.test.mjs
git commit -m "feat(ucf): keep objectives alive across recoverable route drift"
```
### Task 5: Release Baseline and Exact Verification

**Files:**
- Modify generated mirrors under `state/release-baseline/**` only through the repository baseline generator.
- Modify `src/repair.mjs` / `test/repair.test.mjs` only if the new recovery module must be declared essential for self-repair coverage.

**Interfaces:**
- No new runtime interface. This task proves the source-of-truth changes are repairable and release-consistent.

- [ ] **Step 1: Check essential baseline coverage**

Search `src/repair.mjs` for the essential production source list. If `src/capability-recovery.mjs` is not covered, add it and add an assertion to `test/repair.test.mjs`.

- [ ] **Step 2: Run focused repair test**

Run: `node --test --test-isolation=none test/repair.test.mjs`
Expected: PASS after essential coverage is complete.

- [ ] **Step 3: Refresh release baseline**

Run: `node scripts/create-release-baseline.mjs`
Expected: baseline copies exactly reflect current source/config.

- [ ] **Step 4: Run final verification**

Run: `git diff --check`
Expected: no output.

Run: `npm.cmd run verify`
Expected: exit code 0. Do not claim verification from a timeout or partial output; inspect the final process exit.

- [ ] **Step 5: Commit baseline and plan**

```bash
git add state/release-baseline src/repair.mjs test/repair.test.mjs docs/superpowers/plans/2026-09-10-ucf-graph-recovery-implementation.md
git commit -m "chore(ucf): baseline adaptive capability recovery"
```

- [ ] **Step 6: Push exact verified head to PR #289**

Push normally without force. If the remote moved, fetch/reconcile first and rerun affected verification. Do not request Codex review.
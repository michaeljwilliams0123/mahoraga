# Live Brain Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cloud-app/` a continuously refreshed, truthful projection of Mahoraga's running cognition state, with dynamic topology, real runtime Pulse events, bounded reconnect/stale behavior, and visualization-only idle circulation.

**Architecture:** Extend the existing runtime-owned operations/relay boundary instead of adding a frontend router. A new bounded brain observation projection combines supervisor state, capability registry state, content-free runtime events, and real route-learning state when available. The browser maintains a read-only observation loop with cursor replay and backoff; UI animation consumes that projection but never posts learning or routing mutations.

**Tech Stack:** Node.js 24 ESM `.mjs`, SQLite WAL, existing capability registry/router/conversation gateway/relay, Next.js 16.3.3 + React + TypeScript in `cloud-app/`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-live-brain-workspace-design.md`

## Global Constraints

- `cloud-app/` remains TypeScript; runtime/control-plane code remains Node ESM `.mjs`.
- The brain owns authoritative topology, routing, health, outcomes, reward, memory, and learning state.
- No frontend constant may define the authoritative worker/agent roster.
- Ambient UI activity is `visualizationOnly` and never writes runtime events, route observations, rewards, task statistics, episodic memory, or learning state.
- Existing authority, data-class, health, cost, idempotency, exact-head verification, and rollback gates remain hard constraints; learned preference only ranks routes that already passed those gates.
- If no runtime learner exists, the UI reports learning as unavailable; it must not synthesize weights or claim LinUCB activity.
- Static Pages deployment is not proof of runtime connectivity. Live-brain state requires an authenticated runtime/relay transport.

---

### Task 1: Add a bounded runtime brain observation projection

**Files:**
- Create: `src/brain-observation.mjs`
- Modify: `src/workspace-operations.mjs`
- Modify: `src/server.mjs`
- Test: `test/brain-observation.test.mjs`
- Test: `test/workspace-operations.test.mjs`

**Interfaces:**
- Consumes: `database.listEvents()`, `database.listTasks()`, `supervisor.status()`, and a `capabilityResolver()` returning current capability-registry route entries.
- Produces: `brainObservationSnapshot({ database, supervisor, capabilityResolver, learningSnapshot, now })` and `brainObservationEvents({ database, afterSequence, limit })`.

- [ ] **Step 1: Write the failing projection test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { brainObservationSnapshot, brainObservationEvents } from "../src/brain-observation.mjs";

test("brain snapshot derives topology from runtime routes and workers", () => {
  const snapshot = brainObservationSnapshot({
    database: {
      listTasks: () => [{ id: "mhg-1", status: "running", assignedWorker: "worker-a" }],
      listEvents: () => [],
    },
    supervisor: { status: () => [{ workerId: "worker-a", status: "healthy", capabilities: ["assistant.respond"] }] },
    capabilityResolver: () => [
      { capability: "assistant.respond", workerId: "worker-a", workerLabel: "Worker A", routable: true, availability: "healthy", health: "verified", reliability: 95, latencyMs: 10, workload: 1, costClass: "deterministic", executionPlane: "local" },
      { capability: "document.edit", workerId: "worker-b", workerLabel: "Worker B", routable: false, availability: "stale", health: "not-verified", reliability: 80, latencyMs: 50, workload: 0, costClass: "licensed-cloud", executionPlane: "microsoft" },
    ],
    learningSnapshot: () => ({ available: false, algorithm: null, routes: [] }),
    now: () => "2026-09-10T20:00:00.000Z",
  });
  assert.deepEqual(snapshot.topology.map((node) => node.id), ["worker-a", "worker-b"]);
  assert.equal(snapshot.topology[0].routable, true);
  assert.equal(snapshot.learning.available, false);
  assert.equal(snapshot.connectionTruth, "runtime-authoritative");
});

test("brain events are cursor based and contain no task content", () => {
  const database = { listEvents: () => [
    { sequence: 12, timestamp: "2026-09-10T20:00:01.000Z", eventType: "task.completed", subjectId: "mhg-1", details: { resultSummary: "secret", workerId: "worker-a" } },
    { sequence: 11, timestamp: "2026-09-10T20:00:00.000Z", eventType: "task.claimed", subjectId: "mhg-1", details: { workerId: "worker-a" } },
  ] };
  const result = brainObservationEvents({ database, afterSequence: 11, limit: 50 });
  assert.deepEqual(result.events.map((event) => event.sequence), [12]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node --test test/brain-observation.test.mjs
```

Expected: failure because `src/brain-observation.mjs` does not exist.

- [ ] **Step 3: Implement the minimal content-free projection**

Create `src/brain-observation.mjs` with these exports:

```js
const PUBLIC_EVENT_DETAIL_KEYS = new Set([
  "workerId", "capability", "reasonCode", "verifier", "taskState",
  "verificationState", "receiptCount", "routeId", "outcome", "reward",
  "policyVersion", "exploration", "recoveryAction",
]);

export function brainObservationSnapshot({ database, supervisor, capabilityResolver, learningSnapshot = null, now = () => new Date().toISOString() } = {}) {
  const generatedAt = now();
  const routes = Array.isArray(capabilityResolver?.()) ? capabilityResolver() : [];
  const workerState = new Map((supervisor?.status?.() ?? []).map((item) => [String(item.workerId ?? item.id), item]));
  const nodeMap = new Map();
  for (const route of routes) {
    const id = String(route.workerId);
    const node = nodeMap.get(id) ?? { id, label: String(route.workerLabel ?? id), capabilities: new Set(), routeCount: 0, routableCount: 0 };
    node.capabilities.add(String(route.capability));
    node.routeCount += 1;
    node.routableCount += route.routable === true ? 1 : 0;
    node.availability = String(route.availability ?? workerState.get(id)?.status ?? "unknown");
    node.executionPlane = String(route.executionPlane ?? "unknown");
    nodeMap.set(id, node);
  }
  const topology = [...nodeMap.values()].map((node) => Object.freeze({
    id: node.id,
    label: node.label,
    capabilities: [...node.capabilities].sort(),
    state: String(workerState.get(node.id)?.status ?? node.availability ?? "unknown"),
    routable: node.routableCount > 0,
    routeCount: node.routeCount,
    executionPlane: node.executionPlane,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const learning = typeof learningSnapshot === "function"
    ? learningSnapshot()
    : { available: false, algorithm: null, routes: [] };
  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    connectionTruth: "runtime-authoritative",
    eventCursor: Math.max(0, ...(database?.listEvents?.(1) ?? []).map((event) => Number(event.sequence) || 0)),
    topology: Object.freeze(topology),
    learning: Object.freeze(learning),
  });
}

export function brainObservationEvents({ database, afterSequence = 0, limit = 100 } = {}) {
  const bounded = Math.max(1, Math.min(Number(limit) || 100, 250));
  const events = (database?.listEvents?.(1000) ?? [])
    .filter((event) => Number(event.sequence) > afterSequence)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence))
    .slice(0, bounded)
    .map((event) => ({
      sequence: Number(event.sequence),
      timestamp: String(event.timestamp),
      type: String(event.eventType),
      subjectId: String(event.subjectId),
      details: Object.fromEntries(Object.entries(event.details ?? {}).filter(([key]) => PUBLIC_EVENT_DETAIL_KEYS.has(key))),
    }));
  return Object.freeze({ events: Object.freeze(events), cursor: events.at(-1)?.sequence ?? afterSequence });
}
```

Do not expose prompt text, result summaries, filenames, URLs, credentials, raw provider payloads, or arbitrary event detail keys.

- [ ] **Step 4: Wire the projection into the existing runtime handler**

In `src/server.mjs`, create one shared capability resolver instead of duplicating `capabilityIndex(...)`, pass it to `createRelayHandlers`, and add read-only handler methods:

```js
brainSnapshot() {
  return brainObservationSnapshot({ database, supervisor, capabilityResolver, learningSnapshot });
},
brainEvents(input) {
  return brainObservationEvents({ database, afterSequence: input?.afterSequence ?? 0, limit: input?.limit ?? 100 });
},
```

Add only `brain-snapshot` and `brain-events` to the cloud/runtime and relay read allowlists. Do not add a brain mutation action.

- [ ] **Step 5: Run focused tests**

```powershell
node --test test/brain-observation.test.mjs test/workspace-operations.test.mjs test/relay-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/brain-observation.mjs src/workspace-operations.mjs src/server.mjs test/brain-observation.test.mjs test/workspace-operations.test.mjs
git commit -m "feat: expose live brain observation state"
```

---

### Task 2: Make actual route learning brain-owned and observable

**Files:**
- Create: `src/route-learning.mjs`
- Modify: `src/database.mjs`
- Modify: `src/capability-registry.mjs`
- Modify: `src/router.mjs`
- Modify: `src/supervisor.mjs`
- Test: `test/route-learning.test.mjs`
- Test: `test/router.test.mjs`

**Interfaces:**
- Produces: `createRouteLearner({ database, alpha })` with `rankBias(route, taskContext)`, `observeDecision(record)`, `observeOutcome(record)`, and `snapshot()`.
- Constraint: learning is a ranking signal only after hard authority/data/health/cost eligibility checks.

- [ ] **Step 1: Write a failing learner contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRouteLearner } from "../src/route-learning.mjs";

test("verified real outcomes change future preference while idle does not", () => {
  const store = new Map();
  const database = {
    getRouteLearningState: (key) => store.get(key) ?? null,
    putRouteLearningState: (key, value) => store.set(key, structuredClone(value)),
    appendRoutingEvent: () => {},
  };
  const learner = createRouteLearner({ database, alpha: 0.25 });
  const context = { capability: "assistant.respond", dataClass: "local-only" };
  const before = learner.rankBias({ workerId: "a", reliability: 90, latencyMs: 20, workload: 0, economicTier: 0 }, context);
  learner.observeOutcome({ workerId: "a", capability: "assistant.respond", verified: true, outcome: "succeeded", reward: 1, context });
  const after = learner.rankBias({ workerId: "a", reliability: 90, latencyMs: 20, workload: 0, economicTier: 0 }, context);
  learner.observeDecision({ kind: "ambient", workerId: "a", capability: "assistant.respond", context });
  const afterAmbient = learner.rankBias({ workerId: "a", reliability: 90, latencyMs: 20, workload: 0, economicTier: 0 }, context);
  assert.ok(after > before);
  assert.equal(afterAmbient, after);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node --test test/route-learning.test.mjs
```

Expected: failure because `src/route-learning.mjs` does not exist.

- [ ] **Step 3: Implement a bounded contextual route learner**

Use a small, fixed feature vector owned by the runtime: bias, normalized reliability, normalized latency, normalized workload, normalized economic tier, and a routability/health bit. Persist only bounded numeric matrices/vectors keyed by `capability + workerId`; never persist task text.

`observeOutcome(...)` must reject updates unless `verified === true` and `outcome` is a real terminal outcome. `kind: "ambient"` must be ignored without writing the database.

The public `snapshot()` returns only:

```js
{
  available: true,
  algorithm: "linucb-v1",
  policyVersion: <monotonic integer>,
  routes: [{ workerId, capability, preferenceScore, observations, lastReward, updatedAt }]
}
```

Do not expose raw matrices in browser state.

- [ ] **Step 4: Add SQLite persistence methods**

Add a `route_learning` table through the existing database migration/schema pattern with key fields `route_key`, `capability`, `worker_id`, `a_json`, `b_json`, `observations`, `last_reward`, `policy_version`, `updated_at`. Add methods:

```js
getRouteLearningState(routeKey)
putRouteLearningState(routeKey, state)
listRouteLearningState(limit = 256)
appendRoutingEvent(eventType, subjectId, details)
```

`appendRoutingEvent` must reuse the existing event ledger and accept only bounded metadata.

- [ ] **Step 5: Apply learning only as a post-eligibility rank signal**

In `rankCapabilityRoutes`, preserve the existing `staticEligible` hard filters. After `isCapabilityRoutable(...)` succeeds, include `learningScore` from the learner/context and compare it after economic/interface/cost/availability hard preference classes but before latency/reliability tie-breaks. A learned score must never make an unauthorized, wrong-data-class, unhealthy, quarantined, or disallowed-cost route eligible.

- [ ] **Step 6: Record real route decision/outcome events**

At actual route selection, emit a bounded event with `capability`, `workerId`, `exploration`, `policyVersion`, and no task content. In `supervisor.mjs`, after a verified terminal receipt, calculate a bounded reward and call `observeOutcome(...)` exactly once for that task/worker/capability.

Use this initial reward contract:

```text
verified succeeded = +1.0
verified waiting   =  0.0
verified failed    = -1.0
```

Do not update on queued/running state, transport retries, idle checks, ambient UI activity, or unverified provider claims.

- [ ] **Step 7: Run focused tests**

```powershell
node --test test/route-learning.test.mjs test/router.test.mjs test/supervisor-reliability.test.mjs
```

Expected: PASS, including a test proving an ineligible route cannot win due to a high learned preference.

- [ ] **Step 8: Commit**

```powershell
git add src/route-learning.mjs src/database.mjs src/capability-registry.mjs src/router.mjs src/supervisor.mjs test/route-learning.test.mjs test/router.test.mjs
git commit -m "feat: learn from verified route outcomes"
```

---

### Task 3: Expose snapshot/event replay through both runtime transports

**Files:**
- Modify: `src/conversation-gateway.mjs`
- Modify: `src/relay-runtime.mjs`
- Modify: `cloud-app/app/api/runtime/action/route.ts`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Test: `test/relay-runtime.test.mjs`
- Test: `cloud-app/test/same-origin-runtime-contract.test.mjs`

**Interfaces:**
- Browser methods: `RuntimeRelay.brainSnapshot()` and `RuntimeRelay.brainEvents(afterSequence, limit)`.
- Transport action names: `brain-snapshot`, `brain-events`.

- [ ] **Step 1: Write failing transport tests**

Assert that the local encrypted relay and same-origin cloud gateway accept `brain-snapshot`/`brain-events`, while unknown/mutation-shaped brain actions remain rejected.

- [ ] **Step 2: Run RED tests**

```powershell
node --test test/relay-runtime.test.mjs cloud-app/test/same-origin-runtime-contract.test.mjs
```

- [ ] **Step 3: Add read-only gateway methods**

Extend `createConversationGateway` with relay calls:

```js
brainSnapshot(context = {}) { return relayCall(relayHandlers, "brainSnapshot", null, context); },
brainEvents(input, context = {}) { return relayCall(relayHandlers, "brainEvents", input, context); },
```

Add both to `src/relay-runtime.mjs`'s fixed action allowlist and dispatch table.

- [ ] **Step 4: Add same-origin action support**

Add the same two action names to `cloud-app/app/api/runtime/action/route.ts`'s existing fixed allowlist. They remain POST transport envelopes for authenticated reads; they do not mutate cognition.

- [ ] **Step 5: Add typed browser methods**

In `cloud-app/lib/runtime-relay.ts` define `RuntimeBrainSnapshot`, `RuntimeBrainEvent`, and:

```ts
async brainSnapshot() {
  return this.call<RuntimeBrainSnapshot>("brain-snapshot", {});
}
async brainEvents(afterSequence: number, limit = 100) {
  return this.call<{ events: RuntimeBrainEvent[]; cursor: number }>("brain-events", { afterSequence, limit });
}
```

- [ ] **Step 6: Run focused tests and commit**

```powershell
node --test test/relay-runtime.test.mjs cloud-app/test/same-origin-runtime-contract.test.mjs

git add src/conversation-gateway.mjs src/relay-runtime.mjs cloud-app/app/api/runtime/action/route.ts cloud-app/lib/runtime-relay.ts test/relay-runtime.test.mjs cloud-app/test/same-origin-runtime-contract.test.mjs
git commit -m "feat: relay live brain observation stream"
```

---

### Task 4: Add bounded reconnect, stale preservation, and automatic reconciliation

**Files:**
- Create: `cloud-app/lib/brain-observer.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Test: `cloud-app/test/brain-observer.test.mjs`
- Test: `cloud-app/test/cloud-contract.test.mjs`

**Interfaces:**
- Produces: UI connection states `LIVE | QUIET | RECONNECT | STALE | OFFLINE` and a last-known `RuntimeBrainSnapshot`.
- Consumes: `RuntimeRelay.brainSnapshot()` and `RuntimeRelay.brainEvents(...)`.

- [ ] **Step 1: Write failing observer-state tests**

Cover these transitions:

```text
no snapshot + failed connect       -> OFFLINE
fresh snapshot + no active work    -> QUIET
fresh snapshot + real active event -> LIVE
transport loss + recent snapshot   -> RECONNECT
transport loss + expired freshness -> STALE
reconnect                          -> fresh snapshot, replay cursor, LIVE/QUIET
```

Also assert that losing connectivity does not clear the last-known topology.

- [ ] **Step 2: Implement `createBrainObserver`**

Use full-jitter exponential retry bounded to 30 seconds and a finite retry budget before `OFFLINE`. Maintain `lastSnapshot`, `lastEventCursor`, `lastAuthoritativeAt`, and `connectionState`. On reconnect, fetch a fresh snapshot first, then replay events after the last applied cursor, deduplicate by sequence, and continue polling.

Use AbortController/timer cleanup so unmounting the workspace stops all polling/reconnect work.

- [ ] **Step 3: Replace one-shot workspace attach behavior**

`Workspace` currently attempts attach/resume only once. Replace the one-shot connection effect with the observer lifecycle while preserving manual pairing. `runtimeCapabilities` remains diagnostic compatibility state, but the brain graph uses `RuntimeBrainSnapshot.topology` as its authority.

- [ ] **Step 4: Run tests and commit**

```powershell
node --test cloud-app/test/brain-observer.test.mjs cloud-app/test/cloud-contract.test.mjs

git add cloud-app/lib/brain-observer.ts cloud-app/components/workspace.tsx cloud-app/components/workspace/workspace-types.ts cloud-app/test/brain-observer.test.mjs cloud-app/test/cloud-contract.test.mjs
git commit -m "feat: keep workspace attached to live brain"
```

---

### Task 5: Render a runtime-owned adaptive brain and truthful Pulse

**Files:**
- Create: `cloud-app/components/cockpit/BrainTopology.tsx`
- Create: `cloud-app/components/cockpit/BrainPulse.tsx`
- Modify: `cloud-app/components/cockpit/CockpitView.tsx`
- Modify: `cloud-app/components/workspace/work-view.tsx`
- Modify: `cloud-app/app/globals.css`
- Test: `cloud-app/test/live-brain-ui-contract.test.mjs`

**Interfaces:**
- `BrainTopology` consumes only `RuntimeBrainSnapshot.topology` and selected learning summaries.
- `BrainPulse` consumes only authoritative `RuntimeBrainEvent[]` plus local `visualizationOnly` ambient events.

- [ ] **Step 1: Write a static contract test that rejects compiled rosters and fake outcomes**

The test must assert:

```js
assert.doesNotMatch(brainTopologySource, /const\s+(?:agents|workers|nodes)\s*=\s*\[/i);
assert.match(brainTopologySource, /snapshot\.topology|topology/);
assert.match(brainPulseSource, /visualizationOnly/);
assert.doesNotMatch(brainPulseSource, /reward\s*:\s*Math\.random|outcome\s*:\s*["'](?:success|failed)/i);
```

- [ ] **Step 2: Implement dynamic topology**

Key nodes strictly by runtime `id`. Show health/routability, execution plane, capability count, active selection/traffic, and learned preference when `snapshot.learning.available === true`. Quarantined/offline nodes remain visible while present in the authoritative snapshot but visually unavailable.

- [ ] **Step 3: Implement real Pulse events**

Map runtime event types to neutral visual categories without changing their meaning. Pulse arcs/highlights originate only from events carrying a real `workerId`/route reference. Success/failure/reward indicators appear only when the runtime event contains those facts.

- [ ] **Step 4: Implement ambient quiet circulation**

When state is `QUIET`, generate local-only animation descriptors:

```ts
{ id: `ambient-${crypto.randomUUID()}`, visualizationOnly: true, workerId, createdAt: Date.now() }
```

Choose `workerId` from the current authoritative topology, optionally weighted by published `preferenceScore`. Never call a `RuntimeRelay` method from the ambient timer and never append ambient activity to runtime event arrays/statistics.

- [ ] **Step 5: Render explicit connection truth**

Show one of `LIVE`, `QUIET`, `RECONNECT`, `STALE`, or `OFFLINE`. `STALE` keeps the graph visible with a stale timestamp. `OFFLINE` shows no claim of inference or task traffic.

- [ ] **Step 6: Run focused tests and commit**

```powershell
node --test cloud-app/test/live-brain-ui-contract.test.mjs cloud-app/test/cloud-contract.test.mjs

git add cloud-app/components/cockpit/BrainTopology.tsx cloud-app/components/cockpit/BrainPulse.tsx cloud-app/components/cockpit/CockpitView.tsx cloud-app/components/workspace/work-view.tsx cloud-app/app/globals.css cloud-app/test/live-brain-ui-contract.test.mjs
git commit -m "feat: project adaptive runtime brain in workspace"
```

---

### Task 6: Restore a deployable single URL without weakening live-brain semantics

**Files:**
- Modify: `.github/workflows/pages.yml` or retire it as a full-app deployment gate
- Modify: `cloud-app/next.config.ts`
- Modify: `docs/CLOUD-ALWAYS-ON-RUNTIME.md`
- Modify: `README.md`
- Test: `cloud-app/test/deployment-continuity.test.mjs`
- Test: `test/cloud-always-on-runtime.test.mjs`

**Interfaces:**
- One canonical owner workspace URL.
- Dynamic same-origin deployment supports `/api/runtime/session`, `/api/runtime/action`, `/api/live`, and `/api/ready`.
- Optional static shell is explicitly fallback-only and must use the encrypted runtime relay.

- [ ] **Step 1: Add a failing deployment contract test**

Assert that documentation and health metadata distinguish `sourceVerified`, `uiDeployed`, `runtimeLive`, and `brainAttached`. Assert that the canonical live deployment is not represented as healthy solely because a Pages static export succeeded.

- [ ] **Step 2: Stop forcing the full dynamic Next application through static export**

The current Pages workflow sets `MAHORAGA_PAGES_EXPORT=1`, while `/api/runtime/action` is `force-dynamic`; this is why the deploy badge fails. Choose one explicit deployment role:

1. preferred: dynamic `cloud-app/` deployment using the existing always-on OCI + same-origin gateway design; or
2. fallback-only: a deliberately separate static presentation shell that omits same-origin API expectations and attaches through the encrypted relay.

Do not delete dynamic runtime routes merely to make a static badge green.

- [ ] **Step 3: Make health status reflect the four independent facts**

Expose source/deployment/runtime/attachment facts separately so the UI and README cannot collapse them into one green badge.

- [ ] **Step 4: Run deployment contract tests**

```powershell
node --test cloud-app/test/deployment-continuity.test.mjs test/cloud-always-on-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/pages.yml cloud-app/next.config.ts docs/CLOUD-ALWAYS-ON-RUNTIME.md README.md cloud-app/test/deployment-continuity.test.mjs test/cloud-always-on-runtime.test.mjs
git commit -m "fix: deploy live workspace as dynamic runtime surface"
```

---

### Task 7: End-to-end acceptance and rollback evidence

**Files:**
- Create: `test/live-brain-workspace-acceptance.test.mjs`
- Modify: `package.json`
- Modify: `docs/PRODUCTION-STATUS.md`

**Interfaces:**
- Acceptance harness uses real in-process database/supervisor/capability fixtures, not fabricated UI success data.

- [ ] **Step 1: Add acceptance coverage for runtime roster mutation**

Start the fixture with worker A, observe snapshot, add/reconcile worker B through the runtime capability source, observe again, and assert the second snapshot includes B without changing UI source.

- [ ] **Step 2: Add acceptance coverage for real task learning**

Execute verified task outcomes through the runtime fixture, assert a real routing event and reward update were recorded, then assert the learning snapshot changed and the next eligible ranking reflects it.

- [ ] **Step 3: Add acceptance coverage for idle purity**

Advance the UI observer through multiple quiet/ambient cycles and assert database event count, route-learning observation count, task count, and policy version remain unchanged.

- [ ] **Step 4: Add reconnect/stale acceptance coverage**

Drop the transport, preserve topology, transition through `RECONNECT`/`STALE`, restore it, replay after the last cursor, and assert no duplicate events or page reload are required.

- [ ] **Step 5: Run the full zero-credit repository gates**

```powershell
npm.cmd run validate
npm.cmd run verify
```

Expected: both PASS on the exact branch head. No Codex review is required.

- [ ] **Step 6: Record production truth without claiming activation**

Update `docs/PRODUCTION-STATUS.md` with repository candidate evidence only. Do not claim the Windows runtime is live until a fresh host probe confirms the process/listener/version/worker state.

- [ ] **Step 7: Commit**

```powershell
git add test/live-brain-workspace-acceptance.test.mjs package.json docs/PRODUCTION-STATUS.md
git commit -m "test: prove live brain workspace invariant"
```

---

## Plan self-review

**Spec coverage:** Dynamic runtime topology is Task 1/5; actual learning is Task 2; real event Pulse is Task 1/3/5; reconnect/stale behavior is Task 4; ambient purity is Task 5/7; single-URL deployment truth is Task 6; end-to-end acceptance is Task 7.

**Current-state mismatch explicitly handled:** Current `main` has adaptive UCF routing/recovery, but it does not expose a LinUCB learning matrix/reward policy through the workspace and no `LinUCB` implementation is present in current source search. Task 2 adds the brain-owned learner rather than allowing the UI to fabricate learned weights. Until Task 2 is complete, `learning.available` remains `false`.

**Type consistency:** Runtime projection uses `RuntimeBrainSnapshot`/`RuntimeBrainEvent`; transport methods are `brainSnapshot()`/`brainEvents()`; browser state is exactly `LIVE | QUIET | RECONNECT | STALE | OFFLINE`.

**No second brain:** Every frontend task is read-only with respect to cognition. The only local-only generated objects are `visualizationOnly` ambient animation descriptors, which never cross the runtime transport.

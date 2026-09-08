# Level 8 Delegated Work Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Level 8 Wave 8 foundation as a deterministic Universal Capability Graph plus objective-scoped delegated-work planner, then expose the graph through the existing world-state API.

**Architecture:** Compile existing live capability-registry entries and permanent Agent Foundry manifests into one immutable graph without creating a second routing authority. Plan work only against graph nodes that are currently routable and compatible with the request's data, attendance, authority, and declared-agent boundaries; return bounded metadata rather than task content.

**Tech Stack:** Node.js 24+, ESM `.mjs`, built-in `node:test`, existing Mahoraga runtime and Verify workflow.

**Spec:** `docs/superpowers/specs/2026-09-07-level8-entity-runtime-design.md`

## Global Constraints

- GitHub main remains authoritative; implementation occurs on `feature/level8-delegated-work-fabric` from `39cbad5c6d42f6e44062d675ddd4d3e1963ec3b4`.
- Keep the control API fixed to `127.0.0.1`; do not add a listener, tunnel, proxy, or caller-selected executable or path.
- The graph and plans contain identifiers, readiness, authority classes, hashes, and timestamps only; never persist prompts, task prose, responses, browser content, credentials, or document content.
- Agent Foundry declarations do not make a capability routable. Live process, provider, and canary evidence remain authoritative.
- A write-capable or attended route requires the caller's exact objective-scoped authority reference and attended-session reference as applicable.
- All behavior is deterministic and zero-credit. No provider or model call is introduced.
- New essential runtime modules and modified essential files must have byte-identical `state/release-baseline` mirrors.
- Required production gates remain exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`; Vercel and Codex review are excluded.

---

### Task 1: Universal Capability Graph

**Files:**
- Create: `src/universal-capability-graph.mjs`
- Create: `test/delegated-work-fabric.test.mjs`

**Interfaces:**
- Consumes: `capabilityIndex(manifest, workerStates, now)` output and Agent Foundry registry manifests.
- Produces: `buildUniversalCapabilityGraph({ capabilityRoutes, agents, observedAt })` and `validateUniversalCapabilityGraph(value)`.
- Graph nodes are `worker`, `capability`, and `agent`; edges are `provides`, `fallback`, and `declares`.

- [ ] **Step 1: Write the failing graph tests**

```js
test("universal graph keeps liveness separate from declared agent capability", () => {
  const graph = buildUniversalCapabilityGraph({ capabilityRoutes: [liveDesktopRoute], agents: [desktopAgent], observedAt: NOW });
  assert.equal(graph.nodes.find((node) => node.id === "capability:desktop.filesystem").routable, true);
  assert.equal(graph.edges.some((edge) => edge.type === "declares" && edge.from === "agent:desktop-steward"), true);
});

test("graph serialization is deterministic and content-free", () => {
  assert.deepEqual(buildUniversalCapabilityGraph(shuffled), buildUniversalCapabilityGraph(ordered));
  assert.doesNotMatch(JSON.stringify(graph), /prompt|response|credential|taskText/i);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`

Expected: FAIL because `src/universal-capability-graph.mjs` does not exist.

- [ ] **Step 3: Implement the minimal graph compiler**

```js
export function buildUniversalCapabilityGraph({ capabilityRoutes = [], agents = [], observedAt } = {}) {
  // Validate bounded registry and Foundry inputs, normalize set-like fields,
  // build stable nodes/edges, hash the canonical core, and deep-freeze output.
}

export function validateUniversalCapabilityGraph(value) {
  // Enforce exact keys, canonical timestamp, unique sorted IDs, known edge
  // types, referential integrity, zero-credit markers, and fingerprint.
}
```

- [ ] **Step 4: Run GREEN**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`

Expected: graph tests pass with no failures.

- [ ] **Step 5: Commit the graph foundation**

```powershell
git add src/universal-capability-graph.mjs test/delegated-work-fabric.test.mjs docs/superpowers/plans/2026-09-08-level8-delegated-work-fabric.md
git commit -m "[PRIMARY] Add universal capability graph"
```

---

### Task 2: Objective-Scoped Delegated Work Planning

**Files:**
- Create: `src/delegated-work-fabric.mjs`
- Modify: `test/delegated-work-fabric.test.mjs`

**Interfaces:**
- Consumes: a validated Universal Capability Graph and bounded request records `{ workId, objectiveId, workClass, capability, dataClass, authorityRef, attendedSessionRef, preferredAgentId }`.
- Produces: `planDelegatedWork({ graph, requests })` with immutable `assigned`, `waiting`, and `blocked` projections.
- Supported work classes are `assigned`, `derived`, `preventive`, `opportunity`, `institutional`, and `evolution`.

- [ ] **Step 1: Write the failing delegation tests**

```js
test("delegation selects a verified Windows route and binds objective authority", () => {
  const plan = planDelegatedWork({ graph, requests: [filesystemRequest] });
  assert.deepEqual(plan.assigned[0], {
    workId: "work-desktop-hash", objectiveId: "objective-wave-8",
    workClass: "assigned", capability: "desktop.filesystem",
    workerId: "desktop", agentId: "desktop-steward",
    authorityRef: "authority-wave-8", attendedSessionRef: "session-wave-8",
    evidenceLevel: "verified", executionPlane: "local",
  });
});

test("delegation waits for stale or unavailable evidence and blocks authority widening", () => {
  assert.equal(planDelegatedWork({ graph: staleGraph, requests: [filesystemRequest] }).waiting[0].reason, "canary-stale");
  assert.throws(() => planDelegatedWork({ graph, requests: [{ ...filesystemRequest, authorityRef: null }] }), /delegation-authority-required/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`

Expected: FAIL because `planDelegatedWork` is unavailable.

- [ ] **Step 3: Implement the minimal planner**

```js
export function planDelegatedWork({ graph, requests = [] } = {}) {
  // Validate each request, require objective-scoped authority for write or
  // attended routes, choose a routable compatible route deterministically,
  // require a preferred agent to declare the capability, and return only
  // bounded identifiers and evidence metadata.
}
```

- [ ] **Step 4: Run GREEN and adversarial cases**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs`

Expected: all graph and delegation tests pass, including duplicate IDs, unknown data classes, undeclared agents, stale evidence, missing attendance, and unknown fields.

- [ ] **Step 5: Commit the planner**

```powershell
git add src/delegated-work-fabric.mjs test/delegated-work-fabric.test.mjs
git commit -m "[PRIMARY] Add objective-scoped work delegation"
```

---

### Task 3: Live World-State Projection and Release Baseline

**Files:**
- Modify: `src/world-state-observer.mjs`
- Modify: `src/server.mjs`
- Modify: `src/repair.mjs`
- Modify: `test/objective-planner.test.mjs`
- Modify: `test/runtime.test.mjs`
- Create: `state/release-baseline/src/universal-capability-graph.mjs`
- Create: `state/release-baseline/src/delegated-work-fabric.mjs`
- Modify: `state/release-baseline/src/world-state-observer.mjs`
- Modify: `state/release-baseline/src/server.mjs`
- Modify: `state/release-baseline/src/repair.mjs`

**Interfaces:**
- `observeWorldState({ manifest, database, supervisor })` adds `capabilityGraph` built from current `supervisor.status()` evidence and the bounded Agent Foundry registry.
- `GET /api/world-state` returns the existing planner projection plus the immutable graph; it remains authenticated and read-only.

- [ ] **Step 1: Write failing runtime projection tests**

```js
assert.equal(world.capabilityGraph.kind, "universal-capability-graph");
assert.equal(world.capabilityGraph.nodes.some((node) => node.id === "capability:desktop.filesystem" && node.routable), true);
assert.equal(world.capabilityGraph.creditCost, 0);
assert.equal(world.capabilityGraph.paidFallback, false);
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/objective-planner.test.mjs test/runtime.test.mjs`

Expected: FAIL because world state has no `capabilityGraph`.

- [ ] **Step 3: Add the graph projection and essential-file registration**

```js
const capabilityGraph = buildUniversalCapabilityGraph({
  capabilityRoutes: capabilityIndex(manifest, supervisor.status()),
  agents: await loadBoundedFoundryAgents(),
  observedAt,
});
```

Keep registry loading fail-closed to an empty agent set; worker capability evidence remains available and Foundry declarations never grant routing.

- [ ] **Step 4: Refresh and verify release baseline**

Run: `npm run baseline:refresh`

Run: `npm run baseline:verify`

Expected: all essential source files have byte-identical mirrors.

- [ ] **Step 5: Run focused and full verification**

Run: `node --test --test-isolation=none test/delegated-work-fabric.test.mjs test/objective-planner.test.mjs test/runtime.test.mjs test/repair.test.mjs`

Run: `$env:GH_TOKEN = gh auth token; try { npm run verify } finally { Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue }`

Expected: focused and full suites pass with zero failures.

- [ ] **Step 6: Commit the live projection**

```powershell
git add src state/release-baseline/src test
git commit -m "[PRIMARY] Expose delegated capability fabric"
```

---

### Task 4: Exact-Head GitHub Integration

**Files:** No source changes after the candidate head is pushed.

**Interfaces:** GitHub PR from `feature/level8-delegated-work-fabric` to `main`.

- [ ] **Step 1: Inspect the final diff and changed-path boundary**

Run: `git diff --check origin/main...HEAD`

Run: `git diff --name-status origin/main...HEAD`

Expected: only the plan, graph, delegation, runtime projection, tests, repair registration, and corresponding release-baseline files changed.

- [ ] **Step 2: Push and open the PR without review traffic**

Run: `git push -u origin feature/level8-delegated-work-fabric`

Create a normal non-draft PR. Do not request Codex review, post automated comments, or use Vercel evidence.

- [ ] **Step 3: Observe exact-head verification**

Require successful `Verify (ubuntu-latest)` and `Verify (windows-latest)` on the unchanged PR head and confirm main has not advanced.

- [ ] **Step 4: Integrate through the trusted repository workflow**

Acquire the bounded local integration lease, allow the existing autonomous integration workflow to revalidate and squash-merge the exact head, then release the lease.

- [ ] **Step 5: Verify merged main before activation**

Require the merged main SHA to pass Ubuntu and Windows Verify. Fast-forward the production checkout, restart through `scripts/stop-production.ps1` and `scripts/start-production.ps1`, and confirm live `/api/world-state` returns a verified desktop capability graph.

## Self-Review

- Spec coverage: Wave 8 work classes, objective-scoped representation and authority, deterministic routing evidence, Foundry declarations, and production integration are covered.
- Scope: persistence and automatic execution of delegation plans remain a later wave; this chunk produces a usable live graph and fail-closed planning contract.
- Type consistency: graph, request, plan, and world-state field names are identical across tasks.
- Placeholder scan: no incomplete implementation step or unresolved interface remains.

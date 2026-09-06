import test from "node:test";
import assert from "node:assert/strict";
import { objectivePlannerVersion, planWorldStateActions } from "../src/objective-planner.mjs";

test("objective planner remains stable for a healthy observed world", () => {
  const plan = planWorldStateActions({
    workers: [{ workerId: "repository", status: "live" }],
    activeLeases: [],
    taskCounts: { completed: 3 },
    objectives: [{ id: "obj-1", status: "running" }],
    repository: { verified: true, head: "a".repeat(40) },
  }, { now: Date.parse("2026-09-06T20:00:00Z") });

  assert.equal(objectivePlannerVersion(), "objective-planner-v1");
  assert.equal(plan.state, "stable");
  assert.equal(plan.actionCount, 0);
  assert.equal(plan.automaticMutationAllowed, false);
});

test("objective planner emits bounded read-only actions for degraded evidence", () => {
  const now = Date.parse("2026-09-06T20:00:00Z");
  const plan = planWorldStateActions({
    workers: [{ workerId: "browser", status: "hung" }],
    activeLeases: [{ id: "mhg-lease", leaseExpiresAt: "2026-09-06T19:59:00Z" }],
    taskCounts: { failed: 2 },
    objectives: [{ id: "obj-failed", status: "failed" }],
    repository: { verified: false, head: null },
  }, { now });

  assert.equal(plan.state, "attention-required");
  assert.equal(plan.actionCount, 5);
  assert.ok(plan.actions.every((item) => item.mutation === false));
  assert.deepEqual(plan.actions.map((item) => item.reasonCode), [
    "worker-health-degraded",
    "task-lease-expired",
    "repository-state-unverified",
    "task-failures-present",
    "objective-failures-present",
  ]);
});

test("objective planner ignores malformed counts and non-expired leases", () => {
  const plan = planWorldStateActions({
    workers: [],
    activeLeases: [{ id: "lease-1", leaseExpiresAt: "2026-09-06T20:00:03Z" }],
    taskCounts: { failed: "9" },
    objectives: [],
    repository: { verified: true },
  }, { now: Date.parse("2026-09-06T20:00:00Z") });

  assert.equal(plan.state, "stable");
  assert.equal(plan.actionCount, 0);
});

test("objective planner rejects invalid world state and clock", () => {
  assert.throws(() => planWorldStateActions(null), /world-state-invalid/);
  assert.throws(() => planWorldStateActions({}, { now: Number.NaN }), /planner-clock-invalid/);
});

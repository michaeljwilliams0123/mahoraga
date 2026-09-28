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
    providers: [{ id: "primary-codex-builder", state: "custom-production-state", error: null }],
  }, { now: Date.parse("2026-09-06T20:00:00Z") });

  assert.equal(objectivePlannerVersion(), "objective-planner-v1");
  assert.equal(plan.state, "stable");
  assert.equal(plan.actionCount, 0);
  assert.equal(plan.automaticMutationAllowed, false);
});

test("objective planner keeps observational health actions read-only", () => {
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
  assert.equal(plan.automaticMutationAllowed, false);
  assert.ok(plan.actions.every((item) => item.mutation === false));
  assert.deepEqual(plan.actions.map((item) => item.reasonCode), [
    "worker-health-degraded",
    "task-lease-expired",
    "repository-state-unverified",
    "task-failures-present",
    "objective-failures-present",
  ]);
});

test("objective planner grants owner-authorized provider remediation read/write authority", () => {
  const plan = planWorldStateActions({
    workers: [], activeLeases: [], taskCounts: {}, objectives: [],
    repository: { verified: true },
    providers: [
      { id: "zeta-provider", state: "production-custom", error: "quota-exhausted" },
      { id: "healthy-provider", state: "anything", error: null },
      { id: "alpha-provider", state: "staged", error: "authentication-pending" },
      { id: "empty-error-provider", state: "unknown", error: "" },
    ],
  }, { now: Date.parse("2026-09-06T20:00:00Z") });

  assert.equal(plan.state, "attention-required");
  assert.equal(plan.actionCount, 1);
  assert.equal(plan.automaticMutationAllowed, true);
  assert.deepEqual(plan.actions[0], {
    id: "remediate-provider-errors",
    intent: "provider.gap",
    priority: "high",
    reasonCode: "provider-errors-present",
    completionCriteria: "provider-errors-remediated",
    authority: "owner-authorized-github-operator",
    mutation: true,
    operations: ["read", "create", "modify", "administer"],
    evidence: { count: 2, providerIds: ["alpha-provider", "zeta-provider"] },
  });
  assert.equal("command" in plan.actions[0], false);
  assert.equal("execute" in plan.actions[0], false);
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

test("objective planner holds pending objectives until dependencies complete", () => {
  const plan = planWorldStateActions({
    workers: [], activeLeases: [], taskCounts: {}, repository: { verified: true }, providers: [],
    objectives: [
      { id: "foundation", status: "running" },
      { id: "deploy", status: "pending", dependsOn: ["foundation"] },
    ],
  }, { now: Date.parse("2026-09-27T20:00:00Z") });

  const hold = plan.actions.find((item) => item.reasonCode === "objective-dependencies-blocked");
  assert.ok(hold);
  assert.equal(hold.disposition, "hold");
  assert.deepEqual(hold.evidence, { objectiveId: "deploy", blockedBy: ["foundation"] });
});

test("objective planner chooses the best risk-adjusted alternative once dependencies are satisfied", () => {
  const plan = planWorldStateActions({
    workers: [], activeLeases: [], taskCounts: {}, repository: { verified: true }, providers: [],
    objectives: [
      { id: "foundation", status: "completed" },
      {
        id: "deploy",
        status: "pending",
        dependsOn: ["foundation"],
        deadline: "2026-09-28T00:00:00Z",
        alternatives: [
          { id: "fast-risky", expectedValue: 0.9, risk: 0.4 },
          { id: "safe-value", expectedValue: 0.8, risk: 0.1 },
        ],
      },
    ],
  }, { now: Date.parse("2026-09-27T20:00:00Z") });

  const execute = plan.actions.find((item) => item.reasonCode === "objective-ready");
  assert.ok(execute);
  assert.equal(execute.disposition, "execute");
  assert.equal(execute.evidence.objectiveId, "deploy");
  assert.equal(execute.evidence.selectedAlternativeId, "safe-value");
  assert.equal(execute.evidence.riskAdjustedValue, 0.7);
});

test("objective planner escalates an overdue pending objective", () => {
  const plan = planWorldStateActions({
    workers: [], activeLeases: [], taskCounts: {}, repository: { verified: true }, providers: [],
    objectives: [{ id: "deploy", status: "pending", deadline: "2026-09-27T19:00:00Z" }],
  }, { now: Date.parse("2026-09-27T20:00:00Z") });

  const escalation = plan.actions.find((item) => item.reasonCode === "objective-overdue");
  assert.ok(escalation);
  assert.equal(escalation.disposition, "escalate");
  assert.equal(escalation.evidence.objectiveId, "deploy");
});

test("objective planner rejects dependency cycles fail-closed", () => {
  const snapshot = {
    workers: [], activeLeases: [], taskCounts: {}, repository: { verified: true }, providers: [],
    objectives: [
      { id: "a", status: "pending", dependsOn: ["b"] },
      { id: "b", status: "pending", dependsOn: ["a"] },
    ],
  };

  assert.throws(
    () => planWorldStateActions(snapshot, { now: Date.parse("2026-09-27T20:00:00Z") }),
    /planner-dependency-cycle/,
  );
});

test("objective planner emits deterministic plan and replan receipts", () => {
  const now = Date.parse("2026-09-27T20:00:00Z");
  const snapshot = {
    workers: [], activeLeases: [], taskCounts: {}, repository: { verified: true }, providers: [],
    objectives: [{ id: "deploy", status: "pending" }],
  };

  const first = planWorldStateActions(snapshot, { now });
  const replay = planWorldStateActions(snapshot, { now });
  assert.match(first.planReceipt.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(first.planReceipt.fingerprint, replay.planReceipt.fingerprint);

  const replanned = planWorldStateActions({ ...snapshot, taskCounts: { failed: 1 } }, {
    now,
    priorPlanFingerprint: first.planReceipt.fingerprint,
    replanTrigger: "world-state-changed",
  });
  assert.equal(replanned.replanReceipt.priorPlanFingerprint, first.planReceipt.fingerprint);
  assert.equal(replanned.replanReceipt.newPlanFingerprint, replanned.planReceipt.fingerprint);
  assert.equal(replanned.replanReceipt.reasonCode, "world-state-changed");
  assert.notEqual(replanned.replanReceipt.newPlanFingerprint, first.planReceipt.fingerprint);
});

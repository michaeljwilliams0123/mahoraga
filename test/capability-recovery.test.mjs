import test from "node:test";
import assert from "node:assert/strict";
import { planCapabilityRecovery } from "../src/capability-recovery.mjs";

function task(overrides = {}) {
  return {
    id: "task-recovery-1",
    capability: "m365.reason",
    attemptCount: 1,
    maximumAttempts: 3,
    ...overrides,
  };
}

const route = Object.freeze({
  workerId: "microsoft365",
  routeFingerprint: "a".repeat(64),
});

test("stale readiness refreshes and retries the same route", () => {
  const plan = planCapabilityRecovery({
    reason: "canary-stale",
    task: task(),
    consideredRoutes: [route],
    excludedWorkerIds: [],
  });
  assert.equal(plan.recoverable, true);
  assert.equal(plan.exhausted, false);
  assert.deepEqual(plan.actions.map((action) => action.kind), ["refresh-readiness", "retry-route"]);
  assert.equal(Object.isFrozen(plan), true);
});
test("provider and routing failures prefer bounded reroute recovery", () => {
  assert.deepEqual(planCapabilityRecovery({
    reason: "provider-unavailable", task: task(), consideredRoutes: [route], excludedWorkerIds: [],
  }).actions.map((action) => action.kind), ["refresh-readiness", "reroute"]);
  assert.deepEqual(planCapabilityRecovery({
    reason: "worker-excluded", task: task(), consideredRoutes: [route], excludedWorkerIds: ["microsoft365"],
  }).actions.map((action) => action.kind), ["reroute"]);
  assert.deepEqual(planCapabilityRecovery({
    reason: "routing-evidence-missing", task: task(), consideredRoutes: [], excludedWorkerIds: [],
  }).actions.map((action) => action.kind), ["refresh-readiness", "configure-adapter", "reroute"]);
});

test("platform authorization can refresh without widening owner authority", () => {
  const plan = planCapabilityRecovery({
    reason: "platform-authority-missing", task: task(), consideredRoutes: [route], excludedWorkerIds: [],
  });
  assert.equal(plan.recoverable, true);
  assert.deepEqual(plan.actions.map((action) => action.kind), ["refresh-auth"]);
});

test("structural authority and data boundaries are not recoverable", () => {
  for (const reason of ["owner-grant-missing", "scope-revoked", "data-class-not-supported", "agent-capability-not-declared", "owner-confirmation-required", "recipient-not-authorized"]) {
    const plan = planCapabilityRecovery({ reason, task: task(), consideredRoutes: [], excludedWorkerIds: [] });
    assert.equal(plan.recoverable, false, reason);
    assert.deepEqual(plan.actions, [], reason);
  }
});
test("attempt exhaustion stops recovery without losing the reason", () => {
  const plan = planCapabilityRecovery({
    reason: "canary-stale",
    task: task({ attemptCount: 3, maximumAttempts: 3 }),
    consideredRoutes: [route],
    excludedWorkerIds: [],
  });
  assert.equal(plan.recoverable, false);
  assert.equal(plan.exhausted, true);
  assert.equal(plan.reason, "canary-stale");
  assert.deepEqual(plan.actions, []);
});

test("recovery planner rejects unknown envelope fields and unsafe route identifiers", () => {
  assert.throws(() => planCapabilityRecovery({
    reason: "canary-stale", task: task(), consideredRoutes: [route], excludedWorkerIds: [], command: "curl example.com",
  }), /capability-recovery-request-invalid/);
  assert.throws(() => planCapabilityRecovery({
    reason: "canary-stale", task: task(), consideredRoutes: [{ workerId: "https://bad.example", routeFingerprint: "a".repeat(64) }], excludedWorkerIds: [],
  }), /capability-recovery-route-invalid/);
});

test("unknown internal reason is contained rather than becoming an action", () => {
  const plan = planCapabilityRecovery({
    reason: "some-new-internal-reason", task: task(), consideredRoutes: [], excludedWorkerIds: [],
  });
  assert.equal(plan.recoverable, false);
  assert.equal(plan.reason, "unclassified");
  assert.deepEqual(plan.actions, []);
});
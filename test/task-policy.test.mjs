import test from "node:test";
import assert from "node:assert/strict";
import { deriveTaskPolicy, policyTaskInput, sanitizeTaskIntake } from "../src/task-policy.mjs";

const manifest = {
  defaultAutonomyMode: "hybrid",
  queue: { maximumAttempts: 3 },
  workers: [
    { id: "repository", enabled: true, capabilities: ["repository.inspect"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: false } },
    { id: "desktop", enabled: true, capabilities: ["desktop.interact"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: true } },
    { id: "codex", enabled: true, capabilities: ["codex.execute"], dataClasses: ["local-only"], executionPlane: "primary-codex-local", routing: { requiresAttendedDesktop: false } },
  ],
};

test("generic intake cannot assert authority fields", () => {
  assert.throws(() => sanitizeTaskIntake({ intent: "repository.inspect", capability: "codex.execute" }), /caller-authority-field-forbidden/);
  assert.throws(() => sanitizeTaskIntake({ intent: "repository.inspect", dataClass: "synthetic" }), /caller-authority-field-forbidden/);
});

test("repository policy derives capability, data boundary, plane, and worker", () => {
  const policy = deriveTaskPolicy({ intent: "repository.inspect", requestedOutcome: "Inspect status" }, { manifest });
  assert.deepEqual(policy, {
    source: "control-center",
    intent: "repository.inspect",
    capability: "repository.inspect",
    dataClass: "local-only",
    executionPlane: "local",
    attendedRequired: false,
    allowedWorkerIds: ["repository"],
    authoritySessionId: null,
    integrationLeaseId: null,
    contentReferences: [],
    policyVersion: "7.0.0-alpha.1",
  });
});

test("attended and integration authority fail closed", () => {
  assert.throws(() => deriveTaskPolicy({ intent: "desktop.interact" }, { manifest }), /attended-session-required/);
  assert.throws(() => deriveTaskPolicy({ intent: "codex.execute" }, { manifest, internal: true }), /integration-lease-required/);
});

test("policy task input ignores caller execution assertions", () => {
  const request = { intent: "repository.inspect", requestedOutcome: "Inspect status", priority: "high" };
  const policy = deriveTaskPolicy(request, { manifest });
  const task = policyTaskInput(request, policy, manifest);
  assert.equal(task.capability, "repository.inspect");
  assert.equal(task.dataClass, "local-only");
  assert.equal(task.executionPlane, "local");
  assert.equal(task.requestedMode, "hybrid");
  assert.equal(task.priority, "high");
});

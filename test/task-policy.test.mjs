import test from "node:test";
import assert from "node:assert/strict";
import { deriveTaskPolicy, policyTaskInput, sanitizeTaskIntake } from "../src/task-policy.mjs";

const manifest = {
  defaultAutonomyMode: "hybrid",
  queue: { maximumAttempts: 3 },
  workers: [
    { id: "repository", enabled: true, capabilities: ["repository.inspect"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: false } },
    { id: "desktop", enabled: true, capabilities: ["desktop.interact"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: true } },
    { id: "codex", enabled: true, capabilities: ["codex.execute"], dataClasses: ["local-only"], executionPlane: "candidate-worktree", routing: { requiresAttendedDesktop: false } },
    { id: "provider-gap", enabled: true, capabilities: ["provider.gap"], dataClasses: ["enterprise"], executionPlane: "local", routing: { requiresAttendedDesktop: false } },
  ],
};

test("generic intake cannot assert authority fields", () => {
  assert.throws(() => sanitizeTaskIntake({ intent: "repository.inspect", capability: "codex.execute" }), /caller-authority-field-forbidden/);
  assert.throws(() => sanitizeTaskIntake({ intent: "repository.inspect", dataClass: "synthetic" }), /caller-authority-field-forbidden/);
  assert.throws(() => sanitizeTaskIntake({ intent: "repository.inspect", authoritySessionId: "caller-asserted" }), /caller-authority-field-forbidden/);
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
    baseCommit: null,
    allowedPaths: [],
    policyVersion: "7.0.0-alpha.1",
  });
});

test("attended and integration authority fail closed", () => {
  assert.throws(() => deriveTaskPolicy({ intent: "desktop.interact" }, { manifest }), /attended-session-required/);
  assert.throws(() => deriveTaskPolicy({ intent: "codex.execute" }, { manifest, internal: true }), /integration-lease-required/);
  const attended = deriveTaskPolicy({ intent: "desktop.interact" }, {
    manifest, attendedSession: { active: true, sessionId: "browser-session" },
  });
  assert.equal(attended.attendedRequired, true);
  assert.equal(attended.authoritySessionId, "browser-session");
});

test("Codex policy binds an immutable base and allowlist to the active lease", () => {
  const lease = { leaseId: "int-00000000-0000-4000-8000-000000000003", paths: ["src"], expiresAt: "2099-08-25T12:00:00.000Z" };
  const policy = deriveTaskPolicy({ intent: "codex.execute", baseCommit: "a".repeat(40), allowedPaths: ["src/execution-cell.mjs"], integrationLeaseId: lease.leaseId }, { manifest, internal: true, integrationLease: lease });
  assert.equal(policy.executionPlane, "candidate-worktree");
  assert.equal(policy.integrationLeaseId, lease.leaseId);
  assert.equal(policy.baseCommit, "a".repeat(40));
  assert.deepEqual(policy.allowedPaths, ["src/execution-cell.mjs"]);
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

test("provider-gap policy preserves enterprise classification without caller authority", () => {
  const policy = deriveTaskPolicy({ intent: "provider.gap", requestedOutcome: "Review an enterprise work link." }, { manifest });
  assert.equal(policy.capability, "provider.gap");
  assert.equal(policy.dataClass, "enterprise");
  assert.equal(policy.executionPlane, "local");
  assert.deepEqual(policy.allowedWorkerIds, ["provider-gap"]);
});

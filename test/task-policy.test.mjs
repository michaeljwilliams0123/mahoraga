import test from "node:test";
import assert from "node:assert/strict";
import { deriveTaskPolicy, deriveTaskPolicyFromOmnichannelEnvelope, policyTaskInput, sanitizeTaskIntake } from "../src/task-policy.mjs";
import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";

const NOW = new Date().toISOString();

const manifest = {
  defaultAutonomyMode: "hybrid",
  queue: { maximumAttempts: 3 },
  workers: [
    { id: "repository", enabled: true, capabilities: ["repository.inspect"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: false } },
    { id: "desktop", enabled: true, capabilities: ["desktop.interact"], dataClasses: ["local-only"], executionPlane: "local", routing: { requiresAttendedDesktop: true } },
    { id: "codex", enabled: true, capabilities: ["codex.execute"], dataClasses: ["local-only"], executionPlane: "candidate-worktree", routing: { requiresAttendedDesktop: false } },
    { id: "self-evolution", enabled: true, capabilities: ["self.evolve"], dataClasses: ["local-only"], executionPlane: "candidate-worktree", routing: { requiresAttendedDesktop: false } },
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

test("omnichannel envelopes derive the same bounded task policy surface", () => {
  const envelope = createOmnichannelEnvelope({
    source: "github-event",
    actor: { actorType: "owner", actorId: "michaeljwilliams0123", trustClass: "owner-explicit", accountBoundary: "local-only" },
    object: { repository: "michaeljwilliams0123/mahoraga", eventName: "pull_request", action: "opened", objectType: "pull-request", objectId: "184", deliveryId: "evt-184" },
    allowedActionClass: "observe",
    correlationId: "corr-pr-184",
    idempotencyKey: "github:evt-184",
    contentReferences: [],
    routeHint: { capability: "repository.inspect", actionPackId: "github-status-report" },
    metadata: { branch: "feature/x" },
    zeroCreditEligible: true,
  }, { now: NOW });
  const policy = deriveTaskPolicyFromOmnichannelEnvelope(envelope, { manifest });
  assert.equal(policy.intent, "repository.inspect");
  assert.equal(policy.dataClass, "local-only");
  assert.deepEqual(policy.allowedWorkerIds, ["repository"]);
});

test("self evolution uses the same immutable execution-cell lease boundary as Codex", () => {
  const lease = { leaseId: "int-00000000-0000-4000-8000-000000000004", paths: ["src", "test"], expiresAt: "2099-08-25T12:00:00.000Z" };
  const policy = deriveTaskPolicy({
    intent: "self.evolve",
    baseCommit: "b".repeat(40),
    allowedPaths: ["src/chat-intake.mjs", "test/chat-intake.test.mjs"],
    integrationLeaseId: lease.leaseId,
  }, { manifest, internal: true, integrationLease: lease });
  assert.equal(policy.capability, "self.evolve");
  assert.equal(policy.dataClass, "local-only");
  assert.equal(policy.integrationLeaseId, lease.leaseId);
  assert.equal(policy.baseCommit, "b".repeat(40));
  assert.deepEqual(policy.allowedPaths, ["src/chat-intake.mjs", "test/chat-intake.test.mjs"]);
});

test("public task intake still cannot directly vend self-evolution authority", () => {
  assert.throws(
    () => deriveTaskPolicy({ intent: "self.evolve", requestedOutcome: "change yourself" }, { manifest }),
    (error) => error?.code === "task-intent-not-allowed",
  );
});

test("multiple eligible execution planes are ranked instead of rejected as ambiguous", () => {
  const rankedManifest = {
    ...manifest,
    workers: [
      { id: "cloud-health", enabled: true, capabilities: ["system.health"], dataClasses: ["synthetic"], executionPlane: "cloud", routing: { requiresAttendedDesktop: false, priority: 20, costClass: "licensed-cloud" } },
      { id: "local-health", enabled: true, capabilities: ["system.health"], dataClasses: ["synthetic"], executionPlane: "local", routing: { requiresAttendedDesktop: false, priority: 5, costClass: "zero-credit" } },
    ],
  };
  const policy = deriveTaskPolicy({ intent: "system.health" }, { manifest: rankedManifest, internal: true });
  assert.equal(policy.executionPlane, "local");
  assert.deepEqual(policy.allowedWorkerIds, ["local-health", "cloud-health"]);
});

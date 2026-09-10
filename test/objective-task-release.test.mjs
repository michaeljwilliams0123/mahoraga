import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { loadManifest } from "../src/config.mjs";
import { buildAutonomyObjective } from "../src/autonomy-orchestrator.mjs";
import { installObjectiveReleaseAuthority } from "../src/objective-release-authority.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-objective-release-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return database;
}

function objectiveDefinition() {
  return buildAutonomyObjective({
    conversationId: null,
    messageId: "msg-objective-release-0001",
    message: "Improve the runtime routing and tests.",
    executionContract: { baseCommit: "c".repeat(40), allowedPaths: ["src", "test"] },
  });
}

async function installedFixture(t) {
  const database = fixture(t);
  const manifest = await loadManifest();
  installObjectiveReleaseAuthority({ database, manifest });
  return database;
}

test("objective release derives policy, lease, and Codex Builder sessions before dispatch", async (t) => {
  const database = await installedFixture(t);
  const objective = database.createObjective(objectiveDefinition());

  const reconciled = database.reconcileObjectives();
  assert.equal(reconciled.released.length, 2);
  const current = database.getObjective(objective.id);
  const released = current.tasks.filter((task) => task.status === "released");
  assert.deepEqual(released.map((task) => task.localTaskId).sort(), ["challenge", "propose"]);

  const lease = database.getIntegrationLease();
  assert.equal(lease.controllerId, "primary-local-codex");
  assert.equal(lease.purpose, `objective:${objective.id}`);
  assert.deepEqual(lease.paths, ["src", "test"]);
  for (const child of released) {
    assert.equal(child.task.capability, "codex.execute");
    assert.equal(child.task.dataClass, "local-only");
    assert.equal(child.task.integrationLeaseId, lease.leaseId);
    assert.equal(child.task.policyVersion, "7.0.0-alpha.1");
    assert.deepEqual(child.task.allowedWorkerIds, ["primary-codex-builder"]);
    assert.deepEqual(child.task.allowedPaths, ["src", "test"]);
    assert.equal(database.getCodexBuilderSessionByTaskId(child.task.id).status, "PREPARED");
  }
});

test("completed Codex stages release their lease and reacquire a fresh lease for the next stage", async (t) => {
  const database = await installedFixture(t);
  const objective = database.createObjective(objectiveDefinition());
  database.reconcileObjectives();
  const firstLease = database.getIntegrationLease();

  for (let index = 0; index < 2; index += 1) {
    const claimed = database.claimNext({ workerId: "primary-codex-builder", capabilities: ["codex.execute"], leaseMs: 30_000 });
    assert.ok(claimed);
    database.finishTask(claimed.id, { status: "completed", resultSummary: "Verified bounded stage completion." });
  }
  database.reconcileObjectives();
  database.reconcileObjectives();

  const next = database.getObjective(objective.id).tasks.find((task) => task.localTaskId === "synthesize");
  const secondLease = database.getIntegrationLease();
  assert.equal(next.status, "released");
  assert.notEqual(secondLease.leaseId, firstLease.leaseId);
  assert.equal(next.task.integrationLeaseId, secondLease.leaseId);
  assert.equal(database.getCodexBuilderSessionByTaskId(next.task.id).status, "PREPARED");
});

test("a competing Primary lease keeps Codex objective children planned without bypassing authority", async (t) => {
  const database = await installedFixture(t);
  database.acquireIntegrationLease({
    controllerId: "primary-cloud-codex",
    durationMs: 60_000,
    purpose: "independent-cloud-primary",
    paths: ["src"],
  });
  const objective = database.createObjective(objectiveDefinition());

  const reconciled = database.reconcileObjectives();
  assert.equal(reconciled.released.length, 0);
  assert.equal(database.listTasks().length, 0);
  assert.deepEqual(database.getObjective(objective.id).tasks.filter((task) => task.status === "planned").map((task) => task.localTaskId).sort(), ["challenge", "implement", "integrate", "propose", "synthesize", "verify"]);
  assert.equal(database.getIntegrationLease().controllerId, "primary-cloud-codex");
});

test("finishing the final Codex stage releases the objective lease before repository verification", async (t) => {
  const database = await installedFixture(t);
  const objective = database.createObjective(objectiveDefinition());
  database.reconcileObjectives();

  for (const expectedCodexTasks of [2, 1, 1]) {
    for (let index = 0; index < expectedCodexTasks; index += 1) {
      const claimed = database.claimNext({ workerId: "primary-codex-builder", capabilities: ["codex.execute"], leaseMs: 30_000 });
      assert.ok(claimed);
      database.finishTask(claimed.id, { status: "completed", resultSummary: "Verified bounded stage completion." });
    }
    database.reconcileObjectives();
    database.reconcileObjectives();
  }

  const verify = database.getObjective(objective.id).tasks.find((task) => task.localTaskId === "verify");
  assert.equal(verify.status, "released");
  assert.equal(database.getIntegrationLease(), null);
});

test("an active objective task retains its lease when newer tasks exceed the list limit", async (t) => {
  const database = await installedFixture(t);
  const objective = database.createObjective(objectiveDefinition());
  database.reconcileObjectives();
  const lease = database.getIntegrationLease();
  const activeTaskIds = database.getObjective(objective.id).tasks
    .filter((task) => task.status === "released")
    .map((task) => task.task.id);

  for (let index = 0; index < 501; index += 1) {
    database.submitTask({
      capability: "local.health",
      dataClass: "synthetic",
      idempotencyKey: `objective-lease-filler-${index}`,
    });
  }

  assert.equal(database.listTasks(500).some((task) => activeTaskIds.includes(task.id)), false);
  database.reconcileObjectives();
  assert.equal(database.getIntegrationLease().leaseId, lease.leaseId);
});

test("owner self-evolution objective receives the same local integration lease before release", async (t) => {
  const database = await installedFixture(t);
  const objective = database.createObjective(buildAutonomyObjective({
    conversationId: null,
    messageId: "msg-owner-self-evolve-0001",
    message: "run self.evolve to improve owner interaction",
    requestedCapability: "self.evolve",
    executionContract: { baseCommit: "d".repeat(40), allowedPaths: ["src", "test"] },
  }));
  const reconciled = database.reconcileObjectives();
  assert.equal(reconciled.released.length, 1);
  const child = database.getObjective(objective.id).tasks[0];
  assert.equal(child.status, "released");
  assert.equal(child.task.capability, "self.evolve");
  assert.match(child.task.integrationLeaseId, /^int-/);
  assert.equal(child.task.baseCommit, "d".repeat(40));
  assert.deepEqual(child.task.allowedPaths, ["src", "test"]);
  assert.deepEqual(child.task.allowedWorkerIds, ["primary-codex-builder"]);
});

test("objective task identities are globally unique while local ids stay objective-scoped", async (t) => {
  const database = await installedFixture(t);
  const first = database.createObjective(objectiveDefinition());
  const second = database.createObjective({ ...objectiveDefinition(), correlationId: "objective-second" });
  assert.ok(first.tasks.some((task) => task.localTaskId === "propose"));
  assert.ok(second.tasks.some((task) => task.localTaskId === "propose"));
  assert.notEqual(first.tasks[0].id, second.tasks[0].id);
  assert.equal(new Set([...first.tasks, ...second.tasks].map((task) => task.id)).size, first.tasks.length + second.tasks.length);
});

test("objective dependency cycles are rejected before persistence", async (t) => {
  const database = await installedFixture(t);
  assert.throws(() => database.createObjective({
    title: "cyclic objective",
    tasks: [
      { id: "first", capability: "system.health", dataClass: "synthetic", taskArea: "health", dependsOn: ["second"] },
      { id: "second", capability: "system.health", dataClass: "synthetic", taskArea: "health", dependsOn: ["first"] },
    ],
  }), /objective-dependency-cycle/);
  assert.equal(database.listObjectives().length, 0);
});

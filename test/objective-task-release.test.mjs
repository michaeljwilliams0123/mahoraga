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
  assert.deepEqual(released.map((task) => task.id).sort(), ["challenge", "propose"]);

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

  const next = database.getObjective(objective.id).tasks.find((task) => task.id === "synthesize");
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
  assert.deepEqual(database.getObjective(objective.id).tasks.filter((task) => task.status === "planned").map((task) => task.id).sort(), ["challenge", "implement", "integrate", "propose", "synthesize", "verify"]);
  assert.equal(database.getIntegrationLease().controllerId, "primary-cloud-codex");
});

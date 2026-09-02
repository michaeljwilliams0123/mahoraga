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

test("objective release derives policy, lease, and Codex Builder sessions before dispatch", async (t) => {
  const database = fixture(t);
  const manifest = await loadManifest();
  installObjectiveReleaseAuthority({ database, manifest });
  const objective = database.createObjective(objectiveDefinition());

  const reconciled = database.reconcileObjectives();
  assert.equal(reconciled.released.length, 2);
  const current = database.getObjective(objective.id);
  const released = current.tasks.filter((task) => task.status === "released");
  assert.deepEqual(released.map((task) => task.id).sort(), ["challenge", "propose"]);

  const lease = database.getIntegrationLease();
  assert.equal(lease.controllerId, "primary-local-codex");
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

test("a competing Primary lease keeps Codex objective children planned without bypassing authority", async (t) => {
  const database = fixture(t);
  const manifest = await loadManifest();
  installObjectiveReleaseAuthority({ database, manifest });
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

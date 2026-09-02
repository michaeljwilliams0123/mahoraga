import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-objective-release-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return database;
}

test("objective reconciliation delegates child authority and can wait for a lease", (t) => {
  const database = fixture(t);
  const objective = database.createObjective({
    title: "Verify delegated release",
    tasks: [{
      id: "health", capability: "system.health", dataClass: "synthetic", requestedMode: "local",
      taskArea: "runtime-health", owner: "mahoraga", provider: "local-core", retryPolicy: "bounded",
      completionCriteria: "worker-verified", dependsOn: [],
    }],
  });
  let ready = false;
  let calls = 0;
  const submitObjectiveTask = ({ objective: currentObjective, objectiveTask, definition, idempotencyKey }) => {
    calls += 1;
    assert.equal(currentObjective.id, objective.id);
    assert.equal(objectiveTask.id, "health");
    assert.equal(idempotencyKey, `${objective.id}:health:r0`);
    if (!ready) return null;
    return database.submitTask({
      ...definition,
      correlationId: currentObjective.correlationId,
      idempotencyKey,
      requestedOutcome: currentObjective.title,
    });
  };

  database.reconcileObjectives({ submitObjectiveTask });
  assert.equal(calls, 1);
  assert.equal(database.getObjective(objective.id).tasks[0].status, "planned");
  assert.equal(database.listTasks().length, 0);

  ready = true;
  database.reconcileObjectives({ submitObjectiveTask });
  const released = database.getObjective(objective.id).tasks[0];
  assert.equal(calls, 2);
  assert.equal(released.status, "released");
  assert.equal(released.task.capability, "system.health");
});

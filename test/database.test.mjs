import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { RuntimeDatabase } from "../src/database.mjs";

function databaseFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-v2-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"));
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return database;
}

test("task submission is idempotent and durable", (t) => {
  const database = databaseFixture(t);
  const first = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "same-request" });
  const second = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "same-request" });
  assert.equal(first.id, second.id);
  assert.equal(database.listTasks().length, 1);
});

test("expired running tasks recover to queued", (t) => {
  const database = databaseFixture(t);
  const task = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "recover-me" });
  const claimed = database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  assert.equal(claimed.id, task.id);
  assert.equal(database.recoverExpired(new Date(Date.now() + 6000)), 1);
  assert.equal(database.getTask(task.id).status, "queued");
});

test("priority ordering, correlation metadata, and worker crash recovery are durable", (t) => {
  const database = databaseFixture(t);
  database.submitTask({ capability: "system.health", dataClass: "synthetic", idempotencyKey: "normal", priority: "normal", correlationId: "roundtrip-1" });
  const high = database.submitTask({ capability: "system.health", dataClass: "synthetic", idempotencyKey: "high", priority: "high", maximumAttempts: 3 });
  const claimed = database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  assert.equal(claimed.id, high.id);
  assert.equal(database.recoverWorkerTasks("local-core"), 1);
  assert.equal(database.getTask(high.id).status, "queued");
  assert.equal(database.getTask(database.listTasks().find((task) => task.idempotencyKey === "normal").id).correlationId, "roundtrip-1");
  assert.ok(database.listEvents().some((event) => event.eventType === "task.recovered"));
});

test("improvements require an explicit decision before state changes", (t) => {
  const database = databaseFixture(t);
  const improvement = database.proposeImprovement({ title: "Improve worker recovery", summary: "Candidate only.", testSummary: "12/12 passed" });
  assert.equal(improvement.status, "proposed");
  assert.equal(database.decideImprovement(improvement.id, "approved").status, "approved");
});

test("assignment discourse persists and waiting tasks resume with user input", (t) => {
  const database = databaseFixture(t);
  const conversation = database.createConversation({ title: "Browser assignment", initialMessage: "Open the approved workspace." });
  const task = database.submitTask({ capability: "browser.status", dataClass: "synthetic", idempotencyKey: "discourse-task", conversationId: conversation.id });
  database.claimNext({ workerId: "browser", capabilities: ["browser.status"], leaseMs: 5000 });
  assert.equal(database.waitTaskForUser(task.id, "Which approved tab should I use?").status, "waiting_for_user");
  assert.equal(database.resumeTaskWithInput(task.id, "Use the Control Center tab.").status, "queued");
  const messages = database.listConversationMessages(conversation.id);
  assert.deepEqual(messages.map((item) => item.role), ["user", "worker", "user"]);
  assert.equal(messages[1].requiresResponse, true);
});

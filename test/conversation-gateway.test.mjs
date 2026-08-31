import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createConversationGateway } from "../src/conversation-gateway.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-conversation-gateway-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = database.createConversation({ title: "Gateway", initialMessage: "Begin." });
  const gateway = createConversationGateway({
    database,
    manifest: { version: "test" },
    supervisor: { status: () => [] },
    capabilityResolver: () => [{ capability: "system.health", routable: true, workerIds: ["local-core"] }],
    submitTask: (body) => database.submitTask({
      capability: body.intent,
      dataClass: "synthetic",
      requestedMode: "local",
      requestedOutcome: body.requestedOutcome,
      idempotencyKey: body.idempotencyKey,
      conversationId: body.conversationId,
    }),
  });
  return { database, conversation, gateway };
}

test("gateway creates one authoritative foreground task and cancellation reaches it", (t) => {
  const { database, conversation, gateway } = fixture(t);
  const first = gateway.createRun({ sessionId: "ses-local", conversationId: conversation.id, content: "Verify system health", idempotencyKey: "gateway-run-1" });
  assert.equal(first.run.state, "running");
  assert.equal(database.getTask(first.run.taskId).capability, "system.health");
  assert.throws(() => gateway.createRun({ sessionId: "ses-local", conversationId: conversation.id, content: "Verify again", idempotencyKey: "gateway-run-2" }), /foreground-run-active/);
  assert.equal(gateway.cancelRun(first.run.id).state, "cancelled");
  assert.equal(database.getTask(first.run.taskId).status, "cancelled");
});

test("gateway replay projects a terminal task receipt without message plaintext", (t) => {
  const { database, conversation, gateway } = fixture(t);
  const { run } = gateway.createRun({ sessionId: "ses-local", conversationId: conversation.id, content: "Verify system health", idempotencyKey: "gateway-run-terminal" });
  database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  database.markVerifying(run.taskId, "local-core");
  database.finishTask(run.taskId, { status: "completed", resultSummary: "Health verified." });
  const events = gateway.replay(run.id, 0);
  assert.equal(events.at(-1).type, "run-completed");
  assert.ok(events.some((event) => event.type === "receipt-created"));
  assert.doesNotMatch(JSON.stringify(events), /Health verified|Verify system health/);
});

test("gateway capabilities expose routability without manifest secrets", (t) => {
  const { gateway } = fixture(t);
  assert.deepEqual(gateway.capabilities(), [{ capability: "system.health", routable: true, workerIds: ["local-core"] }]);
});

test("gateway retries are idempotent before mutating the conversation", (t) => {
  const { database, gateway } = fixture(t);
  const input = { sessionId: "ses-local", conversationId: null, content: "Verify system health", idempotencyKey: "gateway-repeat" };
  const first = gateway.createRun(input);
  const repeated = gateway.createRun(input);
  assert.equal(repeated.run.id, first.run.id);
  assert.equal(repeated.run.taskId, first.run.taskId);
  assert.equal(database.listConversations().length, 2);
  assert.equal(database.listConversationMessages(first.run.conversationId).length, 1);
  assert.equal(database.listTasks().length, 1);
});

test("gateway rejects a conflicting retry without creating a second message", (t) => {
  const { database, gateway } = fixture(t);
  const first = gateway.createRun({ sessionId: "ses-local", conversationId: null, content: "Verify system health", idempotencyKey: "gateway-conflict" });
  assert.throws(() => gateway.createRun({ sessionId: "ses-local", conversationId: first.run.conversationId, content: "Different request", idempotencyKey: "gateway-conflict" }), /run-idempotency-conflict/);
  assert.equal(database.listConversations().length, 2);
  assert.equal(database.listConversationMessages(first.run.conversationId).length, 1);
  assert.equal(database.listTasks().length, 1);
});

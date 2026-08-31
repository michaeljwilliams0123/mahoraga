import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-run-events-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = database.createConversation({ title: "Run contract", initialMessage: "Verify health." });
  return { database, conversation };
}

test("run event replay is monotonic and excludes prior events", (t) => {
  const { database, conversation } = fixture(t);
  const run = database.createConversationRun({ sessionId: "ses-local", conversationId: conversation.id, idempotencyKey: "run-replay" });
  const first = database.appendRunEvent(run.id, "run-start", { requestSha256: "a".repeat(64), requestBytes: 42 });
  const second = database.appendRunEvent(run.id, "worker-started", { workerId: "local-core" }, { agentId: "local-core" });
  assert.deepEqual(database.listRunEvents(run.id, { afterEventId: first.eventId }).map((event) => event.eventId), [second.eventId]);
  assert.throws(() => database.appendRunEvent(run.id, "text-delta", { text: "private" }), /run-event-payload-private/);
});

test("run creation is idempotent and limits each conversation to one foreground run", (t) => {
  const { database, conversation } = fixture(t);
  const input = { sessionId: "ses-local", conversationId: conversation.id, idempotencyKey: "run-idempotent" };
  const first = database.createConversationRun(input);
  assert.equal(database.createConversationRun(input).id, first.id);
  assert.throws(() => database.createConversationRun({ ...input, idempotencyKey: "run-conflict" }), /foreground-run-active/);
  const cancelled = database.cancelConversationRun(first.id);
  assert.equal(cancelled.state, "cancelled");
  assert.equal(database.listRunEvents(first.id, { afterEventId: 0 }).at(-1).type, "run-cancelled");
  assert.equal(database.createConversationRun({ ...input, idempotencyKey: "run-after-cancel" }).state, "accepted");
});

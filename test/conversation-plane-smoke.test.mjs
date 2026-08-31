import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createConversationGateway } from "../src/conversation-gateway.mjs";

test("conversation intake replays a content-free terminal cancellation receipt", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-conversation-smoke-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => database.close());
  const gateway = createConversationGateway({
    database, manifest: {}, supervisor: {},
    capabilityResolver: () => [{ capability: "system.health", routable: true, workerIds: ["local-core"] }],
    submitTask: (input) => database.submitTask({ capability: "system.health", intent: "system.health", dataClass: "local-only", requestedOutcome: input.requestedOutcome, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, conversationId: input.conversationId }),
  });
  const accepted = gateway.createRun({ sessionId: "ses-smoke-test", conversationId: null, content: "Verify system health", idempotencyKey: "smoke-run-1", attachmentCount: 0, classification: "local-only" });
  gateway.cancelRun(accepted.run.id);
  const events = gateway.replay(accepted.run.id, 0);
  assert.deepEqual(events.map((event) => event.type), ["run-start", "run-cancelled"]);
  assert.equal(events.at(-1).payload.reasonCode, "cancelled-by-user");
  assert.doesNotMatch(JSON.stringify(events), /Verify system health/);
});

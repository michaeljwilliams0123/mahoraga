import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

test("cloud owner server gateway reads vault-backed message content with bounded audit evidence", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-cloud-owner-message-content-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 18),
    syncCoordinationMailbox: false,
  });
  t.after(async () => {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  });

  const secret = "cloud owner gateway assistant message";
  const conversation = runtime.database.createConversation({
    title: "Cloud owner content proof",
    initialMessage: secret,
    classification: "local-only",
  });
  const message = runtime.database.listConversationMessages(conversation.id)[0];
  const sessionId = "cloud-owner-gateway";

  const result = runtime.server.conversationGateway.messageContent({
    conversationId: conversation.id,
    messageId: message.id,
    contentReference: message.contentReference,
    classification: message.classification,
  }, { mechanism: "owner-server-gateway", attendedSession: { active: true, sessionId } });

  assert.equal(result.content, secret);
  const event = runtime.database.listEvents().findLast((item) => item.eventType === "content.accessed");
  assert.equal(event.metadata.mechanism, "owner-server-gateway");
  assert.equal(event.metadata.sessionBound, true);
  assert.doesNotMatch(JSON.stringify(event), new RegExp(`${secret}|${sessionId}`));
});

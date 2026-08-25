import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContentVault } from "../src/content-vault.mjs";
import { RuntimeDatabase } from "../src/database.mjs";
import { startRuntime } from "../src/runtime.mjs";

test("new task and conversation content stays outside operational SQLite projections", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-boundary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 11) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => database.close());

  const conversation = database.createConversation({ title: "Private title", initialMessage: "Private conversation payload", classification: "local-only" });
  const task = database.submitTask({
    intent: "system.health", capability: "system.health", dataClass: "local-only", requestedMode: "local",
    requestedOutcome: "Private task payload", idempotencyKey: "content-boundary-task", conversationId: conversation.id,
  });
  const messages = database.listConversationMessages(conversation.id);

  assert.equal(task.requestedOutcome, null);
  assert.match(task.requestedOutcomeReference, /^vault:/);
  assert.equal(messages[0].content, null);
  assert.match(messages[0].contentReference, /^vault:/);
  assert.doesNotMatch(JSON.stringify(database.getTask(task.id)), /Private task payload/);
  assert.doesNotMatch(JSON.stringify(database.listConversationMessages(conversation.id)), /Private conversation payload/);
  assert.equal(database.getTaskForExecution(task.id).requestedOutcome, "Private task payload");
  assert.equal(database.listConversationMessagesForExecution(conversation.id)[0].content, "Private conversation payload");
});

test("content access evidence stores identity and classification but never returned bytes", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-evidence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 12) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => database.close());
  const task = database.submitTask({ capability: "system.health", dataClass: "local-only", requestedOutcome: "Never persist this phrase", idempotencyKey: "content-evidence-task" });
  database.recordContentAccess({ reference: task.requestedOutcomeReference, ownerType: "task", ownerId: task.id, classification: "local-only", mechanism: "cookie", sessionId: "session-identity-redacted" });
  const event = database.listEvents().find((item) => item.eventType === "content.accessed");
  assert.equal(event.metadata.classification, "local-only");
  assert.equal(event.metadata.sessionBound, true);
  assert.doesNotMatch(JSON.stringify(event), /Never persist this phrase|session-identity-redacted/);
});

test("authenticated content endpoint validates owner and classification before returning bytes", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-api-"));
  const previousToken = process.env.MAHORAGA_PRIMARY_CODEX_TOKEN;
  const token = "content-boundary-token-".padEnd(48, "x");
  process.env.MAHORAGA_PRIMARY_CODEX_TOKEN = token;
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 13),
    syncCoordinationMailbox: false,
  });
  t.after(async () => {
    await runtime.stop(); rmSync(root, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.MAHORAGA_PRIMARY_CODEX_TOKEN;
    else process.env.MAHORAGA_PRIMARY_CODEX_TOKEN = previousToken;
  });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const authorization = { authorization: `Bearer ${token}` };
  const secret = "Content endpoint private payload";
  const createdResponse = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ intent: "system.health", requestedOutcome: secret, idempotencyKey: "content-api-task" }),
  });
  assert.equal(createdResponse.status, 202);
  const { task } = await createdResponse.json();
  assert.equal(task.requestedOutcome, null);
  assert.doesNotMatch(JSON.stringify(task), new RegExp(secret));

  const query = new URLSearchParams({ ownerType: "task", ownerId: task.id, classification: task.dataClass });
  const contentUrl = `${base}/api/content/${task.requestedOutcomeReference}?${query}`;
  assert.equal((await fetch(contentUrl)).status, 401);
  const wrongOwner = new URLSearchParams({ ownerType: "task", ownerId: "mhg-wrong-owner", classification: task.dataClass });
  const denied = await fetch(`${base}/api/content/${task.requestedOutcomeReference}?${wrongOwner}`, { headers: authorization });
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).error, "vault-owner-mismatch");
  const allowed = await fetch(contentUrl, { headers: authorization });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), secret);
  const accessEvent = runtime.database.listEvents().find((item) => item.eventType === "content.accessed");
  assert.ok(accessEvent);
  assert.doesNotMatch(JSON.stringify(accessEvent), new RegExp(secret));
});

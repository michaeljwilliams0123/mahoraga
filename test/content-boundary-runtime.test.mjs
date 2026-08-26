import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createContentVault } from "../src/content-vault.mjs";
import { RuntimeDatabase } from "../src/database.mjs";
import { startRuntime } from "../src/runtime.mjs";

test("new task and conversation content stays outside operational SQLite projections", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-boundary-"));
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 11) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });

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
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 12) });
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { contentVault: vault });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const task = database.submitTask({ capability: "system.health", dataClass: "local-only", requestedOutcome: "Never persist this phrase", idempotencyKey: "content-evidence-task" });
  database.recordContentAccess({ reference: task.requestedOutcomeReference, ownerType: "task", ownerId: task.id, classification: "local-only", mechanism: "cookie", sessionId: "session-identity-redacted" });
  const event = database.listEvents().find((item) => item.eventType === "content.accessed");
  assert.equal(event.metadata.classification, "local-only");
  assert.equal(event.metadata.sessionBound, true);
  assert.doesNotMatch(JSON.stringify(event), /Never persist this phrase|session-identity-redacted/);
});
test("startup migrates legacy conversation plaintext into the content vault", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-legacy-content-"));
  const file = path.join(root, "runtime.sqlite");
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
      current_task_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE conversation_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, task_id TEXT,
      role TEXT NOT NULL, content TEXT NOT NULL, requires_response INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );
  `);
  const timestamp = "2026-08-25T12:00:00.000Z";
  legacy.prepare("INSERT INTO conversations(id,title,status,created_at,updated_at) VALUES(?,?,'active',?,?)")
    .run("con-legacy", "Legacy private title", timestamp, timestamp);
  legacy.prepare("INSERT INTO conversation_messages(id,conversation_id,role,content,created_at) VALUES(?,?,'user',?,?)")
    .run("msg-legacy", "con-legacy", "Legacy private message", timestamp);
  legacy.close();

  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 14) });
  const database = new RuntimeDatabase(file, { contentVault: vault });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });

  const conversationRow = database.db.prepare("SELECT * FROM conversations WHERE id='con-legacy'").get();
  const messageRow = database.db.prepare("SELECT * FROM conversation_messages WHERE id='msg-legacy'").get();
  assert.equal(conversationRow.title, "[vault-content]");
  assert.match(conversationRow.title_ref, /^vault:/);
  assert.equal(messageRow.content, "[vault-content]");
  assert.match(messageRow.content_ref, /^vault:/);
  assert.doesNotMatch(JSON.stringify({ conversationRow, messageRow }), /Legacy private/);
  assert.equal(vault.get(conversationRow.title_ref, {
    ownerType: "conversation", ownerId: "con-legacy", classification: "local-only",
  }).toString("utf8"), "Legacy private title");
  assert.equal(database.listConversationMessagesForExecution("con-legacy")[0].content, "Legacy private message");
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

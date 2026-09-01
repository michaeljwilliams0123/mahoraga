import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

const TOKEN = "chat-runtime-primary-token-000000000000001";
const AUTH = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

test("unified chat intake separates questions from explicit actions", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-chat-runtime-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 37),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;

  const asked = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "auto", content: "Can you explain why it rains outside?", idempotencyKey: "chat-ask-runtime" }),
  });
  assert.equal(asked.status, 202);
  const askBody = await asked.json();
  assert.equal(askBody.decision.mode, "ask");
  assert.equal(askBody.task.capability, "assistant.respond");
  assert.equal(askBody.objective, null);
  assert.equal(runtime.database.getConversation(askBody.conversation.id).titleReference !== null, true);

  const acted = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ mode: "act", content: "Update the Mahoraga interface and apply the change", idempotencyKey: "chat-act-runtime" }),
  });
  assert.equal(acted.status, 202);
  const actBody = await acted.json();
  assert.equal(actBody.decision.mode, "act");
  assert.equal(actBody.task, null);
  assert.equal(actBody.objective.tasks.length, 6);
  assert.deepEqual(actBody.objective.tasks.map((item) => item.definition.id).sort(), ["challenge", "implement", "integrate", "propose", "synthesize", "verify"]);
});

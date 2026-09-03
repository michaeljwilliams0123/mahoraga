import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalArtifactStore, inspectTaskArtifacts } from "../src/local-artifact-store.mjs";
import { startRuntime } from "../src/runtime.mjs";

const PRIMARY_TOKEN = "artifact-runtime-primary-token-0000000000001";
const AUTH = { authorization: `Bearer ${PRIMARY_TOKEN}` };

test("private local artifacts preserve integrity and support deterministic inspection", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-artifact-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new LocalArtifactStore(root, { allowLegacyPlaintextWrites: true });
  const artifact = await store.put({
    name: "evidence.csv",
    mimeType: "text/csv",
    source: "test",
    bytes: Buffer.from("Quarter,Amount\nQ1,100\n"),
  });
  const result = await inspectTaskArtifacts({ messages: [{ attachments: [artifact] }] }, { store });
  assert.equal(result.verified, true);
  assert.equal(result.artifactCount, 1);
  assert.equal(result.observations[0].kind, "text");
  assert.match(result.summary, /content preview withheld/);
  assert.doesNotMatch(result.summary, /Quarter,Amount/);
  const stored = await store.read(artifact.id);
  assert.equal(stored.bytes.toString("utf8"), "Quarter,Amount\nQ1,100\n");
});

test("runtime API uploads, attaches, inspects, and protects a private artifact", { skip: process.platform !== "win32" && "DPAPI-backed worker vault requires Windows" }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-artifact-runtime-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), primaryCodexToken: PRIMARY_TOKEN, syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  await waitFor(async () => (await (await fetch(`${base}/api/status`)).json()).capabilities.some((item) => item.capability === "artifact.inspect" && item.routable === true));

  const bytes = Buffer.from("Quarter,Amount\nQ1,100\n");
  const uploadResponse = await fetch(`${base}/api/artifacts`, {
    method: "POST",
    headers: {
      "content-type": "text/csv",
      ...AUTH,
      "x-mahoraga-file-name": encodeURIComponent("enterprise evidence.csv"),
      "x-mahoraga-file-source": "test",
    },
    body: bytes,
  });
  assert.equal(uploadResponse.status, 201);
  const { artifact } = await uploadResponse.json();
  assert.equal(artifact.storageClass, "encrypted-local-private");

  const created = await (await fetch(`${base}/api/conversations`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ title: "Attachment evaluation", initialMessage: "Inspect the attached evidence.", attachmentIds: [artifact.id] }),
  })).json();
  const messages = await (await fetch(`${base}/api/conversations/${created.conversation.id}/messages`, { headers: AUTH })).json();
  assert.equal(messages.messages[0].attachments[0].id, artifact.id);

  const createdTask = await (await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({
      intent: "artifact.inspect", requestedOutcome: "Inspect the attached evidence.", contentReferences: [artifact.id],
      conversationId: created.conversation.id,
      idempotencyKey: `artifact-test-${Date.now()}`,
    }),
  })).json();
  const completed = await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`, { headers: AUTH })).json();
    return tasks.tasks.find((task) => task.id === createdTask.task.id && task.status === "completed");
  });
  assert.equal(completed.resultSummary, null);
  assert.match(completed.resultSummaryReference, /^vault:/);

  const contentResponse = await fetch(`${base}/api/artifacts/${artifact.id}/content`, { headers: AUTH });
  assert.equal(contentResponse.status, 200);
  assert.deepEqual(Buffer.from(await contentResponse.arrayBuffer()), bytes);
  const deniedDelete = await fetch(`${base}/api/artifacts/${artifact.id}`, { method: "DELETE", headers: AUTH });
  assert.equal(deniedDelete.status, 409);
  assert.equal((await deniedDelete.json()).error, "artifact-in-use");
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for artifact runtime state.");
}

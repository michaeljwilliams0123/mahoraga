import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startRuntime } from "../src/runtime.mjs";
import { normalizeSummary } from "../src/supervisor.mjs";
import { bearerMatches } from "../src/local-auth.mjs";

test("worker receipts are bounded to a safe single line before persistence", () => {
  const summary = normalizeSummary(`passed\n${"verified ".repeat(400)}`);
  assert.equal(/[\r\n]/.test(summary), false);
  assert.ok(summary.length <= 2000);
});

test("Primary Codex intake bearer comparison fails closed", () => {
  assert.equal(bearerMatches({ headers: {} }, "x".repeat(32)), false);
  assert.equal(bearerMatches({ headers: { authorization: `Bearer ${"x".repeat(32)}` } }, "x".repeat(32)), true);
  assert.equal(bearerMatches({ headers: { authorization: "Bearer wrong" } }, "x".repeat(32)), false);
});

test("runtime serves the cockpit API and completes a health task", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  await waitFor(async () => (await (await fetch(`${base}/api/status`)).json()).workers.some((worker) => ["healthy", "busy"].includes(worker.status)));
  const status = await (await fetch(`${base}/api/status`)).json();
  const healthCapability = status.capabilities.find((item) => item.capability === "system.health");
  assert.equal(healthCapability.permissionClass, "bounded-local");
  assert.equal(healthCapability.availability, "healthy");
  assert.equal(status.routingPolicy.interfaceOrder[0], "native-api");
  assert.match(await (await fetch(base)).text(), /data-page="capabilities"/);
  const created = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: `test-${Date.now()}` }),
  })).json();
  const completed = await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`)).json();
    return tasks.tasks.find((task) => task.id === created.task.id && task.status === "completed");
  });
  assert.match(completed.resultSummary, /runtime is responsive/);
});

test("improvement decisions fail closed without the candidate-specific approval header", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const proposed = await (await fetch(`${base}/api/improvements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Candidate", summary: "Tested proposal" }) })).json();
  const denied = await fetch(`${base}/api/improvements/${proposed.improvement.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }) });
  assert.equal(denied.status, 403);
  const approved = await (await fetch(`${base}/api/improvements/${proposed.improvement.id}/decision`, { method: "POST", headers: { "content-type": "application/json", "x-mahoraga-approval": proposed.improvement.id }, body: JSON.stringify({ decision: "approved" }) })).json();
  assert.equal(approved.improvement.status, "approved");
});

test("Control Center creates and continues a durable assignment thread", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const created = await (await fetch(`${base}/api/conversations`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Persistent assignment", initialMessage: "Continue while I am away." }),
  })).json();
  await fetch(`${base}/api/conversations/${created.conversation.id}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "Additional input.", role: "user" }),
  });
  const messages = await (await fetch(`${base}/api/conversations/${created.conversation.id}/messages`)).json();
  assert.deepEqual(messages.messages.map((item) => item.content), ["Continue while I am away.", "Additional input."]);
});

test("completed worker receipts return to the chat conversation", async (t) => {
  const { runtime } = await runtimeFixture(t);
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const conversation = await (await fetch(`${base}/api/conversations`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Chat receipt", initialMessage: "Is the runtime healthy?" }),
  })).json();
  const created = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", conversationId: conversation.conversation.id, idempotencyKey: `chat-${Date.now()}` }),
  })).json();
  await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`)).json();
    return tasks.tasks.find((task) => task.id === created.task.id && task.status === "completed");
  });
  const messages = await (await fetch(`${base}/api/conversations/${conversation.conversation.id}/messages`)).json();
  assert.deepEqual(messages.messages.map((item) => item.role), ["user", "assistant"]);
  assert.match(messages.messages[1].content, /runtime is responsive/);
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error("Timed out waiting for runtime state.");
}

async function runtimeFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-v2-runtime-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  return { runtime, root };
}

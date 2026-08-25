import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

test("acknowledgement-only chat answers retry boundedly and end explicitly unresolved", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-answer-quality-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const submitted = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      capability: "assistant.respond", dataClass: "synthetic", requestedMode: "local",
      idempotencyKey: `quality-${Date.now()}`, requestedOutcome: "Explain the exact private-interface failure and its verified fix.",
      maximumAttempts: 2,
    }),
  })).json();

  const task = await waitFor(() => {
    const current = runtime.database.getTask(submitted.task.id);
    return current?.status === "failed" ? current : null;
  });
  assert.equal(task.attemptCount, 2);
  assert.equal(task.errorCode, "answer-quality-unresolved");
  assert.match(task.resultSummary, /could not verify a complete response after 2 bounded attempts/i);
  assert.doesNotMatch(task.resultSummary, /successfully completed/i);

  const evaluations = runtime.database.listAnswerEvaluations(task.id).reverse();
  assert.deepEqual(evaluations.map((item) => item.decision), ["retry", "unresolved"]);
  assert.ok(evaluations.every((item) => item.reasons.includes("mere-acknowledgement")));
  assert.ok(evaluations.every((item) => !Object.hasOwn(item, "summary")));
  const messages = runtime.database.listConversationMessages(task.conversationId);
  assert.match(messages.at(-1).content, /No claim of completion was recorded/);
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for bounded answer-quality state.");
}

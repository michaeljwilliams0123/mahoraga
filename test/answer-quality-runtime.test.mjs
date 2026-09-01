import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

const PRIMARY_TOKEN = "answer-quality-primary-token-000000000001";
const AUTH = { authorization: `Bearer ${PRIMARY_TOKEN}` };
const TEST_VAULT_KEY = Buffer.alloc(32, 21);

test("chat answers route only to the dedicated question model instead of acknowledgement-only local core", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-answer-quality-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: TEST_VAULT_KEY,
    primaryCodexToken: PRIMARY_TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const submitted = await (await fetch(`${base}/api/tasks`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({
      intent: "assistant.respond", idempotencyKey: `quality-${Date.now()}`, requestedOutcome: "Explain the exact private-interface failure and its verified fix.",
      maximumAttempts: 2,
    }),
  })).json();

  const task = runtime.database.getTask(submitted.task.id);
  assert.deepEqual(task.allowedWorkerIds, ["question-model"]);
  assert.equal(task.completionCriteria, "substantive-response");
  assert.equal(runtime.manifest.workers.find((item) => item.id === "local-core").capabilities.includes("assistant.respond"), false);
});

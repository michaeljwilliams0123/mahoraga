import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

test("private browser artifact intake and provider gaps produce explicit receipts", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-control-intake-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  await waitFor(async () => (await (await fetch(`${base}/api/status`)).json()).capabilities.some((item) => item.capability === "provider.gap" && item.availability === "healthy"));

  const upload = await fetch(`${base}/api/artifacts`, {
    method: "POST",
    headers: {
      "content-type": "image/png; charset=binary",
      "x-mahoraga-file-name": encodeURIComponent("clipboard screenshot.png"),
      "x-mahoraga-file-source": "clipboard",
    },
    body: Buffer.from([137, 80, 78, 71, 1]),
  });
  assert.equal(upload.status, 201);
  const { artifact } = await upload.json();
  assert.equal(artifact.mimeType, "image/png");
  assert.equal(artifact.source, "clipboard");
  assert.equal(artifact.storageClass, "device-local-private");

  const empty = await fetch(`${base}/api/artifacts`, {
    method: "POST",
    headers: { "x-mahoraga-file-name": "empty.png", "x-mahoraga-file-source": "picker" },
    body: Buffer.alloc(0),
  });
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, "artifact-empty");

  const created = await (await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      capability: "provider.gap",
      dataClass: "enterprise",
      requestedMode: "local",
      requestedOutcome: "Review an enterprise Microsoft work link.",
      idempotencyKey: `provider-gap-${Date.now()}`,
    }),
  })).json();
  const completed = await waitFor(async () => {
    const tasks = await (await fetch(`${base}/api/tasks`)).json();
    return tasks.tasks.find((task) => task.id === created.task.id && task.status === "completed");
  });
  assert.match(completed.resultSummary, /kept this enterprise request local/i);
  assert.match(completed.resultSummary, /Microsoft 365 execution provider is not enabled/i);
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for Control Center intake state.");
}

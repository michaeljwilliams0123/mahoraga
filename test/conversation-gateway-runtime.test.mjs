import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

const TOKEN = "conversation-gateway-runtime-token-000000000001";

test("authenticated v2 loopback intake returns replayable SSE and cancels the run", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-gateway-runtime-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    contentVaultMasterKey: Buffer.alloc(32, 31),
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  await waitFor(async () => (await (await fetch(`${base}/api/status`)).json()).capabilities.some((item) => item.capability === "system.health" && item.routable === true));
  const accepted = await fetch(`${base}/api/v2/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "Verify system health", idempotencyKey: "runtime-v2-run" }),
  });
  assert.equal(accepted.status, 202);
  const { run } = await accepted.json();
  const replay = await fetch(`${base}/api/v2/runs/${run.id}/events?after=0`, { headers: { authorization: `Bearer ${TOKEN}`, accept: "text/event-stream" } });
  assert.equal(replay.status, 200);
  assert.match(await replay.text(), /event: run-start/);
  const cancelled = await fetch(`${base}/api/v2/runs/${run.id}/cancel`, { method: "POST", headers, body: "{}" });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).run.state, "cancelled");
});

async function waitFor(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for a routable conversation capability.");
}

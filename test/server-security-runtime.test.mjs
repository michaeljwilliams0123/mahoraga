import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";

test("runtime protects sensitive reads and mutations behind a prompt-free local session", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-session-runtime-"));
  const previousToken = process.env.MAHORAGA_PRIMARY_CODEX_TOKEN;
  const token = "session-test-token-".padEnd(48, "x");
  process.env.MAHORAGA_PRIMARY_CODEX_TOKEN = token;
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), artifactRoot: path.join(root, "artifacts"), syncCoordinationMailbox: false });
  t.after(async () => {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.MAHORAGA_PRIMARY_CODEX_TOKEN;
    else process.env.MAHORAGA_PRIMARY_CODEX_TOKEN = previousToken;
  });

  const base = `http://127.0.0.1:${runtime.address.port}`;
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
  assert.equal((await fetch(`${base}/api/identity`)).status, 200);
  assert.equal((await fetch(`${base}/api/tasks`)).status, 401);
  assert.equal((await fetch(`${base}/api/conversations`)).status, 401);
  assert.equal((await fetch(`${base}/api/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);

  const nonceResponse = await fetch(`${base}/api/session/bootstrap-nonce`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  assert.equal(nonceResponse.status, 201);
  const { nonce } = await nonceResponse.json();
  const exchange = await fetch(`${base}/session/bootstrap?nonce=${encodeURIComponent(nonce)}`, { redirect: "manual" });
  assert.equal(exchange.status, 302);
  assert.equal(exchange.headers.get("location"), "/");
  const cookie = exchange.headers.get("set-cookie").split(";", 1)[0];
  assert.equal((await fetch(`${base}/api/tasks`, { headers: { cookie } })).status, 200);

  const body = JSON.stringify({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", requestedOutcome: "Verify local health.", idempotencyKey: `session-${Date.now()}` });
  assert.equal((await fetch(`${base}/api/tasks`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body })).status, 403);
  assert.equal((await fetch(`${base}/api/tasks`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body })).status, 202);
});

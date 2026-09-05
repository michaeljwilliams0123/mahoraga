import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { createControlSessionManager } from "../src/control-session.mjs";

const modulePath = new URL("../src/relay/pga-status.mjs", import.meta.url);

async function loadModule() {
  assert.equal(existsSync(modulePath), true, "src/relay/pga-status.mjs must exist");
  return import(modulePath.href);
}

test("PGA route is installed on the existing server and requires normal Mahoraga authentication", async (t) => {
  const { createPgaTelemetryRegistry, installPgaTelemetryRoute } = await loadModule();
  const primaryToken = "pga-route-test-token".padEnd(48, "x");
  const sessions = createControlSessionManager();
  const registry = createPgaTelemetryRegistry();
  const server = createServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "fallback" }));
  });
  installPgaTelemetryRoute(server, { primaryToken, sessions, registry });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  assert.equal((await fetch(`${base}/api/v1/pga/stream`)).status, 401);
  const authorized = await fetch(`${base}/api/v1/pga/stream`, { headers: { authorization: `Bearer ${primaryToken}` } });
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get("content-type"), /^text\/event-stream/);
  assert.equal(authorized.headers.get("access-control-allow-origin"), null);
  await authorized.body.cancel();
});
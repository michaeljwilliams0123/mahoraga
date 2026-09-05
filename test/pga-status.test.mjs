import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";

const modulePath = new URL("../src/relay/pga-status.mjs", import.meta.url);

async function loadTelemetryModule() {
  assert.equal(existsSync(modulePath), true, "src/relay/pga-status.mjs must exist");
  return import(modulePath.href);
}

test("PGA registry exposes bounded decision summaries and rejects private reasoning", async () => {
  const { createPgaTelemetryRegistry } = await loadTelemetryModule();
  const registry = createPgaTelemetryRegistry();
  registry.update({
    predictiveMetrics: { driftRisk: "STABLE", databaseHealth: "WAL_OK" },
    generativeState: {
      decisionSummary: {
        proposal: "Observe candidate health.",
        challenge: "Require evidence before mutation.",
        synthesis: "Continue observation.",
      },
    },
  });
  const snapshot = registry.snapshot();
  assert.equal(snapshot.mode, "ADMIN_COGNITIVE_PLANE");
  assert.equal(snapshot.generativeState.decisionSummary.synthesis, "Continue observation.");
  assert.equal("currentThoughtChain" in snapshot.generativeState, false);
  assert.throws(() => registry.update({ generativeState: { currentThoughtChain: "private" } }), /pga-private-reasoning-field-forbidden/);
});

test("PGA SSE is local-session compatible and never emits wildcard CORS", async () => {
  const { createPgaTelemetryRegistry, handlePgaTelemetryStream } = await loadTelemetryModule();
  const registry = createPgaTelemetryRegistry();
  const request = new EventEmitter();
  const writes = [];
  let headers;
  const response = {
    writeHead(status, nextHeaders) { headers = { status, ...nextHeaders }; },
    write(chunk) { writes.push(String(chunk)); },
    end() {},
  };

  const cleanup = handlePgaTelemetryStream(request, response, registry, { heartbeatMs: 60_000 });
  assert.equal(headers.status, 200);
  assert.match(headers["Content-Type"], /^text\/event-stream/);
  assert.equal(headers["Cache-Control"], "no-cache, no-transform");
  assert.equal(headers.Connection, "keep-alive");
  assert.equal(Object.hasOwn(headers, "Access-Control-Allow-Origin"), false);
  assert.match(writes.join(""), /ADMIN_COGNITIVE_PLANE/);
  registry.update({ agenticStatus: { activeLeases: 2, currentWorker: "repository" } });
  assert.match(writes.join(""), /activeLeases/);
  request.emit("close");
  cleanup?.();
});
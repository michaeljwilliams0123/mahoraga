import { EventEmitter } from "node:events";
import { authenticateLocalRequest } from "../control-session.mjs";

const PRIVATE_REASONING_KEYS = new Set([
  "thought", "thoughtpayload", "chainofthought", "currentthoughtchain", "rawreasoning", "reasoningtrace",
]);

const DEFAULT_TELEMETRY = Object.freeze({
  mode: "ADMIN_COGNITIVE_PLANE",
  predictiveMetrics: Object.freeze({ driftRisk: "STABLE", databaseHealth: "WAL_UNKNOWN" }),
  generativeState: Object.freeze({
    decisionSummary: Object.freeze({
      proposal: "Await candidate baseline observation.",
      challenge: "No candidate evidence has been evaluated yet.",
      synthesis: "Hold mutations until bounded verification evidence exists.",
    }),
  }),
  agenticStatus: Object.freeze({ activeLeases: 0, currentWorker: "repository" }),
  canaryScores: Object.freeze({ databaseTxPass: true, fsIntegrityPass: true }),
  updatedAt: null,
});

export function createPgaTelemetryRegistry(initial = {}) {
  const emitter = new EventEmitter();
  assertNoPrivateReasoning(initial);
  let state = mergeTelemetry(DEFAULT_TELEMETRY, initial);

  return Object.freeze({
    update(patch = {}) {
      assertNoPrivateReasoning(patch);
      state = mergeTelemetry(state, { ...patch, updatedAt: new Date().toISOString() });
      const snapshot = clone(state);
      emitter.emit("update", snapshot);
      return snapshot;
    },
    snapshot() {
      return clone(state);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("pga-telemetry-listener-required");
      emitter.on("update", listener);
      return () => emitter.off("update", listener);
    },
  });
}

export function handlePgaTelemetryStream(request, response, registry, { heartbeatMs = 1_000 } = {}) {
  if (!registry || typeof registry.snapshot !== "function" || typeof registry.subscribe !== "function") throw new TypeError("pga-telemetry-registry-required");
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 100) throw new TypeError("pga-heartbeat-invalid");
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Content-Type-Options": "nosniff",
  });
  response.write(frame("snapshot", registry.snapshot()));

  let closed = false;
  const unsubscribe = registry.subscribe((next) => {
    if (!closed) response.write(frame("telemetry", next));
  });
  const heartbeat = setInterval(() => {
    if (!closed) response.write(`: heartbeat ${Date.now()}\n\n`);
  }, heartbeatMs);
  heartbeat.unref?.();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  request.once("close", cleanup);
  request.once("aborted", cleanup);
  return cleanup;
}

export function installPgaTelemetryRoute(server, { primaryToken, sessions, registry } = {}) {
  if (!server || typeof server.listeners !== "function") throw new TypeError("pga-server-required");
  if (!sessions || typeof sessions.authenticateCookie !== "function") throw new TypeError("pga-control-sessions-required");
  if (!registry || typeof registry.snapshot !== "function") throw new TypeError("pga-telemetry-registry-required");
  const existing = server.listeners("request");
  if (existing.length === 0) throw new TypeError("pga-existing-request-handler-required");
  server.removeAllListeners("request");
  server.on("request", (request, response) => {
    let pathname;
    try { pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; } catch { pathname = "/"; }
    if (request.method === "GET" && pathname === "/api/v1/pga/stream") {
      const authentication = authenticateLocalRequest(request, { primaryToken, sessions });
      if (!authentication.authenticated) {
        response.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "local-session-required" }));
        return;
      }
      handlePgaTelemetryStream(request, response, registry);
      return;
    }
    for (const listener of existing) listener.call(server, request, response);
  });
  return server;
}

function frame(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function mergeTelemetry(base, patch) {
  return {
    ...clone(base),
    ...clone(patch),
    predictiveMetrics: { ...base.predictiveMetrics, ...(patch.predictiveMetrics ?? {}) },
    generativeState: { ...base.generativeState, ...(patch.generativeState ?? {}) },
    agenticStatus: { ...base.agenticStatus, ...(patch.agenticStatus ?? {}) },
    canaryScores: { ...base.canaryScores, ...(patch.canaryScores ?? {}) },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoPrivateReasoning(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError("pga-telemetry-cyclic");
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (PRIVATE_REASONING_KEYS.has(normalized)) throw new TypeError("pga-private-reasoning-field-forbidden");
    assertNoPrivateReasoning(nested, seen);
  }
  seen.delete(value);
}
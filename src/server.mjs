import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { capabilityIndex } from "./router.mjs";

const WEB_ROOT = path.join(ROOT, "web");
const STATIC = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

export function createControlServer({ manifest, database, supervisor }) {
  return createServer(async (request, response) => {
    try {
      setHeaders(response);
      const url = new URL(request.url, `http://${manifest.runtime.host}:${manifest.runtime.port}`);
      if (request.method === "GET" && STATIC.has(url.pathname)) return staticFile(response, ...STATIC.get(url.pathname));
      if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, statusPayload(manifest, database, supervisor));
      if (request.method === "GET" && url.pathname === "/api/tasks") return json(response, 200, { tasks: database.listTasks() });
      if (request.method === "GET" && url.pathname === "/api/events") return json(response, 200, { events: database.listEvents() });
      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const body = await bodyJson(request);
        const task = database.submitTask({
          capability: body.capability, dataClass: body.dataClass ?? "synthetic",
          requestedMode: body.requestedMode ?? manifest.defaultAutonomyMode, idempotencyKey: body.idempotencyKey,
          correlationId: body.correlationId, taskType: body.taskType, requestedOutcome: body.requestedOutcome,
          executionPlane: body.executionPlane ?? "local", priority: body.priority ?? "normal",
          maximumAttempts: body.maximumAttempts ?? manifest.queue.maximumAttempts,
        });
        return json(response, 202, { task });
      }
      if (request.method === "GET" && url.pathname === "/api/improvements") return json(response, 200, { improvements: database.listImprovements() });
      if (request.method === "POST" && url.pathname === "/api/improvements") {
        const body = await bodyJson(request);
        return json(response, 202, { improvement: database.proposeImprovement(body) });
      }
      const decision = url.pathname.match(/^\/api\/improvements\/(imp-[a-f0-9-]+)\/decision$/);
      if (request.method === "POST" && decision) {
        const body = await bodyJson(request);
        if (request.headers["x-mahoraga-approval"] !== decision[1]) return json(response, 403, { error: "explicit-user-approval-required" });
        return json(response, 200, { improvement: database.decideImprovement(decision[1], body.decision) });
      }
      json(response, 404, { error: "not-found" });
    } catch (error) {
      json(response, 400, { error: classify(error) });
    }
  });
}

export function statusPayload(manifest, database, supervisor) {
  const tasks = database.listTasks();
  return {
    product: manifest.product, version: manifest.version, versions: manifest.versions, phase: manifest.phase,
    environment: manifest.environment, featureFlags: manifest.featureFlags, queue: manifest.queue,
    updateAuthority: manifest.updateAuthority, autonomyMode: manifest.defaultAutonomyMode,
    repairPolicy: {
      enabled: manifest.repair.enabled,
      automaticRiskClasses: manifest.repair.automaticRiskClasses,
      coreUpdateAuthority: manifest.repair.coreUpdateAuthority,
      scanIntervalMs: manifest.repair.scanIntervalMs,
    },
    runtime: { host: manifest.runtime.host, port: manifest.runtime.port, healthy: true },
    taskCounts: Object.fromEntries(["queued", "claimed", "running", "verifying", "waiting", "completed", "failed", "cancelled"].map((state) => [state, tasks.filter((task) => task.status === state).length])),
    workers: supervisor.status(), capabilities: capabilityIndex(manifest), connections: manifest.connections,
    improvementsAwaitingUser: database.listImprovements().filter((item) => item.status === "proposed").length,
  };
}

function setHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
}
async function staticFile(response, file, contentType) { response.writeHead(200, { "Content-Type": contentType }); response.end(await readFile(path.join(WEB_ROOT, file))); }
function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); }
async function bodyJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new Error("request-too-large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function classify(error) {
  if (error instanceof SyntaxError) return "invalid-json";
  if (/invalid|required|missing|must|unknown|duplicate/i.test(error?.message ?? "")) return error.message;
  return "request-rejected";
}

import { createServer } from "node:http";
import { DEFAULT_REDDIT_EVOLUTION_USER, MAX_REDDIT_INTAKE_BYTES, verifyRedditEvolutionRequest } from "./reddit-evolution-intake.mjs";

export function createRedditEvolutionApiServer({
  secret,
  allowedUser = DEFAULT_REDDIT_EVOLUTION_USER,
  now = Date.now,
  maximumBytes = MAX_REDDIT_INTAKE_BYTES,
} = {}) {
  if (typeof now !== "function") throw new TypeError("reddit-api-clock-invalid");
  const server = createServer(async (request, response) => {
    try {
      setHeaders(response);
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, service: "reddit-evolution-api" });
      if (request.method !== "POST" || url.pathname !== "/api/intake/reddit/evolution-signal") return json(response, 404, { error: "not-found" });
      const body = await bodyText(request, maximumBytes);
      const result = verifyRedditEvolutionRequest({ body, headers: request.headers, secret, allowedUser, now: now() });
      return json(response, 202, result);
    } catch (error) {
      const status = classifyStatus(error);
      return json(response, status, { error: publicCode(error) });
    }
  });
  return server;
}

export async function startRedditEvolutionApiServer({ host = "127.0.0.1", port = 0, ...options } = {}) {
  if (typeof host !== "string" || !new Set(["127.0.0.1", "localhost", "::1"]).has(host)) throw new TypeError("reddit-api-host-invalid");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new TypeError("reddit-api-port-invalid");
  const server = createRedditEvolutionApiServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return Object.freeze({
    server,
    address: server.address(),
    async close() { await new Promise((resolve) => server.close(resolve)); },
  });
}

async function bodyText(request, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAX_REDDIT_INTAKE_BYTES) throw new TypeError("reddit-api-body-limit-invalid");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw apiError("reddit-body-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function setHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function json(response, status, value) {
  response.writeHead(status);
  response.end(JSON.stringify(value));
}

function classifyStatus(error) {
  if (publicCode(error) === "reddit-body-too-large") return 413;
  if (/signature|timestamp|secret|account|reference|signal|body|user|tag|metric|ratio/i.test(publicCode(error))) return 400;
  return 500;
}

function publicCode(error) {
  return typeof error?.code === "string" && /^[a-z][a-z0-9-]{1,80}$/.test(error.code) ? error.code : "reddit-intake-rejected";
}

function apiError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

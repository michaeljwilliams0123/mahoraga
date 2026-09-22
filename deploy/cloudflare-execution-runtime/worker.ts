import { DurableObject } from "cloudflare:workers";
import { CloudflareDOSQLiteAdapter, type ProviderStateRecord, type StorageReceipt } from "./storage";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const LEASE_TTL_MS = 15_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ASSISTANT_PROVIDER_ID = "cloudflare-workers-ai";

const targetShaValid = (value: unknown): value is string => typeof value === "string" && SHA_PATTERN.test(value);

const json = (body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(JSON_HEADERS);
  if (headers !== undefined) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

const pendingAssistantCapability = (provider = "cloudflare-native", reasonCode = "cloudflare-native-provider-pending") => ({
  capability: "assistant.respond",
  routable: false,
  enabled: false,
  provider,
  workerIds: [] as string[],
  routingReason: "provider.gap",
  providerReasonCode: reasonCode,
  evidenceLevel: "runtime-probe",
});

const projectPersistedAssistantCapability = (state: ProviderStateRecord | null, now = Date.now()) => {
  if (state === null) return pendingAssistantCapability();
  if (state.verifiedAt === null || state.canaryExpiresAt === null || state.canaryExpiresAt <= now) {
    return pendingAssistantCapability(state.providerId, "provider-canary-stale");
  }
  if (!state.available || !state.zeroCreditEligible) {
    return pendingAssistantCapability(state.providerId, state.reasonCode ?? "provider-not-admitted");
  }
  return {
    capability: "assistant.respond",
    routable: true,
    enabled: true,
    provider: state.providerId,
    workerIds: [] as string[],
    routingReason: null,
    providerReasonCode: null,
    evidenceLevel: "runtime-probe",
  };
};

const secureEqual = async (provided: string, expected: string): Promise<boolean> => {
  if (provided.length === 0 || expected.length === 0) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
};

const railwayTarget = (requestUrl: URL, configured: string): URL => {
  const anchor = new URL(configured);
  if (anchor.protocol !== "https:" || anchor.username || anchor.password || anchor.search || anchor.hash) {
    throw new Error("railway-anchor-invalid");
  }
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, anchor);
};

const proxyToRailway = async (request: Request, requestUrl: URL, env: Env): Promise<Response> => {
  try {
    const target = railwayTarget(requestUrl, env.RAILWAY_ANCHOR_URL);
    const headers = new Headers(request.headers);
    headers.delete("x-bypass-token");
    headers.delete("host");
    const upstream = await fetch(new Request(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }));
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("x-bypass-applied", "true");
    responseHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return json({ error: "Railway bypass unavailable" }, 502);
  }
};

export class ExecutionDurableObject extends DurableObject<Env> {
  readonly storage: CloudflareDOSQLiteAdapter;
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = new CloudflareDOSQLiteAdapter(ctx);
  }

  private initialize(): void {
    if (this.initialized) return;
    this.storage.initSchema();
    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(this.env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/live") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      return json({ status: "live", sha: this.env.TARGET_SHA });
    }
    if (url.pathname === "/api/ready") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try {
        this.initialize();
        this.storage.sql.exec("SELECT 1").one();
        return json({ status: "ready", sha: this.env.TARGET_SHA });
      } catch {
        return json({ status: "unready" }, 503);
      }
    }
    if (url.pathname === "/api/capabilities") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try {
        this.initialize();
        const providerState = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
        return json({ capabilities: [projectPersistedAssistantCapability(providerState)] });
      } catch {
        return json({ capabilities: [pendingAssistantCapability(ASSISTANT_PROVIDER_ID, "provider-state-unavailable")] });
      }
    }
    if (url.pathname !== "/api/execute") return json({ error: "Not Found" }, 404);
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { allow: "POST" });

    const actualSha = request.headers.get("x-target-sha");
    if (actualSha !== this.env.TARGET_SHA) {
      return json({ error: "Precondition Failed: SHA mismatch", expected: this.env.TARGET_SHA, actual: actualSha }, 412);
    }
    if (this.env.BYPASS_SECRET.length === 0) return json({ error: "Execution environment invalid" }, 503);

    const bypassToken = request.headers.get("x-bypass-token") ?? "";
    if (await secureEqual(bypassToken, this.env.BYPASS_SECRET)) return proxyToRailway(request, url, this.env);

    this.initialize();
    const key = request.headers.get("x-idempotency-key")?.trim() ?? "";
    if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return json({ error: "Idempotency key required" }, 400);
    }

    const existing = this.storage.getIdempotentReceipt(key);
    if (existing !== null) return json(existing.resultPayload, 200, { "x-idempotent-replay": "true" });

    const holderId = crypto.randomUUID();
    const leaseResource = `execution:${key}`;
    if (!this.storage.acquireLease(leaseResource, holderId, LEASE_TTL_MS)) {
      return json({ error: "Conflict: Concurrent request in progress" }, 409);
    }

    try {
      const racedReceipt = this.storage.getIdempotentReceipt(key);
      if (racedReceipt !== null) return json(racedReceipt.resultPayload, 200, { "x-idempotent-replay": "true" });
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return json({ error: "Content-Type must be application/json" }, 415);
      }
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return json({ error: "Invalid JSON payload" }, 400);
      }
      if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
        return json({ error: "JSON payload must be an object" }, 400);
      }

      const result: Record<string, unknown> = {
        executed: true,
        data: payload as Record<string, unknown>,
        timestamp: Date.now(),
      };
      const receipt: StorageReceipt = {
        id: crypto.randomUUID(),
        idempotencyKey: key,
        status: "SUCCESS",
        resultPayload: result,
        createdAt: Date.now(),
      };
      this.storage.executeTransaction(() => this.storage.saveReceipt(receipt));
      return json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";
      return json({ error: message }, 500);
    } finally {
      this.storage.releaseLease(leaseResource, holderId);
    }
  }

}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/execute" && request.method === "POST") {
      const actualSha = request.headers.get("x-target-sha");
      if (actualSha !== env.TARGET_SHA) {
        return json({ error: "Precondition Failed: SHA mismatch", expected: env.TARGET_SHA, actual: actualSha }, 412);
      }
      if (env.BYPASS_SECRET.length === 0) return json({ error: "Execution environment invalid" }, 503);
      const bypassToken = request.headers.get("x-bypass-token") ?? "";
      if (await secureEqual(bypassToken, env.BYPASS_SECRET)) return proxyToRailway(request, url, env);
    }
    const stub = env.EXECUTION_DO.getByName("execution-v1");
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;

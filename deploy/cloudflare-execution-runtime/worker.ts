import { DurableObject } from "cloudflare:workers";
import { encryptConversationContent, decryptConversationContent } from "./content-vault";
import { CloudflareDOSQLiteAdapter, type ProviderStateRecord, type StorageReceipt } from "./storage";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const LEASE_TTL_MS = 15_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ASSISTANT_PROVIDER_ID = "cloudflare-workers-ai";
const ASSISTANT_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const TRAFFIC_AUTHORITY = "cloudflare-canonical";
const DURABLE_STATE = "cloudflare-do-sqlite";
const RAILWAY_ANCHOR_HOST = "mahoraga-runtime-main-production.up.railway.app";
const FORWARDED_BY_HEADER = "x-mahoraga-forwarded-by";

type ChatPayload = { conversationId: string; turnId: string; message: string };
type ReceiptPayload = { executed: true; providerId: string; modelId: string; assistantContentId: string; timestamp: number };

const targetShaValid = (value: unknown): value is string => typeof value === "string" && SHA_PATTERN.test(value);
const json = (body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(JSON_HEADERS);
  if (headers !== undefined) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};
const pendingAssistantCapability = (provider = "cloudflare-native", reasonCode = "cloudflare-native-provider-pending") => ({ capability: "assistant.respond", routable: false, enabled: false, provider, workerIds: [] as string[], routingReason: "provider.gap", providerReasonCode: reasonCode, evidenceLevel: "runtime-probe" });
const projectPersistedAssistantCapability = (state: ProviderStateRecord | null, now = Date.now()) => {
  if (state === null) return pendingAssistantCapability();
  if (state.verifiedAt === null || state.canaryExpiresAt === null || state.canaryExpiresAt <= now) return pendingAssistantCapability(state.providerId, "provider-canary-stale");
  if (!state.available || !state.zeroCreditEligible) return pendingAssistantCapability(state.providerId, state.reasonCode ?? "provider-not-admitted");
  return { capability: "assistant.respond", routable: true, enabled: true, provider: state.providerId, workerIds: [] as string[], routingReason: null, providerReasonCode: null, evidenceLevel: "runtime-probe" };
};
const secureEqual = async (provided: string, expected: string): Promise<boolean> => {
  if (provided.length === 0 || expected.length === 0) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(provided)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const left = new Uint8Array(providedHash); const right = new Uint8Array(expectedHash); let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};
const railwayTarget = (requestUrl: URL, configured: string): URL => {
  const anchor = new URL(configured);
  if (anchor.protocol !== "https:" || anchor.hostname !== RAILWAY_ANCHOR_HOST || anchor.port || anchor.username || anchor.password || anchor.search || anchor.hash || anchor.pathname !== "/") throw new Error("railway-anchor-invalid");
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, anchor);
};
const proxyToRailway = async (request: Request, requestUrl: URL, env: Env): Promise<Response> => {
  try {
    if (request.headers.has(FORWARDED_BY_HEADER)) return json({ error: "Traffic routing loop rejected" }, 508);
    const target = railwayTarget(requestUrl, env.RAILWAY_ANCHOR_URL);
    const headers = new Headers(request.headers); headers.delete("x-bypass-token"); headers.delete("host"); headers.set(FORWARDED_BY_HEADER, TRAFFIC_AUTHORITY);
    const upstream = await fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }));
    const responseHeaders = new Headers(upstream.headers); responseHeaders.set("x-bypass-applied", "true"); responseHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch { return json({ error: "Railway bypass unavailable" }, 502); }
};
const parseChatPayload = (value: unknown): ChatPayload | null => {
  if (value === null || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.conversationId !== "string" || !candidate.conversationId.trim() || typeof candidate.turnId !== "string" || !candidate.turnId.trim() || typeof candidate.message !== "string" || !candidate.message.trim()) return null;
  return { conversationId: candidate.conversationId.trim(), turnId: candidate.turnId.trim(), message: candidate.message };
};
const extractAnswer = (value: unknown): string | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const response = (value as Record<string, unknown>).response;
  return typeof response === "string" && response.trim() ? response : null;
};

export class ExecutionDurableObject extends DurableObject<Env> {
  readonly storage: CloudflareDOSQLiteAdapter;
  private initialized = false;
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.storage = new CloudflareDOSQLiteAdapter(ctx); }
  private initialize(): void { if (!this.initialized) { this.storage.initSchema(); this.initialized = true; } }
  private async replay(receipt: StorageReceipt): Promise<Response> {
    const metadata = receipt.resultPayload as Partial<ReceiptPayload>;
    if (typeof metadata.assistantContentId !== "string") return json({ error: "Persisted receipt invalid" }, 500);
    const encrypted = this.storage.getContentRecord(metadata.assistantContentId);
    if (encrypted === null) return json({ error: "Persisted answer unavailable" }, 500);
    const answer = await decryptConversationContent(encrypted, this.env.CONTENT_VAULT_KEY);
    return json({ executed: true, answer, providerId: metadata.providerId, modelId: metadata.modelId, timestamp: metadata.timestamp }, 200, { "x-idempotent-replay": "true" });
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(this.env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/live") return request.method === "GET" ? json({ status: "live", sha: this.env.TARGET_SHA }) : json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
    if (url.pathname === "/api/ready") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try { this.initialize(); this.storage.sql.exec("SELECT 1").one(); return json({ status: "ready", sha: this.env.TARGET_SHA, durableState: DURABLE_STATE, trafficAuthority: TRAFFIC_AUTHORITY }); } catch { return json({ status: "unready" }, 503); }
    }
    if (url.pathname === "/api/capabilities") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try { this.initialize(); return json({ capabilities: [projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID))] }); } catch { return json({ capabilities: [pendingAssistantCapability(ASSISTANT_PROVIDER_ID, "provider-state-unavailable")] }); }
    }
    if (url.pathname !== "/api/execute") return json({ error: "Not Found" }, 404);
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { allow: "POST" });
    const actualSha = request.headers.get("x-target-sha");
    if (actualSha !== this.env.TARGET_SHA) return json({ error: "Precondition Failed: SHA mismatch", expected: this.env.TARGET_SHA, actual: actualSha }, 412);
    if (this.env.BYPASS_SECRET.length === 0 || this.env.CONTENT_VAULT_KEY.length === 0) return json({ error: "Execution environment invalid" }, 503);
    const bypassToken = request.headers.get("x-bypass-token") ?? "";
    if (await secureEqual(bypassToken, this.env.BYPASS_SECRET)) return proxyToRailway(request, url, this.env);
    this.initialize();
    const key = request.headers.get("x-idempotency-key")?.trim() ?? "";
    if (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return json({ error: "Idempotency key required" }, 400);
    const existing = this.storage.getIdempotentReceipt(key); if (existing !== null) return this.replay(existing);
    const holderId = crypto.randomUUID(); const leaseResource = `execution:${key}`;
    if (!this.storage.acquireLease(leaseResource, holderId, LEASE_TTL_MS)) return json({ error: "Conflict: Concurrent request in progress" }, 409);
    try {
      const racedReceipt = this.storage.getIdempotentReceipt(key); if (racedReceipt !== null) return this.replay(racedReceipt);
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "Content-Type must be application/json" }, 415);
      let raw: unknown; try { raw = await request.json(); } catch { return json({ error: "Invalid JSON payload" }, 400); }
      const payload = parseChatPayload(raw); if (payload === null) return json({ error: "Chat payload requires conversationId, turnId, and message" }, 400);

      // Admission is deliberately re-read immediately before inference. A stale or non-zero-credit canary fails closed.
      const providerState = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
      const capability = projectPersistedAssistantCapability(providerState);
      if (!capability.routable) return json({ error: "Cognition provider unavailable", reasonCode: capability.providerReasonCode }, 503);

      const providerResult = await this.env.AI.run(ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: payload.message }] });
      const answer = extractAnswer(providerResult);
      if (answer === null) return json({ error: "Cognition provider returned invalid response" }, 502);

      const now = Date.now(); const userContentId = crypto.randomUUID(); const assistantContentId = crypto.randomUUID();
      const [userContent, assistantContent] = await Promise.all([
        encryptConversationContent({ contentId: userContentId, conversationId: payload.conversationId, role: "user", plaintext: payload.message, createdAt: now }, this.env.CONTENT_VAULT_KEY),
        encryptConversationContent({ contentId: assistantContentId, conversationId: payload.conversationId, role: "assistant", plaintext: answer, createdAt: now }, this.env.CONTENT_VAULT_KEY),
      ]);
      const receiptPayload: ReceiptPayload = { executed: true, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID, assistantContentId, timestamp: now };
      const receipt: StorageReceipt = { id: crypto.randomUUID(), idempotencyKey: key, status: "SUCCESS", resultPayload: receiptPayload, createdAt: now };
      this.storage.executeTransaction(() => { this.storage.saveContentRecord(userContent); this.storage.saveContentRecord(assistantContent); this.storage.saveReceipt(receipt); });
      return json({ executed: true, answer, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID, timestamp: now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";
      return json({ error: message }, 502);
    } finally { this.storage.releaseLease(leaseResource, holderId); }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/execute" && request.method === "POST") {
      const actualSha = request.headers.get("x-target-sha"); if (actualSha !== env.TARGET_SHA) return json({ error: "Precondition Failed: SHA mismatch", expected: env.TARGET_SHA, actual: actualSha }, 412);
      if (env.BYPASS_SECRET.length === 0) return json({ error: "Execution environment invalid" }, 503);
      const bypassToken = request.headers.get("x-bypass-token") ?? ""; if (await secureEqual(bypassToken, env.BYPASS_SECRET)) return proxyToRailway(request, url, env);
    }
    return env.EXECUTION_DO.getByName("execution-v1").fetch(request);
  },
} satisfies ExportedHandler<Env>;

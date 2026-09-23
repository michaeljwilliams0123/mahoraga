import { DurableObject } from "cloudflare:workers";
import { encryptConversationContent, decryptConversationContent } from "./content-vault";
import { invokeWorkersAi } from "./provider-invoker";
import { CloudflareDOSQLiteAdapter, type ProviderStateRecord, type StorageReceipt } from "./storage";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const LEASE_TTL_MS = 300_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ASSISTANT_PROVIDER_ID = "cloudflare-workers-ai";
const ASSISTANT_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const ROUTING_HOP_ID = "cloudflare-execution-runtime";
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
    const headers = new Headers(request.headers); headers.delete("x-bypass-token"); headers.delete("host"); headers.set(FORWARDED_BY_HEADER, ROUTING_HOP_ID);
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
const digestText = async (value: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const boundedId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const objectValue = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeError = (error: unknown): string => error instanceof Error && /^content-vault-[a-z-]+$/.test(error.message) ? error.message : "cognition-provider-failed";

async function verifyGatewayAssertion(request: Request, body: string, secret: string): Promise<string | null> {
  const owner = request.headers.get("x-mahoraga-owner") ?? "";
  const timestamp = request.headers.get("x-mahoraga-owner-timestamp") ?? "";
  const nonce = request.headers.get("x-mahoraga-owner-nonce") ?? "";
  const signature = request.headers.get("x-mahoraga-owner-signature") ?? "";
  if (typeof secret !== "string" || secret.length < 32 || !owner || owner.length > 320 || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60_000 || !/^[a-f0-9-]{36}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const digest = await digestText(body);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${owner}\n${timestamp}\n${nonce}\n${digest}`)));
  const actual = Uint8Array.from(signature.match(/../g)!, (hex) => parseInt(hex, 16));
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected[i]! ^ actual[i]!;
  return difference === 0 ? owner : null;
}

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
  private async nativeBridge(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const owner = request.headers.get("x-mahoraga-verified-owner") ?? "";
    if (!owner) return json({ error: "owner-auth-required" }, 403);
    let input: Record<string, unknown> | null;
    try { input = objectValue(await request.json()); } catch { input = null; }
    const payload = objectValue(input?.payload);
    if (!payload) return json({ error: "cloud-action-not-allowed" }, 400);
    this.initialize();
    const ownerHash = await digestText(owner);
    if (input?.type === "chat") return this.nativeChat(payload, ownerHash);
    const conversationId = payload.conversationId;
    if (!boundedId(conversationId)) return json({ error: "conversation-id-invalid" }, 400);
    const conversation = this.storage.getConversation(conversationId);
    if (!conversation || conversation.ownerIdHash !== ownerHash) return json({ error: "conversation-unavailable" }, 404);
    const turns = this.storage.listTurns(conversationId);
    if (input?.type === "tasks") return json({ tasks: turns.map((turn) => ({ id: turn.id, conversationId, status: turn.status === "SUCCESS" ? "completed" : "waiting", capability: "assistant.respond", errorCode: null })) });
    if (input?.type === "messages") return json({ messages: turns.flatMap((turn) => turn.status === "SUCCESS" && turn.contentIdAssistant ? [
      { id: turn.contentIdUser, taskId: turn.id, role: "user", contentReference: turn.contentIdUser },
      { id: turn.contentIdAssistant, taskId: turn.id, role: "assistant", contentReference: turn.contentIdAssistant },
    ] : []) });
    if (input?.type === "message-content") {
      const contentId = payload.contentReference;
      if (!boundedId(contentId) || payload.messageId !== contentId || !turns.some((turn) => turn.contentIdAssistant === contentId || turn.contentIdUser === contentId)) return json({ error: "message-unavailable" }, 404);
      const record = this.storage.getContentRecord(contentId);
      if (!record || record.conversationId !== conversationId) return json({ error: "message-unavailable" }, 404);
      try { return json({ content: await decryptConversationContent(record, this.env.CONTENT_VAULT_KEY) }); }
      catch { return json({ error: "content-vault-decryption-failed" }, 503); }
    }
    return json({ error: "cloud-action-not-allowed" }, 400);
  }
  private async nativeChat(payload: Record<string, unknown>, ownerHash: string): Promise<Response> {
    const message = payload.content;
    const conversationId = payload.conversationId ?? crypto.randomUUID();
    const key = payload.idempotencyKey;
    if (!boundedId(conversationId) || !boundedId(key) || typeof message !== "string" || !message.trim() || message.length > 16_000 || (payload.attachmentIds !== undefined && (!Array.isArray(payload.attachmentIds) || payload.attachmentIds.length !== 0))) return json({ error: "chat-payload-invalid" }, 400);
    if (payload.creditPolicy === "licensed-approved") return json({ error: "licensed-provider-unavailable" }, 503);
    if (payload.creditPolicy !== "zero-codex" || (payload.mode !== undefined && payload.mode !== "ask" && payload.mode !== "auto")) return json({ error: "chat-policy-not-allowed" }, 400);
    const existingConversation = this.storage.getConversation(conversationId);
    if (existingConversation && existingConversation.ownerIdHash !== ownerHash) return json({ error: "conversation-unavailable" }, 404);
    const requestDigest = await digestText(`${ownerHash}\n${conversationId}\n${message}`);
    const turnId = await digestText(`${ownerHash}\n${key}`);
    const prior = this.storage.getTurn(turnId);
    if (prior && (prior.conversationId !== conversationId || prior.requestDigest !== requestDigest)) return json({ error: "idempotency-conflict" }, 409);
    if (prior?.status === "SUCCESS") return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" } });
    const capability = projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID));
    if (!capability.routable) return json({ error: "zero-credit-provider-unavailable", reasonCode: capability.providerReasonCode }, 503);
    const holder = crypto.randomUUID();
    if (!this.storage.acquireLease(`turn:${turnId}`, holder, LEASE_TTL_MS)) return json({ error: "concurrent-turn-in-progress" }, 409);
    try {
      const raced = this.storage.getTurn(turnId);
      if (raced?.status === "SUCCESS") return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" } });
      const state = projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID));
      if (!state.routable) return json({ error: "zero-credit-provider-unavailable", reasonCode: state.providerReasonCode }, 503);
      const result = await invokeWorkersAi(this.env.AI, ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: message }] });
      const answer = extractAnswer(result);
      if (!answer || answer.length > 32_000) return json({ error: "cognition-provider-response-invalid" }, 502);
      const now = Date.now(); const userId = crypto.randomUUID(); const assistantId = crypto.randomUUID();
      const [userContent, assistantContent] = await Promise.all([
        encryptConversationContent({ contentId: userId, conversationId, role: "user", plaintext: message, createdAt: now }, this.env.CONTENT_VAULT_KEY),
        encryptConversationContent({ contentId: assistantId, conversationId, role: "assistant", plaintext: answer, createdAt: now }, this.env.CONTENT_VAULT_KEY),
      ]);
      this.storage.executeTransaction(() => {
        this.storage.saveConversation({ id: conversationId, ownerIdHash: ownerHash, createdAt: existingConversation?.createdAt ?? now, updatedAt: now });
        this.storage.saveContentRecord(userContent); this.storage.saveContentRecord(assistantContent);
        this.storage.saveTurn({ id: turnId, conversationId, requestDigest, responseDigest: assistantContent.contentHash, providerId: ASSISTANT_PROVIDER_ID, costClass: "cloud-open-weight", creditPolicy: "zero-codex", status: "SUCCESS", contentIdUser: userId, contentIdAssistant: assistantId, createdAt: now, completedAt: now });
      });
      return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" } });
    } catch (error) { return json({ error: safeError(error) }, 502); }
    finally { this.storage.releaseLease(`turn:${turnId}`, holder); }
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(this.env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/native/bridge") return this.nativeBridge(request);
    if (url.pathname === "/api/live") return request.method === "GET" ? json({ status: "live", sha: this.env.TARGET_SHA }) : json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
    if (url.pathname === "/api/ready") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try { this.initialize(); this.storage.sql.exec("SELECT 1").one(); return json({ status: "ready", sha: this.env.TARGET_SHA, durableState: DURABLE_STATE }); } catch { return json({ status: "unready" }, 503); }
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

      const providerResult = this.env.AI !== undefined && typeof this.env.AI.run === "function"
        ? await this.env.AI.run(ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: payload.message }] })
        : await invokeWorkersAi(this.env.AI, ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: payload.message }] });
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
    if (url.pathname === "/api/native/bridge") {
      if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 32_768) return json({ error: "cloud-action-too-large" }, 413);
      const owner = await verifyGatewayAssertion(request, body, env.OWNER_GATEWAY_SECRET);
      if (!owner) return json({ error: "owner-auth-required" }, 403);
      return env.EXECUTION_DO.getByName("execution-v1").fetch(new Request(request, { body, headers: { "content-type": "application/json", "x-mahoraga-verified-owner": owner } }));
    }
    if (url.pathname === "/api/execute" && request.method === "POST") {
      const actualSha = request.headers.get("x-target-sha"); if (actualSha !== env.TARGET_SHA) return json({ error: "Precondition Failed: SHA mismatch", expected: env.TARGET_SHA, actual: actualSha }, 412);
      if (env.BYPASS_SECRET.length === 0) return json({ error: "Execution environment invalid" }, 503);
      const bypassToken = request.headers.get("x-bypass-token") ?? ""; if (await secureEqual(bypassToken, env.BYPASS_SECRET)) return proxyToRailway(request, url, env);
    }
    return env.EXECUTION_DO.getByName("execution-v1").fetch(request);
  },
} satisfies ExportedHandler<Env>;

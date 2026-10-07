import { DurableObject } from "cloudflare:workers";
import { encryptConversationContent, decryptConversationContent } from "./content-vault";
import { ASSISTANT_MODEL_ID, ASSISTANT_PROVIDER_ID, invokeZeroCreditProvider, providerGapReasonFromError, providerInputWithinLimit, providerMessagesWithinLimit, type ProviderMessage, type ProviderRuntimeContext, type ZeroCreditProviderConfig } from "./provider-invoker";
import { probeZeroCreditProvider, providerAdmissionDiagnostics, providerStateForGap, providerStateFromProbe } from "./provider-admission";
import { CloudflareDOSQLiteAdapter, type ProviderStateRecord, type StorageAdapter, type StorageReceipt } from "./storage";
// Canonical deterministic cognition is shared with the local cognitive worker.
// @ts-expect-error The canonical repository modules are JavaScript and intentionally remain runtime-neutral.
import { simulateCounterfactual } from "../../src/cognitive-world-model.mjs";
// @ts-expect-error The canonical repository modules are JavaScript and intentionally remain runtime-neutral.
import { runCognitiveLoop } from "../../src/cognitive-loop.mjs";
// @ts-expect-error The canonical repository modules are JavaScript and intentionally remain runtime-neutral.
import { createCognitiveIndividual } from "../../src/cognitive-individual.mjs";
import { parsePredictiveChatIntent } from "../../src/predictive-chat-intent";
import type { ConnectorBrokerBinding } from "./connector-capability-router";
import { collectUniversalCapabilityRoutes, type UniversalBrokerBinding } from "./universal-capability-router";
import { interactionNegotiationHoldReason, projectInteractionContext, projectInteractionRuntimeTruth, validateInteractionRuntimeTruth } from "./interaction-runtime";
import { InternalActivityLoop, readActivityState, summarizeRecentTurns, type ActivityState, type ActivityArtifact, type ActivityObservation } from "./internal-activity";
// @ts-expect-error Canonical runtime-neutral GitHub App client is shared with the Node control plane.
import { createMahoragaDirectMainCommitViaGithubApp, createMahoragaPullRequestViaGithubApp, mergeMahoragaPullRequestViaGithubApp, readMahoragaRepositoryViaGithubApp } from "../../src/github-native-client.mjs";
import { inspectGithubWorkspace } from "./github-workspace";
import { validateAnswerCompleteness } from "./response-completeness";
import { ingestExecutionMemory, pruneStaleMemories, searchMemoryIndex, type MemoryRecord } from "./memory-engine";
export { validateAnswerCompleteness } from "./response-completeness";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const LEASE_TTL_MS = 300_000;
const GATEWAY_ASSERTION_TTL_MS = 60_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_BILLING_ATTESTATION_BYTES = 8_192;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DURABLE_STATE = "cloudflare-do-sqlite";
const MAX_CONTEXT_TURNS = 6;
const TELEMETRY_HEARTBEAT_MS = 15_000;
const TELEMETRY_STREAM_MAX_AGE_MS = 45_000;
const INTERNAL_TELEMETRY_HEADER = "x-mahoraga-telemetry-authorized";

type ChatPayload = { conversationId: string; turnId: string; message: string };
type ReceiptPayload = { executed: true; providerId: string; modelId: string; assistantContentId: string; timestamp: number };

const targetShaValid = (value: unknown): value is string => typeof value === "string" && SHA_PATTERN.test(value);
const json = (body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response => {
  const responseHeaders = new Headers(JSON_HEADERS);
  if (headers !== undefined) new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};
const pendingAssistantCapability = (provider = "cloudflare-native", reasonCode = "cloudflare-native-provider-pending") => ({ capability: "assistant.respond", routable: false, enabled: false, provider, workerIds: [] as string[], routingReason: "provider.gap", providerReasonCode: reasonCode, evidenceLevel: "runtime-probe" });
const deterministicCapability = (capability: "cognitive.predict" | "cognitive.cycle") => ({ capability, routable: true, enabled: true, provider: "mahoraga-cognitive-core", workerIds: ["cognitive-core"], costClass: "deterministic", routingReason: null, providerReasonCode: null, evidenceLevel: "runtime-execution" });
const projectPersistedAssistantCapability = (state: ProviderStateRecord | null, now = Date.now()) => {
  if (state === null) return pendingAssistantCapability();
  if (state.verifiedAt === null || state.canaryExpiresAt === null || state.canaryExpiresAt <= now) return pendingAssistantCapability(state.providerId, "provider-canary-stale");
  if (!state.available || !state.zeroCreditEligible) return pendingAssistantCapability(state.providerId, state.reasonCode ?? "provider-not-admitted");
  return { capability: "assistant.respond", routable: true, enabled: true, provider: state.providerId, workerIds: [] as string[], routingReason: null, providerReasonCode: null, evidenceLevel: "runtime-probe" };
};
type RuntimeCapabilityProjection = {
  capability: string;
  routable: boolean;
  enabled: boolean;
  provider: string;
  workerIds: string[];
  costClass?: string;
  permissionClass?: string;
  routingReason: string | null;
  providerReasonCode: string | null;
  evidenceLevel: string;
};
export async function projectRuntimeCapabilities({ assistant, executionBroker, connectorBroker, now = Date.now() }: {
  assistant: ReturnType<typeof pendingAssistantCapability> | ReturnType<typeof projectPersistedAssistantCapability>;
  executionBroker?: UniversalBrokerBinding | undefined;
  connectorBroker?: ConnectorBrokerBinding | undefined;
  now?: number;
}): Promise<RuntimeCapabilityProjection[]> {
  const executionRoutes = await collectUniversalCapabilityRoutes(executionBroker, connectorBroker, now);
  return [assistant, deterministicCapability("cognitive.predict"), deterministicCapability("cognitive.cycle"), ...executionRoutes];
}
export function runtimeContextFromCapabilities(routes: RuntimeCapabilityProjection[]): ProviderRuntimeContext {
  const capabilities: Record<string, "routable" | "unavailable"> = {
    "assistant.respond": "unavailable", "codex.execute": "unavailable", "cognitive.predict": "unavailable",
    "cognitive.cycle": "unavailable", "cognitive.deliberate": "unavailable", "browser.execute": "unavailable",
    "image.generate": "unavailable", "memory.write": "unavailable", "repository.inspect": "unavailable",
  };
  for (const route of routes) capabilities[route.capability] = route.routable && route.enabled ? "routable" : "unavailable";
  return { capabilities, receipts: [], connectionState: "connected" };
}
const telemetryCorsHeaders = (origin: string, configuredOrigin: string): Record<string, string> => ({
  "access-control-allow-origin": origin === configuredOrigin ? origin : configuredOrigin,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "600",
  vary: "Origin",
});

const secureEqual = async (provided: string, expected: string): Promise<boolean> => {
  if (provided.length === 0 || expected.length === 0) return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(provided)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const left = new Uint8Array(providedHash); const right = new Uint8Array(expectedHash); let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};
const parseChatPayload = (value: unknown): ChatPayload | null => {
  if (value === null || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.conversationId !== "string" || !candidate.conversationId.trim() || typeof candidate.turnId !== "string" || !candidate.turnId.trim() || typeof candidate.message !== "string" || !candidate.message.trim() || !providerInputWithinLimit(candidate.message)) return null;
  return { conversationId: candidate.conversationId.trim(), turnId: candidate.turnId.trim(), message: candidate.message };
};
const extractAnswer = (value: unknown): string | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const response = (value as Record<string, unknown>).response;
  return typeof response === "string" && response.trim() ? response : null;
};
const digestText = async (value: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const boundedId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const acceptanceRunId = (request: Request): string | null => {
  const value = request.headers.get("x-mahoraga-acceptance-run") ?? "";
  return /^[a-z0-9-]{1,160}$/i.test(value) ? value : null;
};
const objectValue = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeError = (error: unknown): string => {
  if (!(error instanceof Error)) return "cognition-provider-failed";
  if (error.message === "cognition-provider-timeout" || /^content-vault-[a-z-]+$/.test(error.message)) return error.message;
  return "cognition-provider-failed";
};
const githubErrorCode = (error: unknown): string => {
  const code = objectValue(error)?.code;
  return typeof code === "string" && /^github-native-[a-z0-9-]+$/.test(code) ? code : "github-native-request-failed";
};
const errorStatus = (error: unknown): number => {
  const status = objectValue(error)?.status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
};
const cognitiveCapability = (providerId: string | null): string => providerId === "mahoraga-cognitive-predict" ? "cognitive.predict" : providerId === "mahoraga-cognitive-cycle" ? "cognitive.cycle" : "assistant.respond";

async function conversationMessages(storage: StorageAdapter, conversationId: string, message: string, vaultKey: string): Promise<ProviderMessage[]> {
  const current: ProviderMessage = { role: "user", content: message };
  const selected: ProviderMessage[] = [current];
  const completed = storage.listTurns(conversationId).filter((turn) => turn.status === "SUCCESS" && turn.providerId === ASSISTANT_PROVIDER_ID && turn.contentIdAssistant !== null).slice(-MAX_CONTEXT_TURNS);
  for (const turn of completed.reverse()) {
    const user = storage.getContentRecord(turn.contentIdUser);
    const assistant = storage.getContentRecord(turn.contentIdAssistant!);
    if (!user || !assistant || user.conversationId !== conversationId || assistant.conversationId !== conversationId || user.role !== "user" || assistant.role !== "assistant") throw new Error("content-vault-decryption-failed");
    const [userText, assistantText] = await Promise.all([decryptConversationContent(user, vaultKey), decryptConversationContent(assistant, vaultKey)]);
    const next: ProviderMessage[] = [{ role: "user", content: userText }, { role: "assistant", content: assistantText }, ...selected];
    if (!providerMessagesWithinLimit(next)) break;
    selected.splice(0, selected.length, ...next);
  }
  return selected;
}

async function verifyGatewayAssertion(request: Request, body: string, secret: string): Promise<{ owner: string; nonce: string } | null> {
  const owner = request.headers.get("x-mahoraga-owner") ?? "";
  const timestamp = request.headers.get("x-mahoraga-owner-timestamp") ?? "";
  const nonce = request.headers.get("x-mahoraga-owner-nonce") ?? "";
  const signature = request.headers.get("x-mahoraga-owner-signature") ?? "";
  if (typeof secret !== "string" || secret.length < 32 || !owner || owner.length > 320 || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > GATEWAY_ASSERTION_TTL_MS || !/^[a-f0-9-]{36}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const digest = await digestText(body);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${owner}\n${timestamp}\n${nonce}\n${digest}`)));
  const actual = Uint8Array.from(signature.match(/../g)!, (hex) => parseInt(hex, 16));
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected[i]! ^ actual[i]!;
  return difference === 0 ? { owner, nonce } : null;
}

const PROVIDER_REFRESH_REPLAY_WINDOW_MS = 30_000;

export class ExecutionDurableObject extends DurableObject<Env> {
  readonly storage: CloudflareDOSQLiteAdapter;
  private initialized = false;
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.storage = new CloudflareDOSQLiteAdapter(ctx); }
  private initialize(): void {
    if (!this.initialized) {
      this.storage.initSchema();
      this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS memory_index_outbox (
        id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL
      ); CREATE INDEX IF NOT EXISTS idx_memory_index_outbox_created ON memory_index_outbox(created_at);`);
      this.initialized = true;
    }
  }
  private queueMemory(record: MemoryRecord): void {
    this.storage.sql.exec("INSERT OR REPLACE INTO memory_index_outbox (id,payload,created_at) VALUES (?,?,?)", record.id, JSON.stringify(record), record.createdAt);
  }
  private async flushMemoryOutbox(limit = 16): Promise<number> {
    this.initialize();
    const rows = this.storage.sql.exec<{ id: string; payload: string }>("SELECT id,payload FROM memory_index_outbox ORDER BY created_at,id LIMIT ?", limit).toArray();
    for (const row of rows) {
      const record = JSON.parse(row.payload) as MemoryRecord;
      await ingestExecutionMemory(this.env, record);
      this.storage.sql.exec("DELETE FROM memory_index_outbox WHERE id = ?", row.id);
    }
    return this.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM memory_index_outbox").one().total;
  }
  async syncMemory(): Promise<{ pendingCount: number; synchronized: boolean }> {
    try { return { pendingCount: await this.flushMemoryOutbox(), synchronized: true }; }
    catch {
      const pendingCount = this.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM memory_index_outbox").one().total;
      console.error(JSON.stringify({ component: "mahoraga-execution-runtime", event: "memory-index-sync-held", pendingCount }));
      return { pendingCount, synchronized: false };
    }
  }
  async maintainMemory(): Promise<{ pendingCount: number; markedCount: number; prunedCount: number }> {
    const { pendingCount } = await this.syncMemory();
    const pruning = await pruneStaleMemories(this.env);
    return { pendingCount, markedCount: pruning.markedCount, prunedCount: pruning.prunedCount };
  }
  private activityLoop(): InternalActivityLoop {
    this.initialize();
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS internal_activity_state (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS internal_plan_candidates (fingerprint TEXT PRIMARY KEY, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_turns_activity_created ON turns(created_at);`);
    return new InternalActivityLoop({
      load: () => {
        const row = this.storage.sql.exec<{ payload: string }>("SELECT payload FROM internal_activity_state WHERE id = 1").toArray()[0];
        return row ? readActivityState(JSON.parse(row.payload)) : null;
      },
      save: (value: ActivityState) => { this.storage.sql.exec("INSERT OR REPLACE INTO internal_activity_state (id,payload) VALUES (1,?)", JSON.stringify(value)); },
      archive: (value: ActivityArtifact) => {
        this.storage.sql.exec("INSERT OR REPLACE INTO internal_plan_candidates (fingerprint,created_at,payload) VALUES (?,?,?)", value.fingerprint, value.createdAt, JSON.stringify(value));
        this.storage.sql.exec("DELETE FROM internal_plan_candidates WHERE fingerprint NOT IN (SELECT fingerprint FROM internal_plan_candidates ORDER BY created_at DESC LIMIT 64)");
      },
      transaction: <T>(fn: () => T) => this.ctx.storage.transactionSync(fn),
      getAlarm: () => this.ctx.storage.getAlarm(),
      setAlarm: async value => { await this.ctx.storage.setAlarm(value); },
      deleteAlarm: () => this.ctx.storage.deleteAlarm(),
    }, this.env.TARGET_SHA);
  }
  /** Called by the existing Worker's cron, never by a browser heartbeat. */
  async ensureInternalActivity(): Promise<void> {
    if (!targetShaValid(this.env.TARGET_SHA)) throw new Error("internal-source-invalid");
    await this.ctx.blockConcurrencyWhile(async () => { await this.activityLoop().ensureScheduled(); });
  }
  async alarm(): Promise<void> {
    if (!targetShaValid(this.env.TARGET_SHA)) throw new Error("internal-source-invalid");
    await this.ctx.blockConcurrencyWhile(async () => {
      const loop = this.activityLoop();
      if (!loop.store.load()) return;
      const rows = this.storage.sql.exec<{ id: string; status: string }>("SELECT id,status FROM turns ORDER BY created_at DESC,id DESC LIMIT 64").toArray();
      const provider = projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID));
      const observation: ActivityObservation = {
        ...summarizeRecentTurns(rows),
        providerReason: provider.providerReasonCode,
      };
      await loop.wake(observation);
    });
  }
  private activityStatus(): Record<string, unknown> {
    const state = this.activityLoop().store.load();
    if (!state || state.sourceSha !== this.env.TARGET_SHA) return { error: "internal-activity-unavailable" };
    return { ...state, observedAt: new Date().toISOString(), durableState: DURABLE_STATE, modelInvocations: 0 };
  }
  private providerConfig(): ZeroCreditProviderConfig { return { origin: this.env.ZERO_CREDIT_PROVIDER_URL, token: this.env.ZERO_CREDIT_PROVIDER_TOKEN, accountIdHash: this.env.ZERO_CREDIT_ACCOUNT_ID_HASH, targetSha: this.env.TARGET_SHA }; }
  private providerGapResponse(error: unknown): Response | null {
    const reasonCode = providerGapReasonFromError(error);
    if (reasonCode === null) return null;
    this.storage.saveProviderState(providerStateForGap(reasonCode));
    return json({ error: "zero-credit-provider-unavailable", reasonCode }, 503);
  }
  private refreshQueue: Promise<unknown> = Promise.resolve();
  /** Refreshes are serialized so cron, lazy, and manual callers cannot interleave probe and write. */
  private refreshProviderState(billingAttestation: string): Promise<Response> {
    const run = this.refreshQueue.then(() => this.refreshProviderStateSerialized(billingAttestation));
    this.refreshQueue = run.catch(() => undefined);
    return run;
  }
  private providerRefreshResponse(state: { providerId: string; available: boolean; zeroCreditEligible: boolean; reasonCode: string | null; verifiedAt: number | null; canaryExpiresAt: number | null }, extra: Record<string, string> = {}): Response {
    this.initialize();
    const record = this.storage.getProviderState(state.providerId);
    return json({ providerId: state.providerId, available: state.available, zeroCreditEligible: state.zeroCreditEligible, reasonCode: state.reasonCode, diagnostics: providerAdmissionDiagnostics(state.reasonCode), verifiedAt: state.verifiedAt, canaryExpiresAt: state.canaryExpiresAt, capability: projectPersistedAssistantCapability(record) }, state.zeroCreditEligible ? 200 : 503, extra);
  }
  private async refreshProviderStateSerialized(billingAttestation: string): Promise<Response> {
    this.initialize();
    const existing = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
    const startedAt = Date.now();
    if (existing?.zeroCreditEligible === true && existing.canaryExpiresAt !== null && existing.canaryExpiresAt > startedAt && startedAt - existing.observedAt < PROVIDER_REFRESH_REPLAY_WINDOW_MS) {
      console.log(JSON.stringify({ component: "mahoraga-execution-runtime", event: "provider-refresh-replayed" }));
      return this.providerRefreshResponse(existing, { "x-idempotent-replay": "true" });
    }
    const probe = await probeZeroCreditProvider(this.providerConfig(), billingAttestation);
    const state = providerStateFromProbe(probe);
    const current = this.storage.getProviderState(state.providerId);
    if (current?.zeroCreditEligible === true && current.verifiedAt !== null && state.verifiedAt !== null && current.verifiedAt > state.verifiedAt) {
      return this.providerRefreshResponse(current, { "x-idempotent-replay": "true" });
    }
    this.storage.saveProviderState(state);
    console.log(JSON.stringify({ component: "mahoraga-execution-runtime", event: state.zeroCreditEligible ? "provider-refresh-admitted" : "provider-refresh-held", reasonCode: state.reasonCode }));
    return this.providerRefreshResponse(state);
  }
  private async replay(receipt: StorageReceipt): Promise<Response> {
    const metadata = receipt.resultPayload as Partial<ReceiptPayload>;
    if (typeof metadata.assistantContentId !== "string") return json({ error: "Persisted receipt invalid" }, 500);
    const encrypted = this.storage.getContentRecord(metadata.assistantContentId);
    if (encrypted === null) return json({ error: "Persisted answer unavailable" }, 500);
    const answer = await decryptConversationContent(encrypted, this.env.CONTENT_VAULT_KEY);
    return json({ executed: true, answer, providerId: metadata.providerId, modelId: metadata.modelId, timestamp: metadata.timestamp, workerId: "execution-runtime-do", costClass: "cloud-open-weight", creditPolicy: "zero-codex" }, 200, { "x-idempotent-replay": "true", "x-mahoraga-worker-id": "execution-runtime-do", "x-mahoraga-cost-class": "zero-credit" });
  }
  private async nativeBridge(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    const owner = request.headers.get("x-mahoraga-verified-owner") ?? "";
    const nonce = request.headers.get("x-mahoraga-verified-nonce") ?? "";
    if (!owner || !/^[a-f0-9-]{36}$/.test(nonce)) return json({ error: "owner-auth-required" }, 403);
    this.initialize();
    const ownerHash = await digestText(owner);
    this.storage.sql.exec("DELETE FROM leases WHERE expires_at <= ?", Date.now());
    if (!this.storage.acquireLease(`gateway-assertion:${ownerHash}:${nonce}`, "consumed", GATEWAY_ASSERTION_TTL_MS)) return json({ error: "gateway-assertion-replayed" }, 409);
    let input: Record<string, unknown> | null;
    try { input = objectValue(await request.json()); } catch { input = null; }
    const payload = objectValue(input?.payload);
    if (!payload) return json({ error: "cloud-action-not-allowed" }, 400);
    if (input?.type === "internal-activity" || input?.type === "internal-activity-control") {
      if (Object.keys(input).sort().join(",") !== "payload,type") return json({ error: "internal-control-invalid" }, 400);
      if (input.type === "internal-activity-control") {
        if (Object.keys(payload).join(",") !== "enabled" || typeof payload.enabled !== "boolean") return json({ error: "internal-control-invalid" }, 400);
        await this.ctx.blockConcurrencyWhile(async () => { await this.activityLoop().control(payload.enabled as boolean); });
      } else if (Object.keys(payload).length) return json({ error: "internal-control-invalid" }, 400);
      const status = this.activityStatus();
      return json(status, status.error ? 503 : 200);
    }
    if (input?.type === "chat") return this.nativeChat(payload, ownerHash);
    if (input?.type === "interaction-truth") {
      if (Object.keys(payload).length !== 1 || typeof payload.interactionId !== "string" || !/^interaction-[a-f0-9]{32}$/.test(payload.interactionId)) return json({ error: "interaction-truth-request-invalid" }, 400);
      const truth = this.storage.getInteractionRuntimeTruth(payload.interactionId);
      if (truth === null) return json({ error: "interaction-truth-unavailable" }, 404);
      try { return json(validateInteractionRuntimeTruth(truth.payload)); } catch { return json({ error:"interaction-runtime-truth-invalid" }, 503); }
    }
    if (input?.type === "native-github-workspace") {
      try { return json(await inspectGithubWorkspace(payload, { env: this.env })); }
      catch (error) { return json({ error: githubErrorCode(error) }, errorStatus(error)); }
    }
    if (input?.type === "native-github-repository") {
      if (Object.keys(payload).length) return json({ error: "github-native-repository-request-invalid" }, 400);
      try { return json({ provider: "github-app", repository: await readMahoragaRepositoryViaGithubApp({}, { env: this.env }) }); }
      catch (error) { return json({ error: githubErrorCode(error) }, errorStatus(error)); }
    }
    if (input?.type === "native-github-pull-request") {
      try { return json(await createMahoragaPullRequestViaGithubApp(payload, { env: this.env })); }
      catch (error) { return json({ error: githubErrorCode(error) }, errorStatus(error)); }
    }
    if (input?.type === "native-github-merge") {
      try { return json(await mergeMahoragaPullRequestViaGithubApp(payload, { env: this.env })); }
      catch (error) { return json({ error: githubErrorCode(error) }, errorStatus(error)); }
    }
    if (input?.type === "native-github-main-write") {
      try { return json(await createMahoragaDirectMainCommitViaGithubApp(payload, { env: this.env })); }
      catch (error) { return json({ error: githubErrorCode(error) }, errorStatus(error)); }
    }
    if (input?.type === "memory-search") {
      if (typeof payload.query !== "string" || !payload.query.trim() || Object.keys(payload).some((key) => key !== "query" && key !== "topK")) return json({ error: "memory-search-invalid" }, 400);
      const topK = payload.topK === undefined ? 5 : payload.topK;
      if (!Number.isSafeInteger(topK) || (topK as number) < 1 || (topK as number) > 20) return json({ error: "memory-search-invalid" }, 400);
      try { return json({ memories: await searchMemoryIndex(this.env, payload.query, topK as number) }); }
      catch { return json({ error: "memory-search-unavailable" }, 503); }
    }
    if (input?.type === "execute") {
      const broker = this.env.MAHORAGA_EXECUTION_BROKER;
      const hasInteraction = Object.hasOwn(payload, "interactionEnvelope") || Object.hasOwn(payload, "negotiationReceipt") || Object.hasOwn(payload, "deliveryState");
      let brokerPayload: Record<string, unknown> = payload;
      let interactionEnvelope: unknown;
      let negotiationReceipt: unknown;
      let deliveryState: unknown;
      if (hasInteraction) {
        const requestPayload = objectValue(payload.request);
        if (!requestPayload || !Object.hasOwn(payload, "interactionEnvelope") || !Object.hasOwn(payload, "negotiationReceipt")) return json({ error: "interaction-runtime-input-invalid" }, 400);
        interactionEnvelope = payload.interactionEnvelope;
        negotiationReceipt = payload.negotiationReceipt;
        deliveryState = payload.deliveryState;
        try {
          const interactionContext = projectInteractionContext(interactionEnvelope, negotiationReceipt);
          brokerPayload = { request: { ...requestPayload, interactionContext }, payload: payload.payload };
        } catch (error) {
          const reason = interactionNegotiationHoldReason(error);
          if (reason !== null) return json({ error: "interaction-negotiation-hold", reason }, 409);
          if (error instanceof Error && error.message === "interaction-runtime-transport-unavailable") return json({ error: error.message }, 409);
          return json({ error: "interaction-runtime-input-invalid" }, 400);
        }
      }
      if (!broker || typeof broker.fetch !== "function") return json({ error: "execution-broker-unavailable" }, 503);
      const response = await broker.fetch(new Request("https://mahoraga-execution-broker/api/execute", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(brokerPayload) }));
      if (!hasInteraction) return new Response(response.body, { status: response.status, headers: response.headers });
      let result: Record<string, unknown> | null;
      try { result = objectValue(await response.json()); } catch { result = null; }
      if (result === null) return json({ error: "execution-broker-response-invalid" }, 502);
      if (!response.ok) return json(result, response.status);
      try {
        const truth = projectInteractionRuntimeTruth({ envelope:interactionEnvelope, negotiationReceipt, execution:result, ...(deliveryState === undefined ? {} : { deliveryState }) });
        this.storage.saveInteractionRuntimeTruth({ interactionId: truth.interactionTruth.interactionId, payload: truth as Record<string, unknown>, updatedAt: Date.parse(truth.interactionTruth.observedAt) });
        return json({ ...result, ...truth }, response.status);
      } catch { return json({ error: "interaction-runtime-truth-invalid" }, 502); }
    }
    const conversationId = payload.conversationId;
    if (!boundedId(conversationId)) return json({ error: "conversation-id-invalid" }, 400);
    const conversation = this.storage.getConversation(conversationId);
    if (!conversation || conversation.ownerIdHash !== ownerHash) return json({ error: "conversation-unavailable" }, 404);
    const turns = this.storage.listTurns(conversationId);
    if (input?.type === "tasks") return json({ tasks: turns.map((turn) => ({ id: turn.id, conversationId, status: turn.status === "SUCCESS" ? "completed" : "waiting", capability: cognitiveCapability(turn.providerId), errorCode: null, executionReceipt: { workerId: "execution-runtime-do", providerId: turn.providerId, costClass: turn.costClass, creditPolicy: turn.creditPolicy } })) });
    if (input?.type === "messages") return json({ messages: turns.flatMap((turn) => turn.status === "SUCCESS" && turn.contentIdAssistant ? [{ id: turn.contentIdUser, taskId: turn.id, role: "user", contentReference: turn.contentIdUser }, { id: turn.contentIdAssistant, taskId: turn.id, role: "assistant", contentReference: turn.contentIdAssistant }] : []) });
    if (input?.type === "message-content") {
      const contentId = payload.contentReference;
      if (!boundedId(contentId) || payload.messageId !== contentId || !turns.some((turn) => turn.contentIdAssistant === contentId || turn.contentIdUser === contentId)) return json({ error: "message-unavailable" }, 404);
      const record = this.storage.getContentRecord(contentId);
      if (!record || record.conversationId !== conversationId) return json({ error: "message-unavailable" }, 404);
      try { return json({ content: await decryptConversationContent(record, this.env.CONTENT_VAULT_KEY) }); } catch { return json({ error: "content-vault-decryption-failed" }, 503); }
    }
    return json({ error: "cloud-action-not-allowed" }, 400);
  }
  private async nativeChat(payload: Record<string, unknown>, ownerHash: string): Promise<Response> {
    const message = payload.content;
    const conversationId = payload.conversationId ?? crypto.randomUUID();
    const key = payload.idempotencyKey;
    if (!boundedId(conversationId) || !boundedId(key) || typeof message !== "string" || !message.trim() || !providerInputWithinLimit(message) || (payload.attachmentIds !== undefined && (!Array.isArray(payload.attachmentIds) || payload.attachmentIds.length !== 0))) return json({ error: "chat-payload-invalid" }, 400);
    if (/^\/(?:predict|cycle)(?:\s|$)/i.test(message.trim())) return this.nativeCognitiveChat(payload, ownerHash, conversationId, key, message);
    if (payload.creditPolicy === "licensed-approved") return json({ error: "licensed-provider-unavailable" }, 503);
    if (payload.creditPolicy !== "zero-codex" || (payload.mode !== undefined && payload.mode !== "ask" && payload.mode !== "auto")) return json({ error: "chat-policy-not-allowed" }, 400);
    const existingConversation = this.storage.getConversation(conversationId);
    if (existingConversation && existingConversation.ownerIdHash !== ownerHash) return json({ error: "conversation-unavailable" }, 404);
    const requestDigest = await digestText(`${ownerHash}\n${conversationId}\n${message}`);
    const turnId = await digestText(`${ownerHash}\n${key}`);
    const prior = this.storage.getTurn(turnId);
    if (prior && (prior.conversationId !== conversationId || prior.requestDigest !== requestDigest)) return json({ error: "idempotency-conflict" }, 409);
    if (prior?.status === "SUCCESS") return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" }, executionReceipt: { workerId: "execution-runtime-do", providerId: prior.providerId, costClass: prior.costClass, creditPolicy: prior.creditPolicy } });
    const capability = projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID));
    if (!capability.routable) return json({ error: "zero-credit-provider-unavailable", reasonCode: capability.providerReasonCode }, 503);
    const holder = crypto.randomUUID();
    if (!this.storage.acquireLease(`turn:${turnId}`, holder, LEASE_TTL_MS)) return json({ error: "concurrent-turn-in-progress" }, 409);
    try {
      const raced = this.storage.getTurn(turnId);
      if (raced?.status === "SUCCESS") return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" }, executionReceipt: { workerId: "execution-runtime-do", providerId: raced.providerId, costClass: raced.costClass, creditPolicy: raced.creditPolicy } });
      const state = projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID));
      if (!state.routable) return json({ error: "zero-credit-provider-unavailable", reasonCode: state.providerReasonCode }, 503);
      const messages = await conversationMessages(this.storage, conversationId, message, this.env.CONTENT_VAULT_KEY);
      const runtimeCapabilities = await projectRuntimeCapabilities({ assistant: state, executionBroker: this.env.MAHORAGA_EXECUTION_BROKER, connectorBroker: this.env.CONNECTOR_CAPABILITY_BROKER });
      const result = await invokeZeroCreditProvider(this.providerConfig(), ASSISTANT_MODEL_ID, { messages, runtimeContext: runtimeContextFromCapabilities(runtimeCapabilities) });
      const answer = extractAnswer(result);
      if (!answer || answer.length > 32_000) return json({ error: "cognition-provider-response-invalid" }, 502);
      const completeness = validateAnswerCompleteness(message, answer);
      if (!completeness.complete) return json({ error: "cognition-provider-response-incomplete", expectedScenarios: completeness.expected, missingScenarios: completeness.missing, retryable: true }, 502);
      const now = Date.now(); const userId = crypto.randomUUID(); const assistantId = crypto.randomUUID();
      const [userContent, assistantContent] = await Promise.all([encryptConversationContent({ contentId: userId, conversationId, role: "user", plaintext: message, createdAt: now }, this.env.CONTENT_VAULT_KEY), encryptConversationContent({ contentId: assistantId, conversationId, role: "assistant", plaintext: answer, createdAt: now }, this.env.CONTENT_VAULT_KEY)]);
      this.storage.executeTransaction(() => {
        this.storage.saveConversation({ id: conversationId, ownerIdHash: ownerHash, createdAt: existingConversation?.createdAt ?? now, updatedAt: now });
        this.storage.saveContentRecord(userContent); this.storage.saveContentRecord(assistantContent);
        this.storage.saveTurn({ id: turnId, conversationId, requestDigest, responseDigest: assistantContent.contentHash, providerId: ASSISTANT_PROVIDER_ID, costClass: "cloud-open-weight", creditPolicy: "zero-codex", status: "SUCCESS", contentIdUser: userId, contentIdAssistant: assistantId, createdAt: now, completedAt: now });
      });
      return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability: "assistant.respond" }, objective: null, decision: { mode: "ask", execution: "task" }, executionReceipt: { workerId: "execution-runtime-do", providerId: ASSISTANT_PROVIDER_ID, costClass: "cloud-open-weight", creditPolicy: "zero-codex" } });
    } catch (error) { return this.providerGapResponse(error) ?? json({ error: safeError(error) }, 502); }
    finally { this.storage.releaseLease(`turn:${turnId}`, holder); }
  }
  private async nativeCognitiveChat(payload: Record<string, unknown>, ownerHash: string, conversationId: string, key: string, message: string): Promise<Response> {
    if (payload.creditPolicy !== "zero-codex" || (payload.mode !== undefined && payload.mode !== "ask" && payload.mode !== "auto") || (payload.attachmentIds !== undefined && (!Array.isArray(payload.attachmentIds) || payload.attachmentIds.length !== 0))) return json({ error: "cognitive-policy-not-allowed" }, 400);
    const isPrediction = /^\/predict(?:\s|$)/i.test(message.trim());
    const capability = isPrediction ? "cognitive.predict" : "cognitive.cycle";
    let receipt: Record<string, unknown>;
    try {
      if (isPrediction) {
        const input = parsePredictiveChatIntent(message);
        if (!input) throw new TypeError("predictive-chat-input-invalid");
        receipt = simulateCounterfactual(input) as Record<string, unknown>;
      } else {
        const source = message.trim().replace(/^\/cycle\s*/i, "");
        if (!source || new TextEncoder().encode(source).byteLength > 24_000) throw new TypeError("cognitive-cycle-input-invalid");
        const input = objectValue(JSON.parse(source));
        if (!input) throw new TypeError("cognitive-cycle-input-invalid");
        const now = Date.now();
        if (!Array.isArray(input.members)) throw new TypeError("cognitive-cycle-input-invalid");
        const members = input.members.map((member) => { const value = objectValue(member); return value?.schemaVersion === 1 && value.kind === "cognitive-individual" ? value : createCognitiveIndividual(value, { observedAt: new Date(now).toISOString() }); });
        receipt = runCognitiveLoop({ ...input, members }, { now }) as Record<string, unknown>;
      }
    } catch { return json({ error: isPrediction ? "predictive-chat-input-invalid" : "cognitive-cycle-input-invalid" }, 400); }
    const answer = `${isPrediction ? "Predictive scenario receipt" : "Cognitive cycle receipt"}\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``;
    if (answer.length > 32_000) return json({ error: "cognitive-receipt-too-large" }, 413);
    const existingConversation = this.storage.getConversation(conversationId);
    if (existingConversation && existingConversation.ownerIdHash !== ownerHash) return json({ error: "conversation-unavailable" }, 404);
    const requestDigest = await digestText(`${ownerHash}\n${conversationId}\n${message}`);
    const turnId = await digestText(`${ownerHash}\n${key}`);
    const prior = this.storage.getTurn(turnId);
    if (prior && (prior.conversationId !== conversationId || prior.requestDigest !== requestDigest || cognitiveCapability(prior.providerId) !== capability)) return json({ error: "idempotency-conflict" }, 409);
    if (prior?.status === "SUCCESS") return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability }, objective: null, decision: { mode: "ask", execution: "task", capability }, executionReceipt: { workerId: "execution-runtime-do", providerId: prior.providerId, costClass: prior.costClass, creditPolicy: prior.creditPolicy } });
    const holder = crypto.randomUUID();
    if (!this.storage.acquireLease(`turn:${turnId}`, holder, LEASE_TTL_MS)) return json({ error: "concurrent-turn-in-progress" }, 409);
    try {
      const now = Date.now(); const userId = crypto.randomUUID(); const assistantId = crypto.randomUUID();
      const [userContent, assistantContent] = await Promise.all([encryptConversationContent({ contentId: userId, conversationId, role: "user", plaintext: message, createdAt: now }, this.env.CONTENT_VAULT_KEY), encryptConversationContent({ contentId: assistantId, conversationId, role: "assistant", plaintext: answer, createdAt: now }, this.env.CONTENT_VAULT_KEY)]);
      const receiptContent = JSON.stringify(receipt);
      const receiptFingerprint = await digestText(receiptContent);
      const memories: MemoryRecord[] = [{ id: turnId, fingerprint: receiptFingerprint, content: receiptContent, kind: isPrediction ? "counterfactual-transition" : "cognitive-cycle", utilityScore: isPrediction ? 0.5 : 0.7, createdAt: now }];
      const storedLesson = objectValue(receipt.storedLesson);
      if (!isPrediction && storedLesson) {
        const lessonContent = JSON.stringify(storedLesson);
        memories.push({ id: await digestText(`${turnId}:lesson`), fingerprint: await digestText(lessonContent), content: lessonContent, kind: "lesson", utilityScore: storedLesson.promotable === true ? 1 : 0.25, createdAt: now });
      }
      this.storage.executeTransaction(() => {
        this.storage.saveConversation({ id: conversationId, ownerIdHash: ownerHash, createdAt: existingConversation?.createdAt ?? now, updatedAt: now });
        this.storage.saveContentRecord(userContent); this.storage.saveContentRecord(assistantContent);
        this.storage.saveTurn({ id: turnId, conversationId, requestDigest, responseDigest: assistantContent.contentHash, providerId: isPrediction ? "mahoraga-cognitive-predict" : "mahoraga-cognitive-cycle", costClass: "deterministic", creditPolicy: "zero-codex", status: "SUCCESS", contentIdUser: userId, contentIdAssistant: assistantId, createdAt: now, completedAt: now });
        for (const memory of memories) this.queueMemory(memory);
      });
      let memoryState: "indexed" | "pending" = "indexed";
      try { memoryState = await this.flushMemoryOutbox() === 0 ? "indexed" : "pending"; } catch { memoryState = "pending"; }
      return json({ conversation: { id: conversationId }, task: { id: turnId, conversationId, status: "completed", capability }, objective: null, decision: { mode: "ask", execution: "task", capability }, executionReceipt: { workerId: "execution-runtime-do", providerId: isPrediction ? "mahoraga-cognitive-predict" : "mahoraga-cognitive-cycle", costClass: "deterministic", creditPolicy: "zero-codex", memoryState } });
    } finally { this.storage.releaseLease(`turn:${turnId}`, holder); }
  }
  private telemetryStream(request: Request): Response {
    if (request.headers.get(INTERNAL_TELEMETRY_HEADER) !== "1") return json({ error: "telemetry-auth-required" }, 403);
    this.initialize();
    const providerState = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
    const capability = projectPersistedAssistantCapability(providerState);
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | null = null;
    let expiry: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (expiry !== null) { clearTimeout(expiry); expiry = null; }
    };
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const write = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        write("sys_init", { status: "ONLINE", timestamp: Date.now(), targetSha: this.env.TARGET_SHA });
        write("telemetry_update", {
          schemaVersion: 1,
          observedAt: new Date().toISOString(),
          patch_sha: this.env.TARGET_SHA,
          component_target: null,
          line_changes: null,
          verification_status: capability.routable ? "RUNTIME_READY" : "RUNTIME_DEGRADED",
          live_cpu_usage_ms: null,
          live_memory_usage_mb: null,
          providerId: capability.provider,
          providerReasonCode: capability.providerReasonCode,
        });
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
            const latest = this.storage.sql.exec<{ id: string; provider_id: string; cost_class: string; completed_at: number | null }>("SELECT id,provider_id,cost_class,completed_at FROM turns WHERE status = 'SUCCESS' ORDER BY completed_at DESC,id DESC LIMIT 1").toArray()[0] ?? null;
            write("heartbeat", { status: "idle", activeTasks: 0, timestamp: Date.now(), workerId: "execution-runtime-do" });
            if (latest) write("execution_receipt", { turnId: latest.id, providerId: latest.provider_id, costClass: latest.cost_class, completedAt: latest.completed_at, workerId: "execution-runtime-do" });
          }
          catch { cleanup(); }
        }, TELEMETRY_HEARTBEAT_MS);
        expiry = setTimeout(() => {
          cleanup();
          try { controller.close(); } catch { /* client already disconnected */ }
        }, TELEMETRY_STREAM_MAX_AGE_MS);
      },
      cancel: cleanup,
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-mahoraga-worker-id": "execution-runtime-do",
        "x-mahoraga-cost-class": "zero-credit",
      },
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(this.env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/native/bridge") return this.nativeBridge(request);
    if (url.pathname === "/api/stream/telemetry") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      return this.telemetryStream(request);
    }
    if (url.pathname === "/api/live") return request.method === "GET" ? json({ status: "live", sha: this.env.TARGET_SHA }) : json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
    if (url.pathname === "/api/ready") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try { this.initialize(); this.storage.sql.exec("SELECT 1").one(); return json({ status: "ready", sha: this.env.TARGET_SHA, durableState: DURABLE_STATE }); } catch { return json({ status: "unready" }, 503); }
    }
    if (url.pathname === "/api/runtime/attestation") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      this.initialize();
      const providerState = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
      const capability = projectPersistedAssistantCapability(providerState);
      const admitted = capability.routable === true && capability.enabled === true && capability.provider === ASSISTANT_PROVIDER_ID;
      return json({ schemaVersion: 1, kind: "mahoraga-runtime-attestation", status: admitted ? "ready" : "degraded", targetSha: this.env.TARGET_SHA, runtime: "cloudflare-worker", durableState: DURABLE_STATE, trafficAuthority: "cloudflare", railwayRoutingEnabled: false, railwayInfluence: false, provider: { providerId: ASSISTANT_PROVIDER_ID, admitted, zeroCreditEligible: admitted, verifiedAt: providerState?.verifiedAt ?? null, canaryExpiresAt: providerState?.canaryExpiresAt ?? null } }, admitted ? 200 : 503);
    }
    if (url.pathname === "/api/provider/refresh") {
      if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { allow: "POST" });
      const provided = request.headers.get("x-provider-refresh-token") ?? "";
      if (!await secureEqual(provided, this.env.PROVIDER_REFRESH_SECRET)) return json({ error: "provider-refresh-auth-required" }, 403);
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "provider-refresh-attestation-invalid" }, 400);
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BILLING_ATTESTATION_BYTES) return json({ error: "provider-refresh-attestation-invalid" }, 400);
      let input: Record<string, unknown> | null; try { input = objectValue(JSON.parse(rawBody)); } catch { input = null; }
      const billingAttestation = input?.billingAttestation;
      if (typeof billingAttestation !== "string" || !billingAttestation.trim() || new TextEncoder().encode(billingAttestation).byteLength > MAX_BILLING_ATTESTATION_BYTES) return json({ error: "provider-refresh-attestation-invalid" }, 400);
      return this.refreshProviderState(billingAttestation);
    }
    if (url.pathname === "/api/capabilities") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { allow: "GET" });
      try { this.initialize(); return json({ capabilities: await projectRuntimeCapabilities({ assistant: projectPersistedAssistantCapability(this.storage.getProviderState(ASSISTANT_PROVIDER_ID)), executionBroker: this.env.MAHORAGA_EXECUTION_BROKER, connectorBroker: this.env.CONNECTOR_CAPABILITY_BROKER }) }); }
      catch { return json({ capabilities: [pendingAssistantCapability(ASSISTANT_PROVIDER_ID, "provider-state-unavailable")] }); }
    }
    if (url.pathname !== "/api/execute") return json({ error: "Not Found" }, 404);
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, { allow: "POST" });
    const actualSha = request.headers.get("x-target-sha");
    if (actualSha !== this.env.TARGET_SHA) return json({ error: "Precondition Failed: SHA mismatch", expected: this.env.TARGET_SHA, actual: actualSha }, 412);
    if (this.env.CONTENT_VAULT_KEY.length === 0) return json({ error: "Execution environment invalid" }, 503);
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
      const providerState = this.storage.getProviderState(ASSISTANT_PROVIDER_ID);
      const capability = projectPersistedAssistantCapability(providerState);
      if (!capability.routable) return json({ error: "Cognition provider unavailable", reasonCode: capability.providerReasonCode }, 503);
      const providerResult = await invokeZeroCreditProvider(this.providerConfig(), ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: payload.message }] });
      const answer = extractAnswer(providerResult);
      if (answer === null) return json({ error: "Cognition provider returned invalid response" }, 502);
      const now = Date.now(); const userContentId = crypto.randomUUID(); const assistantContentId = crypto.randomUUID();
      const [userContent, assistantContent] = await Promise.all([encryptConversationContent({ contentId: userContentId, conversationId: payload.conversationId, role: "user", plaintext: payload.message, createdAt: now }, this.env.CONTENT_VAULT_KEY), encryptConversationContent({ contentId: assistantContentId, conversationId: payload.conversationId, role: "assistant", plaintext: answer, createdAt: now }, this.env.CONTENT_VAULT_KEY)]);
      const receiptPayload: ReceiptPayload = { executed: true, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID, assistantContentId, timestamp: now };
      const receipt: StorageReceipt = { id: crypto.randomUUID(), idempotencyKey: key, status: "SUCCESS", resultPayload: receiptPayload, createdAt: now };
      this.storage.executeTransaction(() => { this.storage.saveContentRecord(userContent); this.storage.saveContentRecord(assistantContent); this.storage.saveReceipt(receipt); });
      return json({ executed: true, answer, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID, timestamp: now, workerId: "execution-runtime-do", costClass: "cloud-open-weight", creditPolicy: "zero-codex" }, 200, { "x-mahoraga-worker-id": "execution-runtime-do", "x-mahoraga-cost-class": "zero-credit" });
    } catch (error) {
      const providerGap = this.providerGapResponse(error); if (providerGap !== null) return providerGap;
      const message = error instanceof Error ? error.message : "Execution failed"; return json({ error: message }, 502);
    } finally { this.storage.releaseLease(leaseResource, holderId); }
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!targetShaValid(env.TARGET_SHA)) throw new Error("internal-source-invalid");
    const runtime = env.EXECUTION_DO.getByName("execution-v1");
    await runtime.ensureInternalActivity();
    if (controller.cron === "0 0 * * *") await runtime.maintainMemory();
    else await runtime.syncMemory();
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!targetShaValid(env.TARGET_SHA)) return json({ status: "unready", error: "target-sha-invalid" }, 503);
    if (url.pathname === "/api/stream/telemetry") {
      const origin = request.headers.get("origin") ?? "";
      const cors = telemetryCorsHeaders(origin, env.MAHORAGA_WORKSPACE_ORIGIN);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405, { ...cors, allow: "GET, OPTIONS" });
      if (!origin || origin !== env.MAHORAGA_WORKSPACE_ORIGIN) return json({ error: "telemetry-origin-required" }, 403, cors);
      const authorization = request.headers.get("authorization") ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (typeof env.TELEMETRY_STREAM_TOKEN !== "string" || env.TELEMETRY_STREAM_TOKEN.length < 32) return json({ error: "telemetry-session-unavailable" }, 503, cors);
      if (!await secureEqual(token, env.TELEMETRY_STREAM_TOKEN)) return json({ error: "telemetry-auth-required" }, 403, cors);
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      headers.set(INTERNAL_TELEMETRY_HEADER, "1");
      const response = await env.EXECUTION_DO.getByName("execution-v1").fetch(new Request(request, { headers }));
      const responseHeaders = new Headers(response.headers);
      new Headers(cors).forEach((value, key) => responseHeaders.set(key, value));
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }
    if (url.pathname === "/api/native/bridge") {
      if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 32_768) return json({ error: "cloud-action-too-large" }, 413);
      const assertion = await verifyGatewayAssertion(request, body, env.OWNER_GATEWAY_SECRET);
      if (!assertion) return json({ error: "owner-auth-required" }, 403);
      return env.EXECUTION_DO.getByName("execution-v1").fetch(new Request(request, { body, headers: { "content-type": "application/json", "x-mahoraga-verified-owner": assertion.owner, "x-mahoraga-verified-nonce": assertion.nonce } }));
    }
    if (url.pathname === "/api/execute" && request.method === "POST") {
      const actualSha = request.headers.get("x-target-sha"); if (actualSha !== env.TARGET_SHA) return json({ error: "Precondition Failed: SHA mismatch", expected: env.TARGET_SHA, actual: actualSha }, 412);
    }
    const acceptance = acceptanceRunId(request);
    return env.EXECUTION_DO.getByName(acceptance ? `acceptance-${acceptance}` : "execution-v1").fetch(request);
  },
} satisfies ExportedHandler<Env>;

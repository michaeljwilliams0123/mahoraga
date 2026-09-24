import { DurableObject } from "cloudflare:workers";

const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const PROVIDER_ID = "cloudflare-workers-ai";
const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const BILLING_BOUNDARY = "daily-free-allocation-budget";
const FREE_ALLOCATION_NEURONS = 10_000;
const DAILY_BUDGET_NEURONS = 9_000;
const INFER_RESERVATION_NEURONS = 128;
const PROBE_RESERVATION_NEURONS = 4;
const MAX_INPUT_BYTES = 8_000;
const MAX_OUTPUT_TOKENS = 256;
const PROBE_MAX_OUTPUT_TOKENS = 8;
const CANARY_TTL_MS = 75 * 60_000;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

type Message = { role: "user" | "assistant" | "system"; content: string };
type AiBinding = { run(model: string, input: { messages: Message[]; max_tokens?: number }): Promise<unknown> };
interface ZeroCreditInferenceEnv {
  AI: AiBinding;
  BUDGET_DO: DurableObjectNamespace;
  TARGET_SHA: string;
  ZERO_CREDIT_ACCOUNT_ID_HASH: string;
  ZERO_CREDIT_PROVIDER_TOKEN: string;
}

type BudgetReceipt = {
  allowed: boolean;
  utcDay: string;
  reservedNeurons: number;
  remainingNeurons: number;
  dailyBudgetNeurons: number;
};

const json = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const extractAnswer = (value: unknown): string | null => {
  const record = objectValue(value);
  const response = record?.response;
  return typeof response === "string" && response.trim() ? response : null;
};
const secureEqual = async (provided: string, expected: string): Promise<boolean> => {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(leftDigest); const right = new Uint8Array(rightDigest); let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};
const validEnv = (env: ZeroCreditInferenceEnv): boolean =>
  SHA_PATTERN.test(env.TARGET_SHA)
  && HASH_PATTERN.test(env.ZERO_CREDIT_ACCOUNT_ID_HASH)
  && typeof env.ZERO_CREDIT_PROVIDER_TOKEN === "string"
  && env.ZERO_CREDIT_PROVIDER_TOKEN.length >= 32;
const authorized = async (request: Request, env: ZeroCreditInferenceEnv): Promise<boolean> => {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && secureEqual(header.slice(7), env.ZERO_CREDIT_PROVIDER_TOKEN);
};
const proof = (env: ZeroCreditInferenceEnv, now: number, budget: BudgetReceipt) => ({
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  targetSha: env.TARGET_SHA,
  accountIdHash: env.ZERO_CREDIT_ACCOUNT_ID_HASH,
  billingBoundary: BILLING_BOUNDARY,
  freeAllocationNeurons: FREE_ALLOCATION_NEURONS,
  dailyBudgetNeurons: DAILY_BUDGET_NEURONS,
  reservedNeurons: budget.reservedNeurons,
  remainingBudgetNeurons: budget.remainingNeurons,
  available: true,
  observedAt: now,
  verifiedAt: now,
  canaryExpiresAt: now + CANARY_TTL_MS,
});
const parseMessages = (value: unknown): { messages: Message[]; inputBytes: number } | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return null;
  const encoder = new TextEncoder();
  let totalBytes = 0;
  const messages: Message[] = [];
  for (const item of value) {
    const record = objectValue(item);
    if (!record || (record.role !== "user" && record.role !== "assistant" && record.role !== "system") || typeof record.content !== "string" || !record.content.trim()) return null;
    totalBytes += encoder.encode(record.content).byteLength;
    if (totalBytes > MAX_INPUT_BYTES) return null;
    messages.push({ role: record.role, content: record.content });
  }
  return { messages, inputBytes: totalBytes };
};
const reserveBudget = async (env: ZeroCreditInferenceEnv, neurons: number): Promise<BudgetReceipt | null> => {
  const id = env.BUDGET_DO.idFromName("workers-ai-daily-free-allocation");
  const response = await env.BUDGET_DO.get(id).fetch("https://budget.internal/reserve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ neurons }),
  });
  if (!response.ok) return null;
  const body = objectValue(await response.json());
  if (!body || body.allowed !== true || typeof body.reservedNeurons !== "number" || typeof body.remainingNeurons !== "number" || typeof body.utcDay !== "string") return null;
  return {
    allowed: true,
    utcDay: body.utcDay,
    reservedNeurons: body.reservedNeurons,
    remainingNeurons: body.remainingNeurons,
    dailyBudgetNeurons: DAILY_BUDGET_NEURONS,
  };
};

export class ZeroCreditBudgetDO extends DurableObject<ZeroCreditInferenceEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/reserve") return json({ error: "Not Found" }, 404);
    let body: Record<string, unknown> | null;
    try { body = objectValue(await request.json()); } catch { body = null; }
    const neurons = body?.neurons;
    if (!Number.isInteger(neurons) || typeof neurons !== "number" || neurons < 1 || neurons > INFER_RESERVATION_NEURONS) {
      return json({ error: "budget-reservation-invalid" }, 400);
    }
    const utcDay = new Date().toISOString().slice(0, 10);
    const receipt = await this.ctx.storage.transaction(async (txn) => {
      const storedDay = await txn.get<string>("utcDay");
      const storedReserved = await txn.get<number>("reservedNeurons");
      const currentReserved = storedDay === utcDay && Number.isFinite(storedReserved) ? (storedReserved ?? 0) : 0;
      const nextReserved = currentReserved + neurons;
      if (nextReserved > DAILY_BUDGET_NEURONS) {
        return { allowed: false, utcDay, reservedNeurons: currentReserved, remainingNeurons: DAILY_BUDGET_NEURONS - currentReserved };
      }
      await txn.put("utcDay", utcDay);
      await txn.put("reservedNeurons", nextReserved);
      return { allowed: true, utcDay, reservedNeurons: nextReserved, remainingNeurons: DAILY_BUDGET_NEURONS - nextReserved };
    });
    return json({ ...receipt, dailyBudgetNeurons: DAILY_BUDGET_NEURONS }, receipt.allowed ? 200 : 429);
  }
}

export default {
  async fetch(request: Request, env: ZeroCreditInferenceEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!validEnv(env)) return json({ error: "provider-environment-invalid" }, 503);
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    if (!await authorized(request, env)) return json({ error: "provider-auth-required" }, 403);
    let body: Record<string, unknown> | null;
    try { body = objectValue(await request.json()); } catch { body = null; }
    if (!body || body.targetSha !== env.TARGET_SHA || body.model !== MODEL_ID) return json({ error: "provider-precondition-failed" }, 412);

    if (url.pathname === "/api/probe") {
      const budget = await reserveBudget(env, PROBE_RESERVATION_NEURONS);
      if (budget === null) return json({ error: "provider-free-budget-exhausted" }, 429);
      try {
        const result = await env.AI.run(MODEL_ID, { messages: [{ role: "user", content: "Reply exactly READY." }], max_tokens: PROBE_MAX_OUTPUT_TOKENS });
        if (extractAnswer(result) === null) return json({ error: "provider-canary-invalid" }, 502);
        const now = Date.now();
        return json(proof(env, now, budget));
      } catch {
        return json({ error: "zero-credit-provider-unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/infer") {
      const parsed = parseMessages(body.messages);
      if (parsed === null) return json({ error: "provider-input-invalid" }, 400);
      const budget = await reserveBudget(env, INFER_RESERVATION_NEURONS);
      if (budget === null) return json({ error: "provider-free-budget-exhausted" }, 429);
      try {
        const result = await env.AI.run(MODEL_ID, { messages: parsed.messages, max_tokens: MAX_OUTPUT_TOKENS });
        const answer = extractAnswer(result);
        if (answer === null || answer.length > 32_000) return json({ error: "provider-response-invalid" }, 502);
        const now = Date.now();
        return json({ ...proof(env, now, budget), answer });
      } catch {
        return json({ error: "zero-credit-provider-unavailable" }, 503);
      }
    }

    return json({ error: "Not Found" }, 404);
  },
} satisfies ExportedHandler<ZeroCreditInferenceEnv>;

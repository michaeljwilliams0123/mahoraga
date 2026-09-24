const JSON_HEADERS = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const PROVIDER_ID = "cloudflare-workers-ai";
const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const ACCOUNT_CLASS = "standalone-free";
const CANARY_TTL_MS = 75 * 60_000;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

type Message = { role: "user" | "assistant" | "system"; content: string };
type AiBinding = { run(model: string, input: { messages: Message[] }): Promise<unknown> };
interface ZeroCreditInferenceEnv {
  AI: AiBinding;
  TARGET_SHA: string;
  ZERO_CREDIT_ACCOUNT_ID_HASH: string;
  ZERO_CREDIT_PROVIDER_TOKEN: string;
}

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
const proof = (env: ZeroCreditInferenceEnv, now: number) => ({
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  targetSha: env.TARGET_SHA,
  accountIdHash: env.ZERO_CREDIT_ACCOUNT_ID_HASH,
  accountClass: ACCOUNT_CLASS,
  available: true,
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "verified-zero",
  zeroDollarStopGuaranteed: true,
  observedAt: now,
  verifiedAt: now,
  canaryExpiresAt: now + CANARY_TTL_MS,
});
const parseMessages = (value: unknown): Message[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return null;
  let total = 0;
  const messages: Message[] = [];
  for (const item of value) {
    const record = objectValue(item);
    if (!record || (record.role !== "user" && record.role !== "assistant" && record.role !== "system") || typeof record.content !== "string" || !record.content.trim()) return null;
    total += record.content.length;
    if (total > 20_000) return null;
    messages.push({ role: record.role, content: record.content });
  }
  return messages;
};

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
      try {
        const result = await env.AI.run(MODEL_ID, { messages: [{ role: "user", content: "Reply exactly READY." }] });
        if (extractAnswer(result) === null) return json({ error: "provider-canary-invalid" }, 502);
        const now = Date.now();
        return json(proof(env, now));
      } catch {
        return json({ error: "zero-credit-provider-unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/infer") {
      const messages = parseMessages(body.messages);
      if (messages === null) return json({ error: "provider-input-invalid" }, 400);
      try {
        const result = await env.AI.run(MODEL_ID, { messages });
        const answer = extractAnswer(result);
        if (answer === null || answer.length > 32_000) return json({ error: "provider-response-invalid" }, 502);
        const now = Date.now();
        return json({ ...proof(env, now), answer });
      } catch {
        return json({ error: "zero-credit-provider-unavailable" }, 503);
      }
    }

    return json({ error: "Not Found" }, 404);
  },
} satisfies ExportedHandler<ZeroCreditInferenceEnv>;

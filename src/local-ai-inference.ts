import { createHash } from "node:crypto";
import { parseStructuredOutput, validateStructuredSchema } from "./structured-output.ts";
import { normalizeEmbedding } from "./semantic-memory.ts";
import type { Embedding } from "./semantic-memory.ts";
// @ts-expect-error Existing governed JavaScript admission contract.
import { DEFAULT_MODEL_SUPPLY_CHAIN, evaluateRuntimeModelAdmission } from "./model-supply-chain.mjs";
// @ts-expect-error Existing governed JavaScript transient-channel contract.
import { isTransientChannelOpen, putTransientResult } from "./local-reasoner-channel.mjs";

type Options = { channel: unknown; modelSupplyChain?: unknown; fetchImpl?: typeof fetch; now?: () => Date; timeoutMs?: number; signal?: AbortSignal };
type Receipt = Readonly<{ status: "ok"; resultSha256: string; modelDigest: string; creditCost: 0; paidFallback: false }>;
const ROOT = "http://127.0.0.1:11434";

/** Explicit, transient local inference; this does not enable a provider or mint authority. */
export async function generateLocalStructuredOutput(input: { prompt: string; schema: unknown }, options: Options): Promise<{ value: unknown; receipt: Receipt }> {
  text(input.prompt);
  validateStructuredSchema(input.schema);
  const model = await admit(options);
  const body = await request("/api/generate", options, {
    model: model.name, prompt: input.prompt, format: input.schema, stream: false, options: { temperature: 0, num_predict: 2048 },
  });
  if (body.done !== true || typeof body.response !== "string") fail("local-ai-generation-invalid");
  const value = parseStructuredOutput(body.response, input.schema);
  return { value, receipt: receipt(value, model.digest, options) };
}

export async function generateLocalEmbeddings(input: { texts: readonly string[] }, options: Options): Promise<{ embeddings: readonly Embedding[]; receipt: Receipt }> {
  if (!Array.isArray(input.texts) || input.texts.length < 1 || input.texts.length > 32) fail("local-ai-input-invalid");
  input.texts.forEach(text);
  if (Buffer.byteLength(JSON.stringify(input.texts), "utf8") > 65_536) fail("local-ai-input-too-large");
  const model = await admit(options);
  const body = await request("/api/embed", options, { model: model.name, input: input.texts, truncate: false });
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== input.texts.length) fail("local-ai-embedding-invalid");
  const dimensions = Array.isArray(body.embeddings[0]) ? body.embeddings[0].length : 0;
  if (dimensions < 1 || dimensions > 4096) fail("local-ai-embedding-invalid");
  const embeddings = Object.freeze(body.embeddings.map(vector => Object.freeze({ modelDigest: model.digest, vector: normalizeEmbedding(vector, dimensions) })));
  return { embeddings, receipt: receipt(embeddings, model.digest, options) };
}

async function admit(options: Options): Promise<{ name: string; digest: string }> {
  channel(options);
  const body = await request("/api/tags", options);
  if (!Array.isArray(body.models) || body.models.length > 1000) fail("local-ai-catalog-invalid");
  let reason = "model-supply-chain-unadmitted";
  for (const raw of body.models) {
    if (!raw || typeof raw !== "object") continue;
    const model = raw as Record<string, unknown>;
    const decision = evaluateRuntimeModelAdmission({ provider: "ollama", digest: model.digest, sizeBytes: model.size }, options.modelSupplyChain ?? DEFAULT_MODEL_SUPPLY_CHAIN, { now: clock(options) });
    if (!decision.admitted) { reason = decision.reason; continue; }
    if (typeof model.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model.name)) fail("local-ai-model-invalid");
    if (model.remote_host || model.remote_model || /cloud|openai|anthropic|groq|gemini|together|openrouter/i.test(model.name)) fail("local-ai-remote-model-forbidden");
    return { name: model.name, digest: String(model.digest).replace(/^sha256:/, "") };
  }
  fail(reason);
}

async function request(route: "/api/tags" | "/api/generate" | "/api/embed", options: Options, payload?: unknown): Promise<Record<string, unknown>> {
  channel(options);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) fail("local-ai-timeout-invalid");
  const controller = new AbortController();
  let cancelReject: ((error: Error) => void) | undefined;
  const abort = () => { controller.abort(); cancelReject?.(new Error("local-ai-cancelled")); };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (controller.signal.aborted) fail("local-ai-cancelled");
        const response = await (options.fetchImpl ?? fetch)(`${ROOT}${route}`, {
          method: payload === undefined ? "GET" : "POST", headers: { "content-type": "application/json", accept: "application/json" },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), redirect: "error", signal: controller.signal,
        });
        if (!response.ok) fail("local-ai-http-failure");
        const bytes = await boundedBody(response, 262_144);
        let body: unknown;
        try { body = JSON.parse(bytes); } catch { fail("local-ai-response-invalid"); }
        if (!body || typeof body !== "object" || Array.isArray(body)) fail("local-ai-response-invalid");
        channel(options);
        return body as Record<string, unknown>;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("local-ai-timeout")); }, timeoutMs); }),
      new Promise<never>((_, reject) => { cancelReject = reject; if (options.signal?.aborted) abort(); }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
  }
}

async function boundedBody(response: Response, maximum: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > maximum) fail("local-ai-response-too-large");
  if (!response.body) fail("local-ai-response-invalid");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maximum) fail("local-ai-response-too-large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
function receipt(value: unknown, modelDigest: string, options: Options): Receipt {
  channel(options);
  const resultSha256 = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  putTransientResult(options.channel, { status: "ok", resultSha256 }, { now: clock(options).getTime() });
  return Object.freeze({ status: "ok", resultSha256, modelDigest, creditCost: 0, paidFallback: false });
}
function channel(options: Options): void {
  if (!options || !isTransientChannelOpen(options.channel, clock(options).getTime())) fail("transient-result-channel-required");
  if (options.signal?.aborted) fail("local-ai-cancelled");
}
function clock(options: Options): Date { const date = (options.now ?? (() => new Date()))(); if (!(date instanceof Date) || !Number.isFinite(date.getTime())) fail("local-ai-clock-invalid"); return date; }
function text(value: string): void { if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > 16_384 || value.includes("\0")) fail("local-ai-input-invalid"); }
function fail(code: string): never { throw new TypeError(code); }

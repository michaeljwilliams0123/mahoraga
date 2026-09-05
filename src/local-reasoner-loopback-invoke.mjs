import crypto from "node:crypto";

const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const LM_STUDIO_MODELS_URL = "http://127.0.0.1:1234/v1/models";
const LM_STUDIO_CHAT_URL = "http://127.0.0.1:1234/v1/chat/completions";
const CLOUD_NAME = /cloud|openai|anthropic|groq|gemini|together|openrouter/i;
const METHOD_INSTRUCTION_PREFIX = "method:credit-free-protocol digest:";

export const LOOPBACK_INVOKE_KIND = "loopback-generate-invoke";

export function createLoopbackGenerateInvoke({
  probe = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 1500,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10_000) {
    fail("loopback-timeout-invalid");
  }
  return async function invoke({ worldDigest } = {}) {
    assertDigest(worldDigest);
    if (probe?.cloudTagged === true) return frozen("refused", "ollama-cloud-not-credit-free", worldDigest);
    if (probe?.verified !== true) return frozen("hold", "local-reasoner-not-ready", worldDigest);
    if (typeof fetchImpl !== "function") return frozen("hold", "loopback-fetch-unavailable", worldDigest);

    const endpoint = selectEndpoint(probe);
    if (!endpoint) return frozen("hold", "loopback-endpoint-unavailable", worldDigest);

    try {
      const model = await resolveEphemeralModel({ endpoint, fetchImpl, timeoutMs });
      if (model.cloudTagged) return frozen("refused", "ollama-cloud-not-credit-free", worldDigest);
      const raw = await postGenerate({
        endpoint,
        modelName: model.name,
        worldDigest,
        fetchImpl,
        timeoutMs,
      });
      return frozen("ok", "loopback-generate-verified", sha256(raw));
    } catch (error) {
      if (error?.code === "ollama-cloud-not-credit-free") {
        return frozen("refused", "ollama-cloud-not-credit-free", worldDigest);
      }
      if (error?.code === "loopback-timeout") {
        return frozen("hold", "loopback-generate-timeout", worldDigest);
      }
      return frozen("hold", "loopback-generate-unavailable", worldDigest);
    }
  };
}

export function loopbackGenerateUrls() {
  return Object.freeze({
    ollamaTags: OLLAMA_TAGS_URL,
    ollamaGenerate: OLLAMA_GENERATE_URL,
    lmStudioModels: LM_STUDIO_MODELS_URL,
    lmStudioChat: LM_STUDIO_CHAT_URL,
  });
}

function selectEndpoint(probe) {
  const ollama = probe?.providerHealth?.ollama;
  const lmStudio = probe?.providerHealth?.lmStudio;
  if (ollama?.availability === "healthy") {
    return Object.freeze({ id: "ollama", catalog: OLLAMA_TAGS_URL, generate: OLLAMA_GENERATE_URL });
  }
  if (lmStudio?.availability === "healthy") {
    return Object.freeze({ id: "lm-studio", catalog: LM_STUDIO_MODELS_URL, generate: LM_STUDIO_CHAT_URL });
  }
  if (probe?.verified === true) {
    return Object.freeze({ id: "ollama", catalog: OLLAMA_TAGS_URL, generate: OLLAMA_GENERATE_URL });
  }
  return null;
}

async function resolveEphemeralModel({ endpoint, fetchImpl, timeoutMs }) {
  const body = await getJson(endpoint.catalog, fetchImpl, timeoutMs);
  const names = endpoint.id === "lm-studio"
    ? namesFrom(body?.data, "id")
    : namesFrom(body?.models, "name");
  if (names.length === 0) fail("loopback-model-missing");
  const name = names[0];
  if (CLOUD_NAME.test(name)) fail("ollama-cloud-not-credit-free");
  return { name, cloudTagged: false };
}

async function postGenerate({ endpoint, modelName, worldDigest, fetchImpl, timeoutMs }) {
  assertLoopback(endpoint.generate);
  const instruction = `${METHOD_INSTRUCTION_PREFIX}${worldDigest}`;
  const payload = endpoint.id === "lm-studio"
    ? {
      model: modelName,
      messages: [{ role: "user", content: instruction }],
      max_tokens: 8,
      stream: false,
    }
    : {
      model: modelName,
      prompt: instruction,
      stream: false,
      options: { num_predict: 8 },
    };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint.generate, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) fail("loopback-generate-http");
    const buffer = await readBytes(response);
    if (!buffer || buffer.byteLength < 1) fail("loopback-generate-empty");
    return new Uint8Array(buffer);
  } catch (error) {
    if (error?.name === "AbortError") fail("loopback-timeout");
    if (error?.code) throw error;
    fail("loopback-generate-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, fetchImpl, timeoutMs) {
  assertLoopback(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) fail("loopback-catalog-http");
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") fail("loopback-timeout");
    if (error?.code) throw error;
    fail("loopback-catalog-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function readBytes(response) {
  if (typeof response.arrayBuffer === "function") return response.arrayBuffer();
  if (typeof response.text === "function") {
    const text = await response.text();
    return new TextEncoder().encode(text);
  }
  fail("loopback-generate-empty");
}

function namesFrom(list, key) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (item && typeof item === "object" ? item[key] : null))
    .filter((name) => typeof name === "string" && name.length > 0 && name.length <= 128)
    .slice(0, 8);
}

function assertLoopback(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("loopback-url-invalid");
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") fail("loopback-url-invalid");
}

function frozen(status, reason, resultSha256) {
  return Object.freeze({
    status,
    reason,
    resultSha256,
    creditCost: 0,
    paidFallback: false,
  });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertDigest(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("generation-digest-invalid");
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

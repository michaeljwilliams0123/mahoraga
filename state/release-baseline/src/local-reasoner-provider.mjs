const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const LM_STUDIO_MODELS_URL = "http://127.0.0.1:1234/v1/models";

export const LOCAL_REASONER_ENDPOINTS = Object.freeze({
  ollama: OLLAMA_TAGS_URL,
  lmStudio: LM_STUDIO_MODELS_URL,
});

export async function probeLocalReasoner({ fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  if (typeof fetchImpl !== "function") return unavailableAggregate("fetch-unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000) throw new TypeError("local-reasoner-timeout-invalid");

  const [ollama, lmStudio] = await Promise.all([
    probeEndpoint({
      url: OLLAMA_TAGS_URL,
      fetchImpl,
      timeoutMs,
      count: (body) => (Array.isArray(body?.models) ? body.models.length : 0),
    }),
    probeEndpoint({
      url: LM_STUDIO_MODELS_URL,
      fetchImpl,
      timeoutMs,
      count: (body) => (Array.isArray(body?.data) ? body.data.length : 0),
    }),
  ]);

  const modelCount = Math.min(ollama.modelCount + lmStudio.modelCount, 1000);
  const verified = ollama.verified || lmStudio.verified;
  const seen = ollama.availability !== "unavailable" || lmStudio.availability !== "unavailable";
  const availability = verified ? "healthy" : seen ? "configured" : "unavailable";
  const errorCode = verified ? null : firstError([ollama, lmStudio]);

  return {
    verified,
    summary: summarize(verified, ollama, lmStudio, modelCount),
    providerHealth: {
      availability,
      endpointClass: "localhost",
      authentication: "not-required-loopback",
      modelCount,
      ollama: sanitizeEndpoint(ollama),
      lmStudio: sanitizeEndpoint(lmStudio),
      executionEnabled: false,
      responseContentPersisted: false,
      ...(errorCode ? { errorCode } : {}),
    },
  };
}

export async function observeLocalReasonerReady(options = {}) {
  const probe = await probeLocalReasoner(options);
  return probe.verified === true;
}

export function localReasonerLoopbackEndpoints() {
  return Object.freeze([
    Object.freeze({ id: "ollama", url: OLLAMA_TAGS_URL }),
    Object.freeze({ id: "lm-studio", url: LM_STUDIO_MODELS_URL }),
  ]);
}

export function localReasonerExecutionBoundary() {
  return Object.freeze({
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
}

async function probeEndpoint({ url, fetchImpl, timeoutMs, count }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) {
      return endpoint(false, 0, "unavailable", `http-${boundedStatus(response?.status)}`);
    }
    let body;
    try { body = await response.json(); }
    catch { return endpoint(false, 0, "unavailable", "invalid-json"); }
    const modelCount = Math.min(Math.max(0, Number(count(body)) || 0), 1000);
    return endpoint(modelCount > 0, modelCount, modelCount > 0 ? "healthy" : "configured", null);
  } catch (error) {
    if (error?.name === "AbortError") return endpoint(false, 0, "unavailable", "timeout");
    return endpoint(false, 0, "unavailable", "connection-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function endpoint(verified, modelCount, availability, errorCode) {
  return { verified, modelCount, availability, errorCode };
}

function sanitizeEndpoint(value) {
  return Object.freeze({
    availability: value.availability,
    modelCount: value.modelCount,
    errorCode: value.errorCode,
  });
}

function summarize(verified, ollama, lmStudio, modelCount) {
  if (verified) {
    return `Loopback local reasoner is responsive (${modelCount} loaded model(s) across Ollama/LM Studio); reasoning execution remains disabled until a transient result channel is available.`;
  }
  if (ollama.availability === "configured" || lmStudio.availability === "configured") {
    return "Loopback local reasoner responded but reported no loaded models.";
  }
  return "Ollama and LM Studio loopback providers are not ready for local reasoning.";
}

function firstError(endpoints) {
  const codes = endpoints.map((item) => item.errorCode).filter(Boolean);
  if (codes.length === 0) return "no-loaded-models";
  if (codes.every((code) => code === codes[0])) return codes[0];
  return "connection-unavailable";
}

function unavailableAggregate(errorCode) {
  return {
    verified: false,
    summary: "Ollama and LM Studio loopback providers are not ready for local reasoning.",
    providerHealth: {
      availability: "unavailable",
      endpointClass: "localhost",
      authentication: "not-required-loopback",
      modelCount: 0,
      ollama: { availability: "unavailable", modelCount: 0, errorCode },
      lmStudio: { availability: "unavailable", modelCount: 0, errorCode },
      executionEnabled: false,
      responseContentPersisted: false,
      errorCode,
    },
  };
}

function boundedStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : "unknown";
}

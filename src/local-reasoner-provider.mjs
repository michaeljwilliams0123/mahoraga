import { DEFAULT_MODEL_SUPPLY_CHAIN, evaluateRuntimeModelAdmission } from "./model-supply-chain.mjs";

const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const LM_STUDIO_MODELS_URL = "http://127.0.0.1:1234/v1/models";

export const LOCAL_REASONER_ENDPOINTS = Object.freeze({
  ollama: OLLAMA_TAGS_URL,
  lmStudio: LM_STUDIO_MODELS_URL,
});

export async function probeLocalReasoner({ fetchImpl = globalThis.fetch, timeoutMs = 3000, modelSupplyChain = DEFAULT_MODEL_SUPPLY_CHAIN } = {}) {
  if (typeof fetchImpl !== "function") return unavailableAggregate("fetch-unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000) throw new TypeError("local-reasoner-timeout-invalid");

  const [ollama, lmStudio] = await Promise.all([
    probeEndpoint({
      url: OLLAMA_TAGS_URL,
      fetchImpl,
      timeoutMs,
      inspect: (body) => inspectModels(body?.models, "ollama", modelSupplyChain),
    }),
    probeEndpoint({
      url: LM_STUDIO_MODELS_URL,
      fetchImpl,
      timeoutMs,
      inspect: (body) => inspectModels(body?.data, "lm-studio", modelSupplyChain),
    }),
  ]);

  const modelCount = Math.min(ollama.modelCount + lmStudio.modelCount, 1000);
  const admittedModelCount = Math.min(ollama.admittedModelCount + lmStudio.admittedModelCount, 1000);
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
      admittedModelCount,
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

async function probeEndpoint({ url, fetchImpl, timeoutMs, inspect }) {
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
      return endpoint(false, 0, "unavailable", `http-${boundedStatus(response?.status)}`, 0);
    }
    let body;
    try { body = await response.json(); }
    catch { return endpoint(false, 0, "unavailable", "invalid-json", 0); }
    const observation = inspect(body);
    const modelCount = observation.modelCount;
    return endpoint(observation.admittedModelCount > 0, modelCount, observation.admittedModelCount > 0 ? "healthy" : "configured", observation.errorCode, observation.admittedModelCount);
  } catch (error) {
    if (error?.name === "AbortError") return endpoint(false, 0, "unavailable", "timeout", 0);
    return endpoint(false, 0, "unavailable", "connection-unavailable", 0);
  } finally {
    clearTimeout(timer);
  }
}

function inspectModels(value, provider, modelSupplyChain) {
  const models = Array.isArray(value) ? value.slice(0, 1000) : [];
  const decisions = models.map((model) => evaluateRuntimeModelAdmission({
    provider,
    digest: model?.digest,
    sizeBytes: model?.size,
  }, modelSupplyChain));
  const admittedModelCount = decisions.filter((decision) => decision.admitted).length;
  const errorCode = models.length === 0
    ? null
    : decisions.find((decision) => decision.reason === "model-supply-chain-digest-missing")?.reason
      ?? decisions[0]?.reason
      ?? "model-supply-chain-unadmitted";
  return { modelCount: models.length, admittedModelCount, errorCode: admittedModelCount > 0 ? null : errorCode };
}

function endpoint(verified, modelCount, availability, errorCode, admittedModelCount) {
  return { verified, modelCount, admittedModelCount, availability, errorCode };
}

function sanitizeEndpoint(value) {
  return Object.freeze({
    availability: value.availability,
    modelCount: value.modelCount,
    admittedModelCount: value.admittedModelCount,
    errorCode: value.errorCode,
  });
}

function summarize(verified, ollama, lmStudio, modelCount) {
  if (verified) {
    return `Loopback local reasoner is responsive (${modelCount} loaded model(s) across Ollama/LM Studio, including an admitted immutable artifact); reasoning execution remains disabled until a transient result channel is available.`;
  }
  if (ollama.availability === "configured" || lmStudio.availability === "configured") {
    return modelCount > 0
      ? "Loopback local reasoner responded but reported no admitted models."
      : "Loopback local reasoner responded but reported no loaded models.";
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
      admittedModelCount: 0,
      ollama: { availability: "unavailable", modelCount: 0, admittedModelCount: 0, errorCode },
      lmStudio: { availability: "unavailable", modelCount: 0, admittedModelCount: 0, errorCode },
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

const LOOPBACK_ENDPOINTS = Object.freeze([
  Object.freeze({ id: "ollama", url: "http://127.0.0.1:11434/api/tags", parser: "ollama-tags" }),
  Object.freeze({ id: "lm-studio", url: "http://127.0.0.1:1234/v1/models", parser: "openai-models" }),
]);

export async function probeLocalReasoner({ fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  if (typeof fetchImpl !== "function") return unavailable("fetch-unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000) throw new TypeError("local-reasoner-timeout-invalid");

  const probes = await Promise.all(LOOPBACK_ENDPOINTS.map((endpoint) => probeEndpoint(endpoint, fetchImpl, timeoutMs)));
  const modelCount = Math.min(probes.reduce((total, probe) => total + probe.modelCount, 0), 1000);
  const live = probes.filter((probe) => probe.verified).map((probe) => probe.id);
  const verified = live.length > 0;
  const availability = verified
    ? "healthy"
    : probes.some((probe) => probe.availability === "configured")
      ? "configured"
      : "unavailable";
  const errorCode = verified ? undefined : firstError(probes);
  return {
    verified,
    summary: verified
      ? `Loopback local reasoner is responsive (${live.join(", ")}) with ${modelCount} loaded model(s); reasoning execution remains disabled until a transient result channel is available.`
      : "No loopback local reasoner (Ollama or LM Studio) is ready for local reasoning.",
    providerHealth: {
      availability,
      endpointClass: "localhost",
      authentication: "not-required-loopback",
      modelCount,
      backends: Object.freeze(probes.map((probe) => Object.freeze({
        id: probe.id,
        availability: probe.availability,
        modelCount: probe.modelCount,
        verified: probe.verified,
      }))),
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

export function localReasonerExecutionBoundary() {
  return Object.freeze({
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
}

export function localReasonerLoopbackEndpoints() {
  return LOOPBACK_ENDPOINTS.map((endpoint) => Object.freeze({ id: endpoint.id, url: endpoint.url }));
}

async function probeEndpoint(endpoint, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint.url, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) {
      return endpointState(endpoint.id, "unavailable", 0, `http-${boundedStatus(response?.status)}`);
    }
    let body;
    try { body = await response.json(); }
    catch { return endpointState(endpoint.id, "unavailable", 0, "invalid-json"); }
    const modelCount = countModels(endpoint.parser, body);
    if (modelCount < 1) return endpointState(endpoint.id, "configured", 0, null);
    return endpointState(endpoint.id, "healthy", modelCount, null);
  } catch (error) {
    if (error?.name === "AbortError") return endpointState(endpoint.id, "unavailable", 0, "timeout");
    return endpointState(endpoint.id, "unavailable", 0, "connection-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function countModels(parser, body) {
  if (parser === "ollama-tags") {
    const models = Array.isArray(body?.models) ? body.models : [];
    return Math.min(models.length, 1000);
  }
  const models = Array.isArray(body?.data) ? body.data : [];
  return Math.min(models.length, 1000);
}

function endpointState(id, availability, modelCount, errorCode) {
  return {
    id,
    availability,
    modelCount,
    verified: availability === "healthy" && modelCount > 0,
    errorCode,
  };
}

function firstError(probes) {
  return probes.find((probe) => probe.errorCode)?.errorCode ?? "connection-unavailable";
}

function unavailable(errorCode) {
  return {
    verified: false,
    summary: "No loopback local reasoner (Ollama or LM Studio) is ready for local reasoning.",
    providerHealth: {
      availability: "unavailable",
      endpointClass: "localhost",
      authentication: "not-required-loopback",
      modelCount: 0,
      backends: Object.freeze([]),
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

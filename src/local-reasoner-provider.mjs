const LM_STUDIO_MODELS_URL = "http://127.0.0.1:1234/v1/models";

export async function probeLocalReasoner({ fetchImpl = globalThis.fetch, timeoutMs = 3000 } = {}) {
  if (typeof fetchImpl !== "function") return unavailable("fetch-unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000) throw new TypeError("local-reasoner-timeout-invalid");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LM_STUDIO_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) return unavailable(`http-${boundedStatus(response?.status)}`);
    let body;
    try { body = await response.json(); }
    catch { return unavailable("invalid-json"); }
    const models = Array.isArray(body?.data) ? body.data : [];
    const modelCount = Math.min(models.length, 1000);
    const verified = modelCount > 0;
    return {
      verified,
      summary: verified
        ? `LM Studio loopback provider is responsive with ${modelCount} loaded model(s); reasoning execution remains disabled until a transient result channel is available.`
        : "LM Studio loopback provider responded but reported no loaded models.",
      providerHealth: {
        availability: verified ? "healthy" : "configured",
        endpointClass: "localhost",
        authentication: "not-required-loopback",
        modelCount,
        executionEnabled: false,
        responseContentPersisted: false,
      },
    };
  } catch (error) {
    if (error?.name === "AbortError") return unavailable("timeout");
    return unavailable("connection-unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export function localReasonerExecutionBoundary() {
  return Object.freeze({
    executionEnabled: false,
    reason: "transient-result-channel-required",
    promptPersistenceAllowed: false,
    responsePersistenceAllowed: false,
  });
}

function unavailable(errorCode) {
  return {
    verified: false,
    summary: "LM Studio loopback provider is not ready for local reasoning.",
    providerHealth: {
      availability: "unavailable",
      endpointClass: "localhost",
      authentication: "not-required-loopback",
      modelCount: 0,
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

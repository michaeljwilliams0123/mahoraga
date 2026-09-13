import { buildQuestionPrompt } from "./question-model.mjs";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "openai/gpt-5.6-sol";
const MAX_RESPONSE_CHARS = 64_000;
const ZERO_CREDIT_PROVIDER_IDS = new Set(["codespaces-open-weight", "local-open-weight"]);
const ZERO_CREDIT_COST_CLASS = Object.freeze({
  "codespaces-open-weight": "cloud-open-weight",
  "local-open-weight": "local-model",
});

export async function probeNativeCloudModel({ env = process.env } = {}) {
  const credential = readCredential(env);
  if (!credential) return unavailable("ai-gateway-credential-unavailable");
  return {
    verified: true,
    summary: "Native cloud GPT-5.6 Sol is bound through the Vercel AI Gateway.",
    providerHealth: health("healthy"),
  };
}

export async function executeNativeCloudModel({ task, fetchImpl = fetch, env = process.env } = {}) {
  const credential = readCredential(env);
  if (!credential) return unavailable("ai-gateway-credential-unavailable");
  const prompt = buildQuestionPrompt(task ?? {});
  let response;
  try {
    response = await fetchImpl(GATEWAY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return unavailable("ai-gateway-request-failed");
  }
  if (!response?.ok) return unavailable(`ai-gateway-http-${boundedStatus(response?.status)}`);
  let payload;
  try { payload = await response.json(); } catch { return unavailable("ai-gateway-response-invalid"); }
  const answer = payload?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || answer.trim().length < 1 || answer.length > MAX_RESPONSE_CHARS) return unavailable("ai-gateway-answer-invalid");
  const usage = {
    inputTokens: boundedCount(payload?.usage?.prompt_tokens),
    outputTokens: boundedCount(payload?.usage?.completion_tokens),
  };
  return {
    verified: true,
    answer: answer.trim(),
    summary: answer.trim().slice(0, 512),
    providerHealth: {
      ...health("healthy"),
      usage,
    },
  };
}

export async function executeZeroCreditAnswerModel({
  task,
  authorityDecision,
  providerDecision,
  providerEvidence,
  fetchImpl = fetch,
  env = process.env,
} = {}) {
  const admission = validateZeroCreditAdmission({ authorityDecision, providerDecision, providerEvidence });
  if (!admission.ok) return zeroCreditUnavailable(admission.reasonCode, providerDecision);

  const configuration = readZeroCreditConfiguration(env, providerDecision.providerId);
  if (!configuration.ok) return zeroCreditUnavailable(configuration.reasonCode, providerDecision);

  const prompt = buildQuestionPrompt(task ?? {});
  let response;
  try {
    response = await fetchImpl(configuration.url, {
      method: "POST",
      headers: zeroCreditHeaders(configuration.token),
      body: JSON.stringify({
        model: configuration.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return zeroCreditUnavailable("zero-credit-model-request-failed", providerDecision);
  }
  if (!response?.ok) return zeroCreditUnavailable(`zero-credit-model-http-${boundedStatus(response?.status)}`, providerDecision);

  let payload;
  try { payload = await response.json(); } catch { return zeroCreditUnavailable("zero-credit-model-response-invalid", providerDecision); }
  const answer = payload?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || answer.trim().length < 1 || answer.length > MAX_RESPONSE_CHARS) {
    return zeroCreditUnavailable("zero-credit-model-answer-invalid", providerDecision);
  }

  return Object.freeze({
    verified: true,
    taskId: boundedIdentifier(task?.id),
    correlationId: boundedIdentifier(task?.correlationId),
    answer: answer.trim(),
    summary: answer.trim().slice(0, 512),
    externalProviderCalls: 1,
    providerDecision: Object.freeze({
      status: "selected",
      providerId: providerDecision.providerId,
      costClass: providerDecision.costClass,
    }),
    providerHealth: Object.freeze({
      availability: "healthy",
      provider: providerDecision.providerId,
      model: configuration.model,
      executionMode: "zero-credit-openai-compatible",
      networkAccess: true,
      zeroCreditVerified: true,
      billingState: "verified-zero",
      responseContentPersistedOutsideVault: false,
      usage: Object.freeze({
        inputTokens: boundedCount(payload?.usage?.prompt_tokens),
        outputTokens: boundedCount(payload?.usage?.completion_tokens),
      }),
    }),
  });
}

export function validateZeroCreditAdmission({ authorityDecision, providerDecision, providerEvidence } = {}) {
  if (authorityDecision?.decision !== "allow") return rejected("authority-hold");
  if (providerDecision?.status !== "selected" || !ZERO_CREDIT_PROVIDER_IDS.has(providerDecision?.providerId)) return rejected("zero-credit-provider-not-selected");
  if (providerDecision.costClass !== ZERO_CREDIT_COST_CLASS[providerDecision.providerId]) return rejected("zero-credit-provider-cost-class-invalid");
  if (!providerEvidence || typeof providerEvidence !== "object" || Array.isArray(providerEvidence)) return rejected("zero-credit-provider-evidence-missing");
  if (providerEvidence.id !== providerDecision.providerId) return rejected("zero-credit-provider-evidence-mismatch");
  if (providerEvidence.metered !== false || providerEvidence.priceUsd !== 0 || providerEvidence.spendUsd !== 0) return rejected("zero-credit-provider-not-zero-dollar");
  if (providerEvidence.billingState !== "verified-zero" || providerEvidence.zeroDollarStopGuaranteed !== true) return rejected("zero-credit-provider-billing-unverified");
  if (providerEvidence.ready !== true || providerEvidence.capabilityCanary?.fresh !== true) return rejected("zero-credit-provider-not-ready");
  return Object.freeze({ ok: true, reasonCode: null });
}

function readCredential(env) {
  return typeof env?.AI_GATEWAY_API_KEY === "string" ? env.AI_GATEWAY_API_KEY.trim() : "";
}

function readZeroCreditConfiguration(env, providerId) {
  const rawUrl = typeof env?.MAHORAGA_ZERO_CREDIT_MODEL_URL === "string" ? env.MAHORAGA_ZERO_CREDIT_MODEL_URL.trim() : "";
  const model = typeof env?.MAHORAGA_ZERO_CREDIT_MODEL_ID === "string" ? env.MAHORAGA_ZERO_CREDIT_MODEL_ID.trim() : "";
  const token = typeof env?.MAHORAGA_ZERO_CREDIT_MODEL_TOKEN === "string" ? env.MAHORAGA_ZERO_CREDIT_MODEL_TOKEN.trim() : "";
  if (!rawUrl || !model) return rejected("zero-credit-model-configuration-missing");
  let url;
  try { url = new URL(rawUrl); } catch { return rejected("zero-credit-model-url-invalid"); }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.hash) return rejected("zero-credit-model-url-invalid");
  if (providerId === "codespaces-open-weight" && url.protocol !== "https:") return rejected("zero-credit-cloud-model-https-required");
  if (providerId === "local-open-weight" && !isLoopbackHost(url.hostname)) return rejected("zero-credit-local-model-loopback-required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@+-]{0,127}$/.test(model)) return rejected("zero-credit-model-id-invalid");
  return Object.freeze({ ok: true, url: url.href, model, token });
}

function zeroCreditHeaders(token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function health(availability, reasonCode) {
  const value = {
    availability,
    provider: "vercel-ai-gateway",
    model: MODEL,
    executionMode: "core-routed-native-api",
    networkAccess: true,
    responseContentPersistedOutsideVault: false,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  if (reasonCode) value.reasonCode = reasonCode;
  return value;
}

function unavailable(reasonCode) {
  return {
    verified: false,
    summary: `Native cloud answer unavailable: ${reasonCode}.`,
    providerHealth: health("unavailable", reasonCode),
  };
}

function zeroCreditUnavailable(reasonCode, providerDecision = null) {
  return Object.freeze({
    verified: false,
    summary: `Zero-credit answer unavailable: ${reasonCode}.`,
    externalProviderCalls: 0,
    providerDecision: providerDecision?.providerId ? Object.freeze({
      status: providerDecision.status ?? null,
      providerId: providerDecision.providerId,
      costClass: providerDecision.costClass ?? null,
    }) : null,
    providerHealth: Object.freeze({
      availability: "unavailable",
      provider: providerDecision?.providerId ?? "zero-credit-answer",
      executionMode: "zero-credit-openai-compatible",
      zeroCreditVerified: false,
      reasonCode,
      responseContentPersistedOutsideVault: false,
      usage: Object.freeze({ inputTokens: 0, outputTokens: 0 }),
    }),
  });
}

function rejected(reasonCode) { return Object.freeze({ ok: false, reasonCode }); }
function isLoopbackHost(hostname) { return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"; }
function boundedIdentifier(value) { return typeof value === "string" && value.length <= 160 ? value : null; }
function boundedCount(value) { return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10_000_000) : 0; }
function boundedStatus(value) { return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0; }

import { buildQuestionPrompt } from "./question-model.mjs";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "openai/gpt-5.6-sol";
const MAX_RESPONSE_CHARS = 64_000;

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

function readCredential(env) {
  return typeof env?.AI_GATEWAY_API_KEY === "string" ? env.AI_GATEWAY_API_KEY.trim() : "";
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

function boundedCount(value) { return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10_000_000) : 0; }
function boundedStatus(value) { return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0; }

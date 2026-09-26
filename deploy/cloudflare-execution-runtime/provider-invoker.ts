export type ProviderMessage = { role: "user" | "assistant" | "system"; content: string };
export type RuntimeCapabilityState = "routable" | "unavailable";
export type ProviderRuntimeContext = {
  capabilities: Record<string, RuntimeCapabilityState>;
  receipts: string[];
  connectionState: "connected" | "degraded";
};
export type ProviderInput = { messages: ProviderMessage[]; runtimeContext?: ProviderRuntimeContext };
export type ProviderInvoker = (model: string, input: ProviderInput) => Promise<unknown>;

export const ASSISTANT_PROVIDER_ID = "cloudflare-workers-ai";
export const ASSISTANT_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
export const FREE_ALLOCATION_NEURONS = 10_000;
export const MAHORAGA_DAILY_BUDGET_NEURONS = 9_000;
export const MAX_PROVIDER_INPUT_BYTES = 8_000;
export const PROVIDER_FREE_QUOTA_EXHAUSTED = "provider-free-quota-exhausted";

export const DEFAULT_BROWSER_RUNTIME_CONTEXT: ProviderRuntimeContext = Object.freeze({
  capabilities: Object.freeze({
    "assistant.respond": "routable",
    "browser.execute": "unavailable",
    "image.generate": "unavailable",
    "memory.write": "unavailable",
    "repository.inspect": "unavailable",
  }),
  receipts: Object.freeze([]) as unknown as string[],
  connectionState: "connected",
});

type ProviderGapReason = typeof PROVIDER_FREE_QUOTA_EXHAUSTED;
type InterceptedAction = { type: string; status: "unavailable" };

class ProviderGapError extends Error {
  readonly reasonCode: ProviderGapReason;

  constructor(reasonCode: ProviderGapReason) {
    super(reasonCode);
    this.name = "ProviderGapError";
    this.reasonCode = reasonCode;
  }
}

export interface ZeroCreditProviderConfig {
  origin: string;
  token: string;
  accountIdHash: string;
  targetSha: string;
}

export interface ZeroCreditProviderEnvelope {
  providerId: string;
  modelId: string;
  targetSha: string;
  accountIdHash: string;
  billingBoundary: "daily-free-allocation-budget";
  freeAllocationNeurons: 10_000;
  dailyBudgetNeurons: 9_000;
}

let testInvoker: ProviderInvoker | null = null;

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const providerInputWithinLimit = (value: string): boolean =>
  new TextEncoder().encode(value).byteLength <= MAX_PROVIDER_INPUT_BYTES;

export const providerGapReasonFromError = (error: unknown): ProviderGapReason | null =>
  error instanceof ProviderGapError ? error.reasonCode : null;

const providerOrigin = (value: string): URL => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("zero-credit-provider-origin-invalid");
  }
  return url;
};

const configValid = (config: ZeroCreditProviderConfig): boolean =>
  typeof config.token === "string"
  && config.token.length >= 32
  && /^[a-f0-9]{64}$/i.test(config.accountIdHash)
  && /^[a-f0-9]{40}$/i.test(config.targetSha);

export const parseZeroCreditProviderEnvelope = (
  value: unknown,
  config: ZeroCreditProviderConfig,
): ZeroCreditProviderEnvelope | null => {
  const body = objectValue(value);
  if (
    body === null
    || body.providerId !== ASSISTANT_PROVIDER_ID
    || body.modelId !== ASSISTANT_MODEL_ID
    || body.targetSha !== config.targetSha
    || body.accountIdHash !== config.accountIdHash
    || body.billingBoundary !== "daily-free-allocation-budget"
    || body.freeAllocationNeurons !== FREE_ALLOCATION_NEURONS
    || body.dailyBudgetNeurons !== MAHORAGA_DAILY_BUDGET_NEURONS
  ) return null;
  return {
    providerId: ASSISTANT_PROVIDER_ID,
    modelId: ASSISTANT_MODEL_ID,
    targetSha: config.targetSha,
    accountIdHash: config.accountIdHash,
    billingBoundary: "daily-free-allocation-budget",
    freeAllocationNeurons: FREE_ALLOCATION_NEURONS,
    dailyBudgetNeurons: MAHORAGA_DAILY_BUDGET_NEURONS,
  };
};

const endpoint = (config: ZeroCreditProviderConfig, path: string): URL => {
  if (!configValid(config)) throw new Error("zero-credit-provider-config-invalid");
  return new URL(path, providerOrigin(config.origin));
};

const normalizedRuntimeContext = (value: ProviderRuntimeContext | undefined): ProviderRuntimeContext =>
  value ?? DEFAULT_BROWSER_RUNTIME_CONTEXT;

const groundingMessage = (runtimeContext: ProviderRuntimeContext): ProviderMessage => {
  const capabilityState = Object.entries(runtimeContext.capabilities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, state]) => `${capability}=${state}`)
    .join("; ");
  const verifiedReceipts = runtimeContext.receipts.length > 0 ? runtimeContext.receipts.join(",") : "none";
  return {
    role: "system",
    content: [
      "You are Mahoraga. Your identity is Mahoraga.",
      "The underlying provider/model is an implementation detail; do not identify yourself as GLM, Z.ai, or present the provider as your identity.",
      `Current runtime truth: connectionState=${runtimeContext.connectionState}; capabilities: ${capabilityState}; verifiedReceipts=${verifiedReceipts}.`,
      "Treat this runtime truth as authoritative. Never claim an unavailable capability is available.",
      "Do not claim that memory, repository, browser, image, file, or other external/durable work was completed unless a matching verified receipt is present.",
      "If a requested capability is unavailable, say so plainly. Never invent tool results, persistence, access, or completed actions.",
    ].join(" "),
  };
};

const messagesWithinLimit = (messages: ProviderMessage[]): boolean => {
  const encoder = new TextEncoder();
  let total = 0;
  for (const message of messages) {
    total += encoder.encode(message.content).byteLength;
    if (total > MAX_PROVIDER_INPUT_BYTES) return false;
  }
  return true;
};

const jsonAction = (answer: string): Record<string, unknown> | null => {
  let candidate = answer.trim();
  if (candidate.startsWith("```")) {
    const firstBreak = candidate.indexOf("\n");
    const closingFence = candidate.lastIndexOf("```");
    if (firstBreak > -1 && closingFence > firstBreak) candidate = candidate.slice(firstBreak + 1, closingFence).trim();
  }
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null;
  try { return objectValue(JSON.parse(candidate)); }
  catch { return null; }
};

const interceptAction = (
  answer: string,
  runtimeContext: ProviderRuntimeContext,
): { response: string; action: InterceptedAction } | null => {
  const parsed = jsonAction(answer);
  const action = parsed?.action;
  if (typeof action !== "string" || !action.trim()) return null;
  if (action === "text_to_image") {
    const imageAvailable = runtimeContext.capabilities["image.generate"] === "routable";
    if (!imageAvailable) return {
      response: "Image generation is not currently connected in this Mahoraga runtime.",
      action: { type: "text_to_image", status: "unavailable" },
    };
  }
  return {
    response: `The requested action '${action}' is not currently connected in this Mahoraga runtime.`,
    action: { type: action, status: "unavailable" },
  };
};

const guardProviderIdentityLeak = (answer: string): string => {
  const normalized = answer.trim();
  if (
    /^I(?:'m| am)\s+GLM\b/i.test(normalized)
    || /^My name is GLM\b/i.test(normalized)
    || /^I(?:'m| am)\s+(?:a\s+)?(?:large language model|LLM)\b[^.]{0,160}\b(?:Z\.ai|ZAI)\b/i.test(normalized)
    || /^I\b[^.]{0,160}\btrained by\s+(?:Z\.ai|ZAI)\b/i.test(normalized)
  ) return "I am Mahoraga.";
  return answer;
};

const guardUnverifiedCompletionClaim = (answer: string, runtimeContext: ProviderRuntimeContext): string => {
  if (
    runtimeContext.capabilities["memory.write"] !== "routable"
    && /\b(?:i have|i've|i)\s+(?:committed\b[^.]{0,120}\bto memory|remembered\b|saved\b[^.]{0,120}\bto memory|stored\b[^.]{0,120}\bin memory)/i.test(answer)
  ) return "I can use that information in this conversation, but durable memory is not currently connected in this Mahoraga runtime.";

  if (
    runtimeContext.capabilities["repository.inspect"] !== "routable"
    && /\b(?:i have|i've|i)\s+(?:accessed|opened|read|inspected|checked)\b[^.]{0,80}\b(?:github|repository|repo)\b/i.test(answer)
  ) return "Repository access is not currently connected in this Mahoraga browser runtime, so I have not accessed or inspected GitHub for this response.";

  if (
    runtimeContext.capabilities["browser.execute"] !== "routable"
    && /\b(?:i have|i've|i)\s+(?:opened|visited|browsed|navigated|clicked)\b[^.]{0,80}\b(?:website|page|browser|site)\b/i.test(answer)
  ) return "Browser execution is not currently connected in this Mahoraga runtime, so I have not performed that browser action.";

  return answer;
};

export const invokeZeroCreditProvider = async (
  config: ZeroCreditProviderConfig,
  model: string,
  input: ProviderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> => {
  if (testInvoker !== null) return testInvoker(model, input);
  if (model !== ASSISTANT_MODEL_ID) throw new Error("cognition-provider-model-mismatch");
  const runtimeContext = normalizedRuntimeContext(input.runtimeContext);
  const messages = [groundingMessage(runtimeContext), ...input.messages];
  if (!messagesWithinLimit(messages)) throw new Error("cognition-provider-input-limit");
  const response = await fetchImpl(endpoint(config, "/api/infer"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ targetSha: config.targetSha, model, messages }),
  });
  if (response.status === 429) throw new ProviderGapError(PROVIDER_FREE_QUOTA_EXHAUSTED);
  if (!response.ok) throw new Error("cognition-provider-failed");
  const body: unknown = await response.json();
  if (parseZeroCreditProviderEnvelope(body, config) === null) throw new Error("cognition-provider-identity-mismatch");
  const record = objectValue(body);
  const answer = record?.answer;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("cognition-provider-response-invalid");
  const intercepted = interceptAction(answer, runtimeContext);
  if (intercepted !== null) return { ...intercepted, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID };
  const identityGroundedAnswer = guardProviderIdentityLeak(answer);
  return {
    response: guardUnverifiedCompletionClaim(identityGroundedAnswer, runtimeContext),
    providerId: ASSISTANT_PROVIDER_ID,
    modelId: ASSISTANT_MODEL_ID,
  };
};

// Test-only dependency seam. Production execution never receives a Workers AI binding;
// it can reach cognition only through the isolated authenticated provider endpoint.
export const setProviderInvokerForTest = (invoker: ProviderInvoker | null): void => {
  testInvoker = invoker;
};

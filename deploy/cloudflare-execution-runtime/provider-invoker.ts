export type ProviderMessage = { role: "user" | "assistant" | "system"; content: string };
export type ProviderInput = { messages: ProviderMessage[] };
export type ProviderInvoker = (model: string, input: ProviderInput) => Promise<unknown>;

export const ASSISTANT_PROVIDER_ID = "cloudflare-workers-ai";
export const ASSISTANT_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
export const FREE_ALLOCATION_NEURONS = 10_000;
export const MAHORAGA_DAILY_BUDGET_NEURONS = 9_000;
export const MAX_PROVIDER_INPUT_BYTES = 8_000;
export const PROVIDER_FREE_QUOTA_EXHAUSTED = "provider-free-quota-exhausted";

type ProviderGapReason = typeof PROVIDER_FREE_QUOTA_EXHAUSTED;

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
  billingAttestation: string;
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

export const invokeZeroCreditProvider = async (
  config: ZeroCreditProviderConfig,
  model: string,
  input: ProviderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> => {
  if (testInvoker !== null) return testInvoker(model, input);
  if (model !== ASSISTANT_MODEL_ID) throw new Error("cognition-provider-model-mismatch");
  const response = await fetchImpl(endpoint(config, "/api/infer"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ targetSha: config.targetSha, model, messages: input.messages }),
  });
  if (response.status === 429) throw new ProviderGapError(PROVIDER_FREE_QUOTA_EXHAUSTED);
  if (!response.ok) throw new Error("cognition-provider-failed");
  const body: unknown = await response.json();
  if (parseZeroCreditProviderEnvelope(body, config) === null) throw new Error("cognition-provider-identity-mismatch");
  const record = objectValue(body);
  const answer = record?.answer;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("cognition-provider-response-invalid");
  return { response: answer, providerId: ASSISTANT_PROVIDER_ID, modelId: ASSISTANT_MODEL_ID };
};

// Test-only dependency seam. Production execution never receives a Workers AI binding;
// it can reach cognition only through the isolated authenticated provider endpoint.
export const setProviderInvokerForTest = (invoker: ProviderInvoker | null): void => {
  testInvoker = invoker;
};

const CREDIT_FREE_PROVIDERS = Object.freeze(["repository", "local-core", "self-healer", "steward-learning"]);
const LOCAL_REASONER_PROVIDERS = Object.freeze(["local-reasoner", "lm-studio", "ollama"]);
const SUBSCRIPTION_LOCAL_PROVIDERS = Object.freeze(["primary-codex-builder"]);
const METERED_PROVIDERS = Object.freeze(["openai-platform", "github-copilot", "workspace-agent-cloud", "codex-cloud"]);

export function classifyAutonomyProvider(provider) {
  const name = normalizeProvider(provider);
  if (CREDIT_FREE_PROVIDERS.includes(name)) return "credit-free";
  if (LOCAL_REASONER_PROVIDERS.includes(name)) return "local-reasoner";
  if (SUBSCRIPTION_LOCAL_PROVIDERS.includes(name)) return "subscription-local";
  if (METERED_PROVIDERS.includes(name)) return "metered";
  return "unknown";
}

export function selectCreditFreeExecutionPlane({
  requestedProvider = "repository",
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  localReasonerReady = false,
  cloudBudgetAdmissible = false,
} = {}) {
  if (allowPaidFallback === true) return blocked("paid-fallback-forbidden");
  if (Number(spendGrantUsd) !== 0) return blocked("spend-grant-not-zero");
  if (platformApiKeyPresent === true) return blocked("platform-api-key-present");

  const requested = normalizeProvider(requestedProvider);
  const className = classifyAutonomyProvider(requested);

  if (className === "credit-free") {
    return admitted({ provider: requested, plane: "local-deterministic", className });
  }

  if (className === "local-reasoner") {
    if (localReasonerReady !== true) return blocked("local-reasoner-not-ready");
    return admitted({ provider: requested, plane: "local-reasoner", className });
  }

  if (className === "subscription-local") {
    return blocked("subscription-local-not-credit-free");
  }

  if (className === "metered") {
    return blocked("metered-provider-forbidden");
  }

  void cloudBudgetAdmissible;
  return blocked("unknown-provider-not-credit-free");
}

export function attestZeroCreditHealth({
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  providers = [],
  cloudBudgetAdmissible = false,
} = {}) {
  if (allowPaidFallback === true) return health("unhealthy", "paid-fallback-forbidden");
  if (Number(spendGrantUsd) !== 0) return health("unhealthy", "spend-grant-not-zero");
  if (platformApiKeyPresent === true) return health("unhealthy", "platform-api-key-present");
  if (!Array.isArray(providers)) return health("unhealthy", "provider-list-invalid");

  const classes = providers.map((provider) => classifyAutonomyProvider(provider));
  if (classes.includes("metered")) return health("unhealthy", "metered-provider-present");
  if (classes.includes("unknown")) return health("unhealthy", "unknown-provider-present");

  const hasDeterministic = classes.includes("credit-free");
  if (!hasDeterministic) return health("degraded", "deterministic-plane-missing");
  if (cloudBudgetAdmissible !== true) {
    return health("healthy", "zero-credit-local-only", { cloudBudgetAdmissible: false });
  }
  return health("healthy", "zero-credit-attested", { cloudBudgetAdmissible: true });
}

export function assertCreditFreeDispatch(input) {
  const decision = selectCreditFreeExecutionPlane(input);
  if (!decision.ok) throw Object.assign(new Error(decision.reason), { code: decision.reason, decision });
  return decision;
}

function admitted({ provider, plane, className }) {
  return Object.freeze({
    ok: true,
    status: "admissible",
    reason: null,
    provider,
    plane,
    className,
    creditCost: 0,
    paidFallback: false,
  });
}

function blocked(reason) {
  return Object.freeze({
    ok: false,
    status: "blocked",
    reason,
    provider: null,
    plane: null,
    className: null,
    creditCost: 0,
    paidFallback: false,
  });
}

function health(status, reason, extra = {}) {
  return Object.freeze({
    ok: status === "healthy",
    status,
    reason,
    creditCost: 0,
    paidFallback: false,
    ...extra,
  });
}

function normalizeProvider(value) {
  return String(value ?? "").trim().toLowerCase();
}

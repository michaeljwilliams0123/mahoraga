const CREDIT_FREE_PROVIDERS = Object.freeze(["repository", "local-core", "self-healer", "steward-learning", "browser", "desktop"]);
const LOCAL_REASONER_PROVIDERS = Object.freeze(["local-reasoner", "lm-studio", "ollama"]);
const SUBSCRIPTION_LOCAL_PROVIDERS = Object.freeze(["primary-codex-builder"]);
const METERED_PROVIDERS = Object.freeze(["openai-platform", "github-copilot", "workspace-agent-cloud", "codex-cloud"]);

export const CREDIT_FREE_PROTOCOL_STEPS = Object.freeze(["observe", "decide", "act", "verify", "repair", "report"]);

export const CREDIT_FREE_GRAPH = Object.freeze([
  Object.freeze({ id: "observe", provider: "repository", capability: "repository.status", dependsOn: Object.freeze([]), completionCriteria: "worker-verified" }),
  Object.freeze({ id: "decide", provider: "local-core", capability: "system.health", dependsOn: Object.freeze(["observe"]), completionCriteria: "worker-verified" }),
  Object.freeze({ id: "act", provider: "self-healer", capability: "repair.scan", dependsOn: Object.freeze(["decide"]), completionCriteria: "worker-verified" }),
  Object.freeze({ id: "verify", provider: "repository", capability: "repository.verify", dependsOn: Object.freeze(["act"]), completionCriteria: "worker-verified" }),
  Object.freeze({ id: "repair", provider: "self-healer", capability: "repair.apply", dependsOn: Object.freeze(["verify"]), completionCriteria: "worker-verified" }),
  Object.freeze({ id: "report", provider: "repository", capability: "repository.verify", dependsOn: Object.freeze(["repair"]), completionCriteria: "merge-after-verify" }),
]);

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

export function isCreditFreeWorkerId(workerId) {
  return classifyAutonomyProvider(workerId) === "credit-free";
}

export function maintainCreditFreeAutonomy({
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  providers = ["repository", "local-core", "self-healer"],
  localReasonerReady = false,
  cloudBudgetAdmissible = false,
  requestedProvider = "repository",
  now = new Date(),
} = {}) {
  const healthAttestation = attestZeroCreditHealth({
    spendGrantUsd,
    platformApiKeyPresent,
    allowPaidFallback,
    providers,
    cloudBudgetAdmissible,
  });
  const plane = selectCreditFreeExecutionPlane({
    requestedProvider,
    spendGrantUsd,
    platformApiKeyPresent,
    allowPaidFallback,
    localReasonerReady,
    cloudBudgetAdmissible,
  });
  const nextAction = !healthAttestation.ok
    ? (healthAttestation.status === "degraded" ? "hold-planned" : "refuse-paid-route")
    : plane.ok
      ? "dispatch-credit-free"
      : "wait-for-local-reasoner";
  return Object.freeze({
    schemaVersion: 1,
    observedAt: canonicalNow(now),
    health: healthAttestation,
    plane,
    nextAction,
    protocol: CREDIT_FREE_PROTOCOL_STEPS,
    creditCost: 0,
    paidFallback: false,
  });
}

export function creditFreeGraphNodes() {
  return CREDIT_FREE_GRAPH.map((node) => {
    const decision = assertCreditFreeDispatch({ requestedProvider: node.provider });
    return Object.freeze({
      ...node,
      dependsOn: Object.freeze([...node.dependsOn]),
      creditCost: decision.creditCost,
      paidFallback: decision.paidFallback,
      plane: decision.plane,
      className: decision.className,
    });
  });
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

function canonicalNow(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return new Date().toISOString();
  return value.toISOString();
}

const CREDIT_FREE_PROVIDERS = Object.freeze([
  "repository",
  "local-core",
  "self-healer",
  "steward-learning",
  "browser",
  "desktop",
  "mcp-host",
  "github-operator",
  "grok-github-mcp",
  "chatgpt-github-mcp",
]);
const LOCAL_REASONER_PROVIDERS = Object.freeze(["local-reasoner", "lm-studio", "ollama", "llama-cpp", "jan", "gpt4all", "localai", "mlx"]);
const SUBSCRIPTION_LOCAL_PROVIDERS = Object.freeze(["primary-codex-builder"]);
export const CORE_OWNED_CLOUD_METERED_PROVIDERS = Object.freeze([
  "native-cloud-model",
  "vercel-ai-gateway",
  "cloud-browser",
  "browserbase",
  "browserbase-cloud",
]);
const METERED_PROVIDERS = Object.freeze([
  "openai-platform",
  "github-copilot",
  "workspace-agent-cloud",
  "codex-cloud",
  "groq",
  "gemini",
  "huggingface",
  "openrouter",
  "together",
  "fireworks",
  "chatgpt-codex-connector",
  "copilot-review",
  "openclaw-hosted",
  "codespaces",
  "github-codespaces",
  ...CORE_OWNED_CLOUD_METERED_PROVIDERS,
]);
const MUTATION_WORDS = /\b(?:apply|build|change|create|delete|deploy|execute|fix|implement|install|publish|repair|restart|update|write)\b/i;
const INSPECT_WORDS = /\b(?:inspect|review|examine|status|health|observe)\b/i;
const REPAIR_WORDS = /\b(?:repair|heal|restore|rollback)\b/i;

export const CREDIT_FREE_PROTOCOL_STEPS = Object.freeze(["observe", "decide", "act", "verify", "repair", "report"]);
export const CREDIT_FREE_NEXT_ACTIONS = Object.freeze(["dispatch-credit-free", "hold-planned", "wait-for-local-reasoner", "refuse-paid-route"]);

const NODE = {
  observe: Object.freeze({ id: "observe", provider: "repository", capability: "repository.status", dependsOn: Object.freeze([]), completionCriteria: "worker-verified" }),
  decide: Object.freeze({ id: "decide", provider: "local-core", capability: "system.health", dependsOn: Object.freeze(["observe"]), completionCriteria: "worker-verified" }),
  act: Object.freeze({ id: "act", provider: "self-healer", capability: "repair.scan", dependsOn: Object.freeze(["decide"]), completionCriteria: "worker-verified" }),
  verify: Object.freeze({ id: "verify", provider: "repository", capability: "repository.verify", dependsOn: Object.freeze(["act"]), completionCriteria: "worker-verified" }),
  repair: Object.freeze({ id: "repair", provider: "self-healer", capability: "repair.apply", dependsOn: Object.freeze(["verify"]), completionCriteria: "worker-verified" }),
  report: Object.freeze({ id: "report", provider: "repository", capability: "repository.verify", dependsOn: Object.freeze(["repair"]), completionCriteria: "merge-after-verify" }),
};

export const CREDIT_FREE_GRAPH = Object.freeze([NODE.observe, NODE.decide, NODE.act, NODE.verify, NODE.repair, NODE.report]);

const INSPECT_GRAPH = Object.freeze([
  NODE.observe,
  Object.freeze({ ...NODE.decide, dependsOn: Object.freeze(["observe"]) }),
  Object.freeze({ id: "report", provider: "repository", capability: "repository.status", dependsOn: Object.freeze(["decide"]), completionCriteria: "worker-verified" }),
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

export function attestHostedComputeBudget({
  vercelDeploymentsToday = 0,
  vercelDailyCap = 100,
  extraVercelProjects = 0,
} = {}) {
  const used = Number(vercelDeploymentsToday);
  const cap = Number(vercelDailyCap);
  const extras = Number(extraVercelProjects);
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(cap) || cap < 1) {
    return Object.freeze({ ok: false, status: "unhealthy", reason: "hosted-compute-budget-invalid", creditCost: 0, paidFallback: false });
  }
  if (used >= cap) {
    return Object.freeze({ ok: false, status: "unhealthy", reason: "hosted-deploy-cap-exhausted", creditCost: 0, paidFallback: false, used, cap });
  }
  if (extras > 1) {
    return Object.freeze({ ok: true, status: "degraded", reason: "duplicate-vercel-projects-burn-quota", creditCost: 0, paidFallback: false, used, cap, extras });
  }
  return Object.freeze({ ok: true, status: "healthy", reason: "hosted-compute-admissible", creditCost: 0, paidFallback: false, used, cap });
}

export function resolveCreditFreeNextAction({ health, plane, hostedCompute = null } = {}) {
  if (hostedCompute && hostedCompute.ok === false) return "hold-planned";
  if (!health?.ok) return health?.status === "degraded" ? "hold-planned" : "refuse-paid-route";
  if (plane?.ok) return "dispatch-credit-free";
  if (plane?.reason === "local-reasoner-not-ready") return "wait-for-local-reasoner";
  return "refuse-paid-route";
}

export function assertCreditFreeDispatch(input) {
  const decision = selectCreditFreeExecutionPlane(input);
  if (!decision.ok) throw Object.assign(new Error(decision.reason), { code: decision.reason, decision });
  return decision;
}

export function isCreditFreeWorkerId(workerId) {
  return classifyAutonomyProvider(workerId) === "credit-free";
}

export function classifyCreditFreeIntent(message) {
  const text = String(message ?? "");
  if (REPAIR_WORDS.test(text)) return "repair";
  if (INSPECT_WORDS.test(text) && !MUTATION_WORDS.test(text)) return "inspect";
  if (MUTATION_WORDS.test(text)) return "autonomous-action";
  return "autonomous-action";
}

export function selectCreditFreeGraph(intentKind = "autonomous-action") {
  if (intentKind === "inspect") return INSPECT_GRAPH;
  return CREDIT_FREE_GRAPH;
}

export function planCreditFreeWork({
  message = "",
  localReasonerReady = false,
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  providers = ["repository", "local-core", "self-healer"],
  requestedProvider = "repository",
  vercelDeploymentsToday = 0,
  vercelDailyCap = 100,
  extraVercelProjects = 0,
  now = new Date(),
} = {}) {
  const intentKind = classifyCreditFreeIntent(message);
  const maintenance = maintainCreditFreeAutonomy({
    spendGrantUsd,
    platformApiKeyPresent,
    allowPaidFallback,
    providers,
    localReasonerReady,
    requestedProvider,
    vercelDeploymentsToday,
    vercelDailyCap,
    extraVercelProjects,
    now,
  });
  const graph = selectCreditFreeGraph(intentKind);
  const mutation = MUTATION_WORDS.test(String(message ?? ""));
  const stewardGap = mutation && localReasonerReady !== true
    ? Object.freeze({
      id: "credit-free-deferred-implementation",
      state: "hold-planned",
      priority: "p1",
      summary: "Containment ran at $0. Model-backed source edits wait for a live local reasoner or an owner-authorized dispatch.",
      dependency: "ollama-or-owner-dispatch",
      creditCost: 0,
      paidFallback: false,
    })
    : null;
  return Object.freeze({
    schemaVersion: 1,
    intentKind,
    nextAction: maintenance.nextAction,
    health: maintenance.health,
    plane: maintenance.plane,
    hostedCompute: maintenance.hostedCompute,
    graph,
    stewardGap,
    creditCost: 0,
    paidFallback: false,
    observedAt: maintenance.observedAt,
  });
}

export function maintainCreditFreeAutonomy({
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  providers = ["repository", "local-core", "self-healer"],
  localReasonerReady = false,
  cloudBudgetAdmissible = false,
  requestedProvider = "repository",
  vercelDeploymentsToday = 0,
  vercelDailyCap = 100,
  extraVercelProjects = 0,
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
  const hostedCompute = attestHostedComputeBudget({ vercelDeploymentsToday, vercelDailyCap, extraVercelProjects });
  const nextAction = resolveCreditFreeNextAction({ health: healthAttestation, plane, hostedCompute });
  return Object.freeze({
    schemaVersion: 1,
    observedAt: canonicalNow(now),
    health: healthAttestation,
    plane,
    hostedCompute,
    nextAction,
    protocol: CREDIT_FREE_PROTOCOL_STEPS,
    creditCost: 0,
    paidFallback: false,
  });
}

export function creditFreeGraphNodes(graph = CREDIT_FREE_GRAPH) {
  return [...graph].map((node) => {
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

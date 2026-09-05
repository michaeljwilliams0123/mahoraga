import crypto from "node:crypto";
import {
  CREDIT_FREE_NEXT_ACTIONS,
  CREDIT_FREE_PROTOCOL_STEPS,
  maintainCreditFreeAutonomy,
  planCreditFreeWork,
  selectCreditFreeExecutionPlane,
  selectCreditFreeGraph,
} from "./credit-free-autonomy.mjs";

export const HEARTBEAT_KIND = "credit-free-heartbeat";
export const HEARTBEAT_SCHEMA_VERSION = 1;

export function runCreditFreeHeartbeat({
  spendGrantUsd = 0,
  platformApiKeyPresent = false,
  allowPaidFallback = false,
  providers = ["repository", "local-core", "self-healer"],
  localReasonerReady = false,
  requestedProvider = "repository",
  vercelDeploymentsToday = 0,
  vercelDailyCap = 100,
  extraVercelProjects = 0,
  now = new Date(),
  world = {},
  requiresGeneration = false,
  message = "Maintain credit-free autonomy.",
} = {}) {
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
  const intentKind = requiresGeneration === true ? "autonomous-action" : "inspect";
  const plan = planCreditFreeWork({
    message,
    localReasonerReady,
    spendGrantUsd,
    platformApiKeyPresent,
    allowPaidFallback,
    providers,
    requestedProvider,
    vercelDeploymentsToday,
    vercelDailyCap,
    extraVercelProjects,
    now,
  });
  const graph = selectCreditFreeGraph(intentKind);
  const planeInput = {
    spendGrantUsd,
    platformApiKeyPresent,
    allowPaidFallback,
    localReasonerReady,
  };
  const steps = graph.map((node) => {
    const decision = selectCreditFreeExecutionPlane({
      ...planeInput,
      requestedProvider: node.provider,
    });
    return Object.freeze({
      id: node.id,
      capability: node.capability,
      provider: node.provider,
      dependsOn: Object.freeze([...node.dependsOn]),
      completionCriteria: node.completionCriteria,
      status: decision.ok ? "admissible" : "blocked",
      reason: decision.reason,
      creditCost: 0,
      paidFallback: false,
    });
  });
  const executable = maintenance.nextAction === "dispatch-credit-free";
  return Object.freeze({
    schemaVersion: HEARTBEAT_SCHEMA_VERSION,
    kind: HEARTBEAT_KIND,
    observedAt: maintenance.observedAt,
    intentKind,
    nextAction: maintenance.nextAction,
    executable,
    health: maintenance.health,
    plane: maintenance.plane,
    hostedCompute: maintenance.hostedCompute,
    protocol: CREDIT_FREE_PROTOCOL_STEPS,
    steps: Object.freeze(steps),
    stewardGap: plan.stewardGap,
    worldDigest: digestWorld(world),
    creditCost: 0,
    paidFallback: false,
  });
}

export function compoundCreditFreeLearning(receipts = []) {
  if (!Array.isArray(receipts)) fail("heartbeat-receipts-invalid");
  const nextActions = Object.fromEntries(CREDIT_FREE_NEXT_ACTIONS.map((action) => [action, 0]));
  let lastHealthyAt = null;
  let lastObservedAt = null;
  let paidContamination = 0;
  for (const receipt of receipts) {
    validateHeartbeatReceipt(receipt);
    nextActions[receipt.nextAction] += 1;
    lastObservedAt = receipt.observedAt;
    if (receipt.health?.ok === true) lastHealthyAt = receipt.observedAt;
    if (receipt.creditCost !== 0 || receipt.paidFallback === true) paidContamination += 1;
  }
  if (paidContamination > 0) fail("heartbeat-paid-contamination");
  const gaps = [];
  if (nextActions["wait-for-local-reasoner"] > 0) {
    gaps.push(gap(
      "heartbeat-local-reasoner-gap",
      "hold-planned",
      "p1",
      "Heartbeats waited for a live local reasoner instead of buying a route.",
      "ollama-or-lm-studio",
    ));
  }
  if (nextActions["refuse-paid-route"] > 0) {
    gaps.push(gap(
      "heartbeat-paid-route-refused",
      "refused",
      "p0",
      "Heartbeats refused a paid recovery path and stayed at $0.",
      "credit-free-plane",
    ));
  }
  if (nextActions["hold-planned"] > 0 && nextActions["dispatch-credit-free"] === 0) {
    gaps.push(gap(
      "heartbeat-held-without-dispatch",
      "hold-planned",
      "p1",
      "No credit-free dispatch occurred; work stayed planned.",
      "deterministic-plane-or-local-reasoner",
    ));
  }
  return Object.freeze({
    schemaVersion: HEARTBEAT_SCHEMA_VERSION,
    kind: "credit-free-learning",
    zeroCredit: true,
    methodIds: CREDIT_FREE_PROTOCOL_STEPS,
    heartbeatCount: receipts.length,
    nextActions: Object.freeze({ ...nextActions }),
    lastHealthyAt,
    lastObservedAt,
    creditCost: 0,
    paidFallback: false,
    gaps: Object.freeze(gaps),
  });
}

export function validateHeartbeatReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("heartbeat-receipt-invalid");
  if (value.kind !== HEARTBEAT_KIND || value.schemaVersion !== HEARTBEAT_SCHEMA_VERSION) fail("heartbeat-receipt-invalid");
  if (!CREDIT_FREE_NEXT_ACTIONS.includes(value.nextAction)) fail("heartbeat-next-action-invalid");
  if (value.creditCost !== 0 || value.paidFallback === true) fail("heartbeat-paid-contamination");
  if (typeof value.observedAt !== "string" || value.observedAt.length < 20) fail("heartbeat-observed-at-invalid");
  if (typeof value.worldDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.worldDigest)) fail("heartbeat-world-digest-invalid");
  return value;
}

function digestWorld(world) {
  const bounded = {
    head: typeof world?.head === "string" ? world.head.replace(/[^a-f0-9]/gi, "").slice(0, 64).toLowerCase() : null,
    workerIds: Array.isArray(world?.workerIds)
      ? [...new Set(world.workerIds.filter((id) => typeof id === "string").map((id) => id.slice(0, 64)))].sort().slice(0, 32)
      : [],
    taskCounts: sanitizeCounts(world?.taskCounts),
    openIssues: integerOrNull(world?.openIssues),
    openPulls: integerOrNull(world?.openPulls),
  };
  return crypto.createHash("sha256").update(JSON.stringify(bounded)).digest("hex");
}

function sanitizeCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, count]) => typeof key === "string" && key.length <= 40 && Number.isInteger(count) && count >= 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 16),
  );
}

function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function gap(id, state, priority, summary, dependency) {
  return Object.freeze({ id, state, priority, summary, dependency, creditCost: 0, paidFallback: false });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

export function hostedComputeFromLedgerText(text = "") {
  const exhausted = typeof text === "string" && text.includes("api-deployments-free-per-day");
  return Object.freeze({
    vercelDeploymentsToday: exhausted ? 100 : 0,
    vercelDailyCap: 100,
  });
}

export function readCreditFreeRuntime(env = process.env) {
  const ledger = hostedComputeFromLedgerText(env.MAHORAGA_HOSTED_LEDGER_TEXT ?? "");
  const vercelDeploymentsToday = envFilled(env.MAHORAGA_VERCEL_DEPLOYMENTS_TODAY)
    ? envNumber(env.MAHORAGA_VERCEL_DEPLOYMENTS_TODAY, ledger.vercelDeploymentsToday)
    : ledger.vercelDeploymentsToday;
  const vercelDailyCap = envFilled(env.MAHORAGA_VERCEL_DAILY_CAP)
    ? envNumber(env.MAHORAGA_VERCEL_DAILY_CAP, ledger.vercelDailyCap)
    : ledger.vercelDailyCap;
  return Object.freeze({
    spendGrantUsd: envNumber(env.MAHORAGA_SPEND_GRANT_USD, 0),
    platformApiKeyPresent: envFlag(env.MAHORAGA_PLATFORM_API_KEY_PRESENT),
    allowPaidFallback: envFlag(env.MAHORAGA_ALLOW_PAID_FALLBACK),
    localReasonerReady: envFlag(env.MAHORAGA_LOCAL_REASONER_READY),
    vercelDeploymentsToday,
    vercelDailyCap,
    extraVercelProjects: envNumber(env.MAHORAGA_EXTRA_VERCEL_PROJECTS, 0),
    world: Object.freeze({
      head: typeof env.GITHUB_SHA === "string" ? env.GITHUB_SHA : null,
      openIssues: envIntegerOrNull(env.MAHORAGA_OPEN_ISSUES),
      openPulls: envIntegerOrNull(env.MAHORAGA_OPEN_PULLS),
    }),
  });
}

export function runCreditFreeHeartbeatFromEnv({ env = process.env, now = new Date() } = {}) {
  const runtime = readCreditFreeRuntime(env);
  return runCreditFreeHeartbeat({ now, ...runtime });
}

function envFlag(value) {
  return value === "1" || value === "true";
}

function envFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function envNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const receipt = runCreditFreeHeartbeatFromEnv({ now: new Date() });
  console.log(JSON.stringify(receipt));
  if (receipt.nextAction === "refuse-paid-route") process.exitCode = 1;
}

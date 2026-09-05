import crypto from "node:crypto";
import {
  CREDIT_FREE_NEXT_ACTIONS,
  CREDIT_FREE_PROTOCOL_STEPS,
  maintainCreditFreeAutonomy,
  planCreditFreeWork,
  selectCreditFreeExecutionPlane,
  selectCreditFreeGraph,
} from "./credit-free-autonomy.mjs";
import { evaluateDestinyTriggerReadiness } from "./destiny-trigger-trust.mjs";

export const HEARTBEAT_KIND = "credit-free-heartbeat";
export const HEARTBEAT_SCHEMA_VERSION = 1;

export function attestHeartbeatDestinyTrigger({
  manifest = null,
  observation = null,
  now = new Date(),
  modelBackedDispatch = false,
} = {}) {
  const stamped = {
    modelBackedDispatch: modelBackedDispatch === true,
    creditCost: 0,
    paidFallback: false,
  };
  if (manifest == null) {
    return Object.freeze({
      ready: false,
      status: "unknown",
      reason: "destiny-trigger-not-observed",
      actorLogin: null,
      zeroCreditEligible: false,
      ...stamped,
    });
  }
  try {
    const readiness = evaluateDestinyTriggerReadiness(manifest, observation, { now: canonicalNow(now) });
    return Object.freeze({
      ready: readiness.ready === true,
      status: readiness.status,
      reason: readiness.reason,
      actorLogin: readiness.actorLogin ?? null,
      zeroCreditEligible: readiness.zeroCreditEligible === true,
      ...stamped,
    });
  } catch (error) {
    return Object.freeze({
      ready: false,
      status: "unknown",
      reason: boundedReason(error),
      actorLogin: null,
      zeroCreditEligible: false,
      ...stamped,
    });
  }
}

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
  destinyManifest = null,
  destinyObservation = null,
  destinyTrigger = null,
  modelBackedDispatch = false,
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
  const destiny = destinyTrigger == null
    ? attestHeartbeatDestinyTrigger({
      manifest: destinyManifest,
      observation: destinyObservation,
      now,
      modelBackedDispatch,
    })
    : attestProvidedDestiny(destinyTrigger, modelBackedDispatch);
  let nextAction = maintenance.nextAction;
  if (modelBackedDispatch === true && destiny.ready !== true && nextAction !== "refuse-paid-route") {
    nextAction = "hold-planned";
  }
  const executable = nextAction === "dispatch-credit-free";
  return Object.freeze({
    schemaVersion: HEARTBEAT_SCHEMA_VERSION,
    kind: HEARTBEAT_KIND,
    observedAt: maintenance.observedAt,
    intentKind,
    nextAction,
    executable,
    health: maintenance.health,
    plane: maintenance.plane,
    hostedCompute: maintenance.hostedCompute,
    destinyTrigger: destiny,
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
  let destinyUnreadiness = 0;
  for (const receipt of receipts) {
    validateHeartbeatReceipt(receipt);
    nextActions[receipt.nextAction] += 1;
    lastObservedAt = receipt.observedAt;
    if (receipt.health?.ok === true) lastHealthyAt = receipt.observedAt;
    if (receipt.creditCost !== 0 || receipt.paidFallback === true) paidContamination += 1;
    if (receipt.destinyTrigger && receipt.destinyTrigger.ready !== true) destinyUnreadiness += 1;
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
  if (destinyUnreadiness > 0) {
    gaps.push(gap(
      "heartbeat-destiny-trigger-not-ready",
      "hold-planned",
      "p0",
      "Destiny Event Dispatch Lane remains unconfigured, stale, or unknown. Model-backed dispatch stays fail-closed at $0.",
      "dedicated-actor-or-signed-receipt",
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
  if (value.destinyTrigger != null) validateDestinyTrigger(value.destinyTrigger);
  return value;
}

function validateDestinyTrigger(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("heartbeat-destiny-trigger-invalid");
  if (typeof value.ready !== "boolean") fail("heartbeat-destiny-trigger-invalid");
  if (value.creditCost !== 0 || value.paidFallback === true) fail("heartbeat-paid-contamination");
  return value;
}

function attestProvidedDestiny(value, modelBackedDispatch) {
  validateDestinyTrigger(value);
  return Object.freeze({
    ready: value.ready === true,
    status: typeof value.status === "string" ? value.status.slice(0, 64) : "unknown",
    reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "unknown",
    actorLogin: typeof value.actorLogin === "string" ? value.actorLogin.slice(0, 64) : null,
    zeroCreditEligible: value.zeroCreditEligible === true,
    modelBackedDispatch: modelBackedDispatch === true || value.modelBackedDispatch === true,
    creditCost: 0,
    paidFallback: false,
  });
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

function boundedReason(error) {
  const message = typeof error?.message === "string" ? error.message : "destiny-trigger-readiness-invalid";
  return message.slice(0, 80);
}

function canonicalNow(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const receipt = await runHeartbeatCli();
  console.log(JSON.stringify(receipt));
  if (receipt.nextAction === "refuse-paid-route") process.exitCode = 1;
}

async function runHeartbeatCli() {
  let destinyManifest = null;
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { ROOT } = await import("./config.mjs");
    destinyManifest = JSON.parse(await readFile(path.join(ROOT, "config", "destiny-trigger-trust.json"), "utf8"));
  } catch {
    destinyManifest = null;
  }
  let localReasonerReady = false;
  try {
    const { probeLocalReasoner } = await import("./local-reasoner-provider.mjs");
    const probe = await probeLocalReasoner({ timeoutMs: 750 });
    localReasonerReady = probe.verified === true;
  } catch {
    localReasonerReady = false;
  }
  return runCreditFreeHeartbeat({
    now: new Date(),
    localReasonerReady,
    destinyManifest,
    world: {},
  });
}

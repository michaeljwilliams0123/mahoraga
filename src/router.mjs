import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";
import { classifyAutonomyProvider, isCreditFreeWorkerId, selectCreditFreeExecutionPlane } from "./credit-free-autonomy.mjs";

export const routeTask = createTaskRouter();

export function createTaskRouter({ rankRoutes = rankCapabilityRoutes } = {}) {
  return function routeTask(manifest, task, context = {}) {
    const creditFreeDecision = creditFreeGate(task, context);
    if (creditFreeDecision && !creditFreeDecision.ok) {
      return { status: "waiting", reason: creditFreeDecision.reason, worker: null, creditFreeDecision };
    }
    const providerDecision = zeroCreditDecision(task, context);
    if (providerDecision?.status === "waiting") return { status: "waiting", reason: providerDecision.providerId, worker: null, providerDecision };
    const ranked = rankRoutes(manifest, task, context);
    const candidates = ranked.candidates
      .filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId))
      .filter((candidate) => !providerDecision || candidate.costClass === providerDecision.costClass)
      .filter((candidate) => !creditFreeDecision || isCreditFreeWorkerId(candidate.workerId) || (classifyAutonomyProvider(candidate.workerId) === "local-reasoner" && context.localReasonerReady === true));
    const reason = ranked.reason ?? (ranked.candidates.length > 0 ? "worker-excluded" : "routing-evidence-missing");
    if (candidates.length === 0) return { status: "waiting", reason, worker: null, ...(creditFreeDecision ? { creditFreeDecision } : {}) };
    const selected = candidates[0];
    const route = {
      status: "routable",
      reason: null,
      worker: manifest.workers.find((worker) => worker.id === selected.workerId),
      decision: selected,
      alternates: candidates.slice(1),
    };
    const withProvider = providerDecision ? { ...route, providerDecision } : route;
    return creditFreeDecision ? { ...withProvider, creditFreeDecision } : withProvider;
  };
}

export function capabilityIndex(manifest, workerStates = [], now = Date.now()) {
  return buildCapabilityRegistry(manifest, workerStates, now);
}

function creditFreeGate(task, context) {
  if (context.creditFreeRequired !== true && task?.creditFreeRequired !== true && context.providerPolicy !== "credit-free") return null;
  return selectCreditFreeExecutionPlane({
    requestedProvider: task.provider ?? task.requestedProvider ?? "repository",
    spendGrantUsd: context.spendGrantUsd ?? 0,
    platformApiKeyPresent: context.platformApiKeyPresent === true,
    allowPaidFallback: context.allowPaidFallback === true,
    localReasonerReady: context.localReasonerReady === true,
  });
}

function zeroCreditDecision(task, context) {
  return context.providerPolicy === "zero-credit" && isAutonomySelfUpgrade(task) ? selectZeroCreditProvider(context) : null;
}

function isAutonomySelfUpgrade(task) {
  return typeof task.capability === "string" && (task.capability.startsWith("autonomy.") || task.capability.startsWith("self-upgrade."));
}

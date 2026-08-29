import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";

export function routeTask(manifest, task, context = {}) {
  const ranked = rankCapabilityRoutes(manifest, task, context);
  const providerDecision = zeroCreditDecision(task, context);
  if (providerDecision?.status === "waiting") return { status: "waiting", reason: providerDecision.providerId, worker: null, providerDecision };
  const candidates = ranked.candidates
    .filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId))
    .filter((candidate) => !providerDecision || candidate.costClass === providerDecision.costClass);
  if (candidates.length === 0) return { status: "waiting", reason: ranked.reason, worker: null };
  const selected = candidates[0];
  const route = {
    status: "routable",
    reason: null,
    worker: manifest.workers.find((worker) => worker.id === selected.workerId),
    decision: selected,
    alternates: candidates.slice(1),
  };
  return providerDecision ? { ...route, providerDecision } : route;
}

export function capabilityIndex(manifest, workerStates = []) {
  return buildCapabilityRegistry(manifest, workerStates);
}

function zeroCreditDecision(task, context) {
  if (context.providerPolicy !== "zero-credit" || !isAutonomySelfUpgrade(task)) return null;
  return selectZeroCreditProvider(context);
}

function isAutonomySelfUpgrade(task) {
  return typeof task.capability === "string" && (task.capability.startsWith("autonomy.") || task.capability.startsWith("self-upgrade."));
}

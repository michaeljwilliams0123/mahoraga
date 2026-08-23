import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";

export function routeTask(manifest, task, context = {}) {
  const ranked = rankCapabilityRoutes(manifest, task, context);
  const candidates = ranked.candidates.filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId));
  if (candidates.length === 0) return { status: "waiting", reason: ranked.reason, worker: null };
  const selected = candidates[0];
  return {
    status: "routable",
    reason: null,
    worker: manifest.workers.find((worker) => worker.id === selected.workerId),
    decision: selected,
    alternates: candidates.slice(1),
  };
}

export function capabilityIndex(manifest, workerStates = []) {
  return buildCapabilityRegistry(manifest, workerStates);
}


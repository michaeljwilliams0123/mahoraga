import { buildCapabilityRegistry, rankCapabilityRoutes } from "./capability-registry.mjs";

export function routeTask(manifest, task, context = {}) {
  const ranked = rankCapabilityRoutes(manifest, task, context);
  const candidates = ranked.candidates.filter((candidate) => !task.excludedWorkerIds?.includes(candidate.workerId));
  const reason = ranked.reason ?? (ranked.candidates.length > 0 ? "worker-excluded" : "routing-evidence-missing");
  if (candidates.length === 0) return { status: "waiting", reason, worker: null };
  const selected = candidates[0];
  return {
    status: "routable",
    reason: null,
    worker: manifest.workers.find((worker) => worker.id === selected.workerId),
    decision: selected,
    alternates: candidates.slice(1),
  };
}

export function capabilityIndex(manifest, workerStates = [], now = Date.now()) {
  return buildCapabilityRegistry(manifest, workerStates, now);
}


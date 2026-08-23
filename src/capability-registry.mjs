const ROUTABLE_STATUSES = new Set(["healthy", "busy", "starting", "configured"]);

export function buildCapabilityRegistry(manifest, workerStates = []) {
  const stateByWorker = new Map(workerStates.map((state) => [state.workerId, state]));

  return manifest.workers.flatMap((worker) => worker.capabilities.map((capability) => {
    const runtimeState = stateByWorker.get(worker.id);
    return {
      capability,
      workerId: worker.id,
      workerLabel: worker.label,
      enabled: worker.enabled,
      availability: runtimeState?.status ?? (worker.enabled ? "configured" : "disabled"),
      health: ["healthy", "busy"].includes(runtimeState?.status ?? "configured") ? "live" : "not-live",
      interfaceType: worker.routing.interfaceType,
      permissionClass: worker.routing.permissionClass,
      reliability: worker.routing.reliability,
      requiresAttendedDesktop: worker.routing.requiresAttendedDesktop,
      executionType: worker.routing.executionType,
      latencyMs: worker.routing.latencyMs,
      maximumWorkload: worker.routing.maximumWorkload,
      workload: runtimeState?.currentTaskId ? 1 : 0,
      fallbackWorkerIds: [...worker.routing.fallbackWorkerIds],
      costClass: worker.costClass,
      dataClasses: [...worker.dataClasses],
      executionPlane: worker.executionPlane,
      healthProbe: worker.healthProbe,
    };
  }));
}

export function rankCapabilityRoutes(manifest, task, { workerStates = [] } = {}) {
  const allowedCosts = manifest.costModes[task.requestedMode];
  if (!allowedCosts) return { candidates: [], reason: "unknown-cost-mode" };

  const interfaceRank = new Map(manifest.routingPolicy.interfaceOrder.map((value, index) => [value, index]));
  const availabilityRank = new Map(manifest.routingPolicy.availabilityOrder.map((value, index) => [value, index]));
  const candidates = buildCapabilityRegistry(manifest, workerStates)
    .filter((entry) =>
      entry.capability === task.capability &&
      entry.enabled &&
      ROUTABLE_STATUSES.has(entry.availability) &&
      entry.dataClasses.includes(task.dataClass) &&
      allowedCosts.includes(entry.costClass) &&
      entry.reliability >= manifest.routingPolicy.minimumReliability)
    .sort((left, right) =>
      rank(interfaceRank, left.interfaceType) - rank(interfaceRank, right.interfaceType) ||
      allowedCosts.indexOf(left.costClass) - allowedCosts.indexOf(right.costClass) ||
      rank(availabilityRank, left.availability) - rank(availabilityRank, right.availability) ||
      left.workload - right.workload ||
      left.latencyMs - right.latencyMs ||
      right.reliability - left.reliability ||
      left.workerId.localeCompare(right.workerId));

  return { candidates, reason: candidates.length === 0 ? "no-enabled-worker" : null };
}

function rank(index, value) {
  return index.has(value) ? index.get(value) : Number.MAX_SAFE_INTEGER;
}

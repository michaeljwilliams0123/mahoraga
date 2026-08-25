import { capabilityClass, deriveCapabilityReadiness, isCapabilityRoutable } from "./capability-readiness.mjs";

export function buildCapabilityRegistry(manifest, workerStates = [], now = Date.now()) {
  const stateByWorker = new Map(workerStates.map((state) => [state.workerId, state]));

  return manifest.workers.flatMap((worker) => worker.capabilities.map((capability) => {
    const runtimeState = stateByWorker.get(worker.id);
    const recorded = runtimeState?.readiness?.find((item) => item.capability === capability);
    const readiness = deriveCapabilityReadiness({
      process: {
        status: recorded?.processStatus ?? normalizeProcessStatus(runtimeState?.status),
        observedAt: recorded?.processObservedAt ?? runtimeState?.lastHeartbeatAt ?? null,
      },
      provider: {
        status: recorded?.providerStatus ?? "unknown",
        observedAt: recorded?.providerObservedAt ?? null,
      },
      canary: {
        status: recorded?.canaryStatus ?? "never",
        verifiedAt: recorded?.canaryVerifiedAt ?? null,
      },
      capabilityClass: capabilityClass(worker, capability),
    }, now);
    return {
      capability,
      workerId: worker.id,
      workerLabel: worker.label,
      enabled: worker.enabled,
      availability: runtimeState?.status ?? (worker.enabled ? "configured" : "disabled"),
      health: readiness.routable ? "verified" : "not-verified",
      process: readiness.process,
      provider: readiness.provider,
      canary: readiness.canary,
      routable: readiness.routable,
      evidenceLevel: readiness.evidenceLevel,
      lastObservedAt: readiness.lastObservedAt,
      lastVerifiedAt: readiness.lastVerifiedAt,
      routingReason: readiness.reason,
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

export function rankCapabilityRoutes(manifest, task, { workerStates = [], now = Date.now() } = {}) {
  const allowedCosts = manifest.costModes[task.requestedMode];
  if (!allowedCosts) return { candidates: [], reason: "unknown-cost-mode" };

  const interfaceRank = new Map(manifest.routingPolicy.interfaceOrder.map((value, index) => [value, index]));
  const availabilityRank = new Map(manifest.routingPolicy.availabilityOrder.map((value, index) => [value, index]));
  const allowedWorkers = new Set(task.allowedWorkerIds ?? []);
  const matching = buildCapabilityRegistry(manifest, workerStates, now)
    .filter((entry) => entry.capability === task.capability && entry.enabled)
    .sort((left, right) => compareRoutes(left, right, { interfaceRank, availabilityRank, allowedCosts }));
  const staticEligible = matching.filter((entry) =>
    (allowedWorkers.size === 0 || allowedWorkers.has(entry.workerId)) &&
    entry.dataClasses.includes(task.dataClass) &&
    allowedCosts.includes(entry.costClass) &&
    entry.reliability >= manifest.routingPolicy.minimumReliability);

  if (staticEligible.length === 0) {
    const reason = matching.length > 0 && allowedWorkers.size > 0 && !matching.some((entry) => allowedWorkers.has(entry.workerId))
      ? "worker-not-authorized"
      : "no-enabled-worker";
    return { candidates: [], reason };
  }

  const evaluated = staticEligible.map((entry) => ({
    entry,
    eligibility: isCapabilityRoutable(task, {
      routable: entry.routable,
      reason: entry.routingReason,
    }),
  }));
  const candidates = evaluated.filter((item) => item.eligibility.eligible).map((item) => item.entry);
  return {
    candidates,
    reason: candidates.length === 0 ? evaluated[0].eligibility.reason : null,
  };
}

function compareRoutes(left, right, { interfaceRank, availabilityRank, allowedCosts }) {
  return rank(interfaceRank, left.interfaceType) - rank(interfaceRank, right.interfaceType) ||
    allowedCosts.indexOf(left.costClass) - allowedCosts.indexOf(right.costClass) ||
    rank(availabilityRank, sortableAvailability(left)) - rank(availabilityRank, sortableAvailability(right)) ||
    left.workload - right.workload ||
    left.latencyMs - right.latencyMs ||
    right.reliability - left.reliability ||
    left.workerId.localeCompare(right.workerId);
}

function sortableAvailability(entry) {
  if (entry.process.status === "live") return "healthy";
  if (entry.process.status === "busy") return "busy";
  return entry.availability;
}

function normalizeProcessStatus(status) {
  if (status === "healthy") return "live";
  if (status === "busy") return "busy";
  if (["stopped", "starting", "live", "stale", "crashed", "quarantined"].includes(status)) return status;
  return "stopped";
}

function rank(index, value) {
  return index.has(value) ? index.get(value) : Number.MAX_SAFE_INTEGER;
}

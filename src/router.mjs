export function routeTask(manifest, task) {
  const allowedCosts = manifest.costModes[task.requestedMode];
  if (!allowedCosts) return { status: "waiting", reason: "unknown-cost-mode", worker: null };
  const candidates = manifest.workers.filter((worker) =>
    worker.enabled &&
    worker.capabilities.includes(task.capability) &&
    worker.dataClasses.includes(task.dataClass) &&
    allowedCosts.includes(worker.costClass));
  if (candidates.length === 0) return { status: "waiting", reason: "no-enabled-worker", worker: null };
  return { status: "routable", reason: null, worker: candidates[0] };
}

export function capabilityIndex(manifest) {
  return manifest.workers.flatMap((worker) => worker.capabilities.map((capability) => ({
    capability, workerId: worker.id, workerLabel: worker.label, enabled: worker.enabled,
    costClass: worker.costClass, dataClasses: worker.dataClasses,
  })));
}


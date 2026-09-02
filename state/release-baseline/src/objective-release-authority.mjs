import { MAX_INTEGRATION_LEASE_MS } from "./controller-authority.mjs";
import { deriveTaskPolicy, policyTaskInput } from "./task-policy.mjs";

export const AUTONOMY_OBJECTIVE_AUTHORITY = "autonomy-objective-v1";
const LOCAL_PRIMARY = "primary-local-codex";
const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);

export function installObjectiveReleaseAuthority({ database, manifest }) {
  if (!database || typeof database.submitTask !== "function" || typeof database.reconcileObjectives !== "function") throw new TypeError("Objective release database is invalid.");
  if (!manifest || !Array.isArray(manifest.workers)) throw new TypeError("Objective release manifest is invalid.");

  const originalSubmitTask = database.submitTask.bind(database);
  const originalReconcileObjectives = database.reconcileObjectives.bind(database);
  const originalListObjectives = database.listObjectives.bind(database);

  database.submitTask = (input) => {
    if (input?.authoritySource !== AUTONOMY_OBJECTIVE_AUTHORITY) return originalSubmitTask(input);
    const lease = input.capability === "codex.execute" ? requireLocalLease(database, input.allowedPaths) : null;
    const request = {
      intent: input.capability,
      requestedOutcome: input.requestedOutcome,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      priority: input.priority,
      taskArea: input.taskArea,
      completionCriteria: input.completionCriteria,
      maximumAttempts: input.maximumAttempts,
      contentReferences: input.contentReferences ?? [],
      ...(input.capability === "codex.execute" ? {
        baseCommit: input.baseCommit,
        allowedPaths: input.allowedPaths,
        integrationLeaseId: lease.leaseId,
      } : {}),
    };
    const policy = deriveTaskPolicy(request, {
      manifest,
      source: AUTONOMY_OBJECTIVE_AUTHORITY,
      internal: true,
      integrationLease: lease,
    });
    const policyInput = policyTaskInput(request, policy, manifest);
    const task = originalSubmitTask({
      ...policyInput,
      taskType: input.taskType ?? policyInput.taskType,
      conversationId: input.conversationId ?? null,
      excludedWorkerIds: Array.isArray(input.excludedWorkerIds) ? input.excludedWorkerIds : [],
    });
    if (task.capability === "codex.execute") database.createCodexBuilderSession({ taskId: task.id, authoritySessionId: policy.authoritySessionId });
    return task;
  };

  database.reconcileObjectives = () => {
    const objectives = originalListObjectives(500).filter((item) => ["planned", "running"].includes(item.status));
    const readyCodex = firstReadyCodexTask(objectives);
    const lease = prepareObjectiveLease(database, readyCodex);
    const allowedObjectiveIds = new Set(objectives.filter((objective) => objectiveCompatibleWithLease(objective, lease)).map((objective) => objective.id));
    const priorListObjectives = database.listObjectives;
    database.listObjectives = (limit = 100) => originalListObjectives(limit).filter((objective) => allowedObjectiveIds.has(objective.id));
    try {
      return originalReconcileObjectives();
    } finally {
      database.listObjectives = priorListObjectives;
    }
  };

  return Object.freeze({
    restore() {
      database.submitTask = originalSubmitTask;
      database.reconcileObjectives = originalReconcileObjectives;
      database.listObjectives = originalListObjectives;
    },
  });
}

function prepareObjectiveLease(database, readyCodex) {
  let lease = database.getIntegrationLease();
  if (lease?.controllerId === LOCAL_PRIMARY && lease.purpose.startsWith("objective:") && !database.hasActiveIntegrationLeaseTask(lease.leaseId)) {
    database.releaseIntegrationLease({ controllerId: LOCAL_PRIMARY, leaseId: lease.leaseId });
    lease = null;
  }
  if (!readyCodex) return lease;
  if (!lease) {
    const acquired = database.acquireIntegrationLease({
      controllerId: LOCAL_PRIMARY,
      durationMs: MAX_INTEGRATION_LEASE_MS,
      purpose: `objective:${readyCodex.objectiveId}`,
      paths: readyCodex.definition.allowedPaths,
    });
    lease = acquired.lease;
  }
  return lease;
}

function firstReadyCodexTask(objectives) {
  for (const objective of objectives) {
    const byId = new Map(objective.tasks.map((task) => [task.id, task]));
    for (const task of objective.tasks) {
      if (task.status !== "planned" || task.definition.capability !== "codex.execute") continue;
      if (!task.definition.dependsOn.every((dependency) => byId.get(dependency)?.status === "completed")) continue;
      return { objectiveId: objective.id, definition: task.definition };
    }
  }
  return null;
}

function objectiveCompatibleWithLease(objective, lease) {
  const byId = new Map(objective.tasks.map((task) => [task.id, task]));
  const ready = objective.tasks.filter((task) => task.status === "planned" && task.definition.capability === "codex.execute" && task.definition.dependsOn.every((dependency) => byId.get(dependency)?.status === "completed"));
  if (ready.length === 0) return true;
  if (!lease || lease.controllerId !== LOCAL_PRIMARY || lease.purpose !== `objective:${objective.id}`) return false;
  return ready.every((task) => leaseCovers(lease, task.definition.allowedPaths));
}

function requireLocalLease(database, allowedPaths) {
  const lease = database.getIntegrationLease();
  if (!lease || lease.controllerId !== LOCAL_PRIMARY || !leaseCovers(lease, allowedPaths)) {
    const error = new Error("objective-integration-lease-unavailable");
    error.code = "objective-integration-lease-unavailable";
    throw error;
  }
  return lease;
}

function leaseCovers(lease, paths) {
  if (!Array.isArray(paths) || paths.length < 1 || !Array.isArray(lease?.paths)) return false;
  return paths.every((requested) => lease.paths.some((root) => requested === root || requested.startsWith(`${root}/`)));
}

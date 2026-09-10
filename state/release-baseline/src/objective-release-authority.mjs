import { MAX_INTEGRATION_LEASE_MS } from "./controller-authority.mjs";
import { deriveTaskPolicy, policyTaskInput } from "./task-policy.mjs";

export const AUTONOMY_OBJECTIVE_AUTHORITY = "autonomy-objective-v1";
const LOCAL_PRIMARY = "primary-local-codex";
const CONTAINED_CAPABILITIES = new Set(["codex.execute", "self.evolve"]);

export function createObjectiveReleaseAuthority({ manifest }) {
  if (!manifest || !Array.isArray(manifest.workers)) throw new TypeError("Objective release manifest is invalid.");
  return Object.freeze({
    authoritySource: AUTONOMY_OBJECTIVE_AUTHORITY,
    submit(database, input) {
      const lease = CONTAINED_CAPABILITIES.has(input.capability) ? requireLocalLease(database, input.allowedPaths) : null;
      const request = {
        intent: input.capability, requestedOutcome: input.requestedOutcome, idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId, priority: input.priority, taskArea: input.taskArea,
        completionCriteria: input.completionCriteria, maximumAttempts: input.maximumAttempts,
        contentReferences: input.contentReferences ?? [], authoritySessionId: input.authoritySessionId ?? null,
        ...(CONTAINED_CAPABILITIES.has(input.capability) ? {
          baseCommit: input.baseCommit, allowedPaths: input.allowedPaths, integrationLeaseId: lease.leaseId,
        } : {}),
      };
      const attendedSession = input.authoritySessionId ? { active: true, sessionId: input.authoritySessionId } : null;
      const policy = deriveTaskPolicy(request, { manifest, source: AUTONOMY_OBJECTIVE_AUTHORITY, internal: true, integrationLease: lease, attendedSession });
      const policyInput = policyTaskInput(request, policy, manifest);
      const task = database.submitTask({ ...policyInput, taskType: input.taskType ?? policyInput.taskType,
        conversationId: input.conversationId ?? null, excludedWorkerIds: Array.isArray(input.excludedWorkerIds) ? input.excludedWorkerIds : [] });
      if (task.capability === "codex.execute") database.createCodexBuilderSession({ taskId: task.id, authoritySessionId: policy.authoritySessionId });
      return task;
    },
    filterObjectives(database, objectives) {
      const readyContained = firstReadyContainedTask(objectives);
      const lease = prepareObjectiveLease(database, readyContained);
      return objectives.filter((objective) => objectiveCompatibleWithLease(objective, lease));
    },
  });
}

export function installObjectiveReleaseAuthority({ database, manifest }) {
  if (!database || typeof database.configureObjectiveReleaseAuthority !== "function") throw new TypeError("Objective release database is invalid.");
  const authority = createObjectiveReleaseAuthority({ manifest });
  database.configureObjectiveReleaseAuthority(authority);
  return Object.freeze({ restore() { database.configureObjectiveReleaseAuthority(null); } });
}

function prepareObjectiveLease(database, readyCodex) {
  let lease = readyCodex ? database.findIntegrationLeaseForPaths(readyCodex.definition.allowedPaths, { controllerId: LOCAL_PRIMARY }) : null;
  for (const owned of database.listIntegrationLeases().filter((item) => item.controllerId === LOCAL_PRIMARY && item.purpose.startsWith("objective:"))) {
    if (database.hasActiveIntegrationLeaseTask(owned.leaseId)) continue;
    if (readyCodex && owned.leaseId === lease?.leaseId) continue;
    database.releaseIntegrationLease({ controllerId: LOCAL_PRIMARY, leaseId: owned.leaseId });
  }
  if (!readyCodex) return lease;
  if (!lease) {
    const acquired = database.acquireIntegrationLease({ controllerId: LOCAL_PRIMARY, durationMs: MAX_INTEGRATION_LEASE_MS,
      purpose: `objective:${readyCodex.objectiveId}`, paths: readyCodex.definition.allowedPaths });
    lease = acquired.acquired ? acquired.lease : null;
  }
  return lease;
}

function firstReadyContainedTask(objectives) {
  for (const objective of objectives) {
    const byId = new Map(objective.tasks.map((task) => [task.localTaskId, task]));
    for (const task of objective.tasks) {
      if (task.status !== "planned" || !CONTAINED_CAPABILITIES.has(task.definition.capability)) continue;
      if (!task.definition.dependsOn.every((dependency) => byId.get(dependency)?.status === "completed")) continue;
      return { objectiveId: objective.id, definition: task.definition };
    }
  }
  return null;
}

function objectiveCompatibleWithLease(objective, lease) {
  const byId = new Map(objective.tasks.map((task) => [task.localTaskId, task]));
  const ready = objective.tasks.filter((task) => task.status === "planned" && CONTAINED_CAPABILITIES.has(task.definition.capability)
    && task.definition.dependsOn.every((dependency) => byId.get(dependency)?.status === "completed"));
  if (ready.length === 0) return true;
  if (!lease || lease.controllerId !== LOCAL_PRIMARY || lease.purpose !== `objective:${objective.id}`) return false;
  return ready.every((task) => leaseCovers(lease, task.definition.allowedPaths));
}

function requireLocalLease(database, allowedPaths) {
  const lease = database.findIntegrationLeaseForPaths(allowedPaths, { controllerId: LOCAL_PRIMARY });
  if (!lease) { const error = new Error("objective-integration-lease-unavailable"); error.code = "objective-integration-lease-unavailable"; throw error; }
  return lease;
}

function leaseCovers(lease, paths) {
  if (!Array.isArray(paths) || paths.length < 1 || !Array.isArray(lease?.paths)) return false;
  return paths.every((requested) => lease.paths.some((root) => requested === root || requested.startsWith(`${root}/`)));
}

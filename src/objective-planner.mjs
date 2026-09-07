const PLANNER_VERSION = "objective-planner-v1";
const UNHEALTHY_WORKER_STATES = new Set(["crashed", "hung", "quarantined", "stale"]);
const ACTIVE_LEASE_GRACE_MS = 5_000;

export function planWorldStateActions(snapshot, { now = Date.now() } = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw plannerError("world-state-invalid");
  if (!Number.isFinite(now) || now < 0) throw plannerError("planner-clock-invalid");

  const actions = [];
  const workers = Array.isArray(snapshot.workers) ? snapshot.workers : [];
  const unhealthyWorkers = workers
    .filter((worker) => UNHEALTHY_WORKER_STATES.has(String(worker?.status ?? "").toLowerCase()))
    .map((worker) => String(worker?.workerId ?? worker?.id ?? "unknown"))
    .sort();

  if (unhealthyWorkers.length > 0) {
    actions.push(action({
      id: "inspect-unhealthy-workers",
      intent: "system.health",
      priority: "critical",
      reasonCode: "worker-health-degraded",
      completionCriteria: "worker-health-reconciled",
      evidence: { count: unhealthyWorkers.length, workerIds: unhealthyWorkers.slice(0, 16) },
    }));
  }

  const expiredLeases = (Array.isArray(snapshot.activeLeases) ? snapshot.activeLeases : [])
    .filter((lease) => {
      const expiresAt = Date.parse(String(lease?.leaseExpiresAt ?? ""));
      return Number.isFinite(expiresAt) && expiresAt + ACTIVE_LEASE_GRACE_MS < now;
    })
    .map((lease) => String(lease?.id ?? "unknown"))
    .sort();

  if (expiredLeases.length > 0) {
    actions.push(action({
      id: "reconcile-expired-leases",
      intent: "system.health",
      priority: "critical",
      reasonCode: "task-lease-expired",
      completionCriteria: "expired-leases-recovered",
      evidence: { count: expiredLeases.length, leaseIds: expiredLeases.slice(0, 16) },
    }));
  }

  if (snapshot.repository?.verified !== true) {
    actions.push(action({
      id: "verify-repository-observation",
      intent: "repository.status",
      priority: "high",
      reasonCode: "repository-state-unverified",
      completionCriteria: "repository-head-observed",
      evidence: {},
    }));
  }

  const failedTasks = boundedCount(snapshot.taskCounts?.failed);
  if (failedTasks > 0) {
    actions.push(action({
      id: "inspect-failed-tasks",
      intent: "system.health",
      priority: "high",
      reasonCode: "task-failures-present",
      completionCriteria: "failed-task-cause-classified",
      evidence: { count: failedTasks },
    }));
  }

  const failedObjectives = (Array.isArray(snapshot.objectives) ? snapshot.objectives : [])
    .filter((objective) => String(objective?.status ?? "").toLowerCase() === "failed")
    .map((objective) => String(objective?.id ?? "unknown"))
    .sort();

  if (failedObjectives.length > 0) {
    actions.push(action({
      id: "inspect-failed-objectives",
      intent: "system.health",
      priority: "high",
      reasonCode: "objective-failures-present",
      completionCriteria: "failed-objective-cause-classified",
      evidence: { count: failedObjectives.length, objectiveIds: failedObjectives.slice(0, 16) },
    }));
  }

  const deduped = dedupeActions(actions).slice(0, 8);
  return Object.freeze({
    schemaVersion: 1,
    plannerVersion: PLANNER_VERSION,
    state: deduped.length > 0 ? "attention-required" : "stable",
    automaticMutationAllowed: false,
    actionCount: deduped.length,
    actions: Object.freeze(deduped),
  });
}

export function objectivePlannerVersion() {
  return PLANNER_VERSION;
}

function action({ id, intent, priority, reasonCode, completionCriteria, evidence }) {
  return Object.freeze({
    id,
    intent,
    priority,
    reasonCode,
    completionCriteria,
    authority: "world-state-observer",
    mutation: false,
    evidence: Object.freeze({ ...evidence }),
  });
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((item) => {
    const key = `${item.intent}:${item.reasonCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boundedCount(value) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1_000_000) : 0;
}

function plannerError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

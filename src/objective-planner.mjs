import { createHash } from "node:crypto";

const PLANNER_VERSION = "objective-planner-v1";
const UNHEALTHY_WORKER_STATES = new Set(["crashed", "hung", "quarantined", "stale"]);
const OWNER_MUTATION_OPERATIONS = Object.freeze(["read", "create", "modify", "administer"]);
const ACTIVE_LEASE_GRACE_MS = 5_000;

export function planWorldStateActions(snapshot, {
  now = Date.now(),
  priorPlanFingerprint = null,
  replanTrigger = null,
} = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw plannerError("world-state-invalid");
  if (!Number.isFinite(now) || now < 0) throw plannerError("planner-clock-invalid");

  const actions = [];
  const objectives = Array.isArray(snapshot.objectives) ? snapshot.objectives : [];
  assertAcyclicDependencies(objectives);

  const objectiveById = new Map(objectives.map((objective) => [String(objective?.id ?? "unknown"), objective]));
  for (const objective of objectives) {
    const objectiveId = String(objective?.id ?? "unknown");
    if (String(objective?.status ?? "").toLowerCase() !== "pending") continue;

    const deadline = Date.parse(String(objective?.deadline ?? ""));
    if (Number.isFinite(deadline) && deadline < now) {
      actions.push(action({
        id: `escalate-overdue-objective-${objectiveId}`,
        intent: "objective.plan",
        priority: "critical",
        reasonCode: "objective-overdue",
        completionCriteria: "objective-deadline-reconciled",
        disposition: "escalate",
        evidence: { objectiveId },
      }));
      continue;
    }

    const dependencies = Array.isArray(objective?.dependsOn)
      ? [...new Set(objective.dependsOn.map(String))].sort()
      : [];
    const blockedBy = dependencies.filter((id) =>
      String(objectiveById.get(id)?.status ?? "missing").toLowerCase() !== "completed"
    );
    if (blockedBy.length > 0) {
      actions.push(action({
        id: `hold-objective-${objectiveId}`,
        intent: "objective.plan",
        priority: "high",
        reasonCode: "objective-dependencies-blocked",
        completionCriteria: "objective-dependencies-completed",
        disposition: "hold",
        evidence: { objectiveId, blockedBy },
      }));
      continue;
    }

    const selected = selectRiskAdjustedAlternative(objective?.alternatives);
    actions.push(action({
      id: `execute-ready-objective-${objectiveId}`,
      intent: "objective.plan",
      priority: "high",
      reasonCode: "objective-ready",
      completionCriteria: "objective-progress-observed",
      disposition: "execute",
      evidence: {
        objectiveId,
        ...(selected ? {
          selectedAlternativeId: selected.id,
          riskAdjustedValue: selected.riskAdjustedValue,
        } : {}),
      },
    }));
  }

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

  const failedObjectives = objectives
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

  const providerErrors = (Array.isArray(snapshot.providers) ? snapshot.providers : [])
    .filter((provider) => typeof provider?.error === "string" && provider.error.trim().length > 0)
    .map((provider) => String(provider?.id ?? "unknown"))
    .sort();

  if (providerErrors.length > 0) {
    actions.push(action({
      id: "remediate-provider-errors",
      intent: "provider.gap",
      priority: "high",
      reasonCode: "provider-errors-present",
      completionCriteria: "provider-errors-remediated",
      authority: "owner-authorized-github-operator",
      mutation: true,
      operations: OWNER_MUTATION_OPERATIONS,
      evidence: { count: providerErrors.length, providerIds: providerErrors.slice(0, 16) },
    }));
  }

  const deduped = dedupeActions(actions).slice(0, 8);
  const planCore = {
    schemaVersion: 1,
    plannerVersion: PLANNER_VERSION,
    state: deduped.length > 0 ? "attention-required" : "stable",
    automaticMutationAllowed: deduped.some((item) => item.mutation === true),
    actionCount: deduped.length,
    actions: Object.freeze(deduped),
  };
  const fingerprint = sha256(stableStringify({ snapshot, now, plan: planCore }));
  const planReceipt = Object.freeze({ fingerprint });
  const result = { ...planCore, planReceipt };
  if (priorPlanFingerprint !== null || replanTrigger !== null) {
    if (typeof priorPlanFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(priorPlanFingerprint)) {
      throw plannerError("planner-prior-fingerprint-invalid");
    }
    if (typeof replanTrigger !== "string" || replanTrigger.trim().length === 0) {
      throw plannerError("planner-replan-trigger-invalid");
    }
    result.replanReceipt = Object.freeze({
      priorPlanFingerprint,
      newPlanFingerprint: fingerprint,
      reasonCode: replanTrigger,
    });
  }
  return Object.freeze(result);
}

export function objectivePlannerVersion() {
  return PLANNER_VERSION;
}

function action({
  id,
  intent,
  priority,
  reasonCode,
  completionCriteria,
  evidence,
  authority = "world-state-observer",
  mutation = false,
  operations = null,
  disposition = null,
}) {
  const planned = {
    id,
    intent,
    priority,
    reasonCode,
    completionCriteria,
    authority,
    mutation,
  };
  if (operations !== null) planned.operations = Object.freeze([...operations]);
  if (disposition !== null) planned.disposition = disposition;
  planned.evidence = Object.freeze({ ...evidence });
  return Object.freeze(planned);
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


function selectRiskAdjustedAlternative(alternatives) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null;
  const ranked = alternatives
    .filter((item) => Number.isFinite(item?.expectedValue) && Number.isFinite(item?.risk))
    .map((item) => ({
      id: String(item?.id ?? "unknown"),
      riskAdjustedValue: normalizeNumber(item.expectedValue - item.risk),
    }))
    .sort((a, b) => b.riskAdjustedValue - a.riskAdjustedValue || a.id.localeCompare(b.id));
  return ranked[0] ?? null;
}

function assertAcyclicDependencies(objectives) {
  const graph = new Map();
  for (const objective of objectives) {
    const id = String(objective?.id ?? "unknown");
    graph.set(id, Array.isArray(objective?.dependsOn) ? objective.dependsOn.map(String) : []);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw plannerError("planner-dependency-cycle");
    if (visited.has(id) || !graph.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...graph.keys()].sort()) visit(id);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeNumber(value) {
  return Number(Number(value).toFixed(12));
}

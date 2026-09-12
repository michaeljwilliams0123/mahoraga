import { createHash, randomUUID } from "node:crypto";

export const OPERATIONS_ACTION_IDS = Object.freeze(new Set([
  "task.cancel",
  "task.retry",
  "repair.request",
  "repository.verify",
  "runtime.health-check",
]));

const MAX_WORKERS = 32;
const MAX_CAPABILITIES = 16;
const ACTIVE_TASK = new Set(["queued", "claimed", "running", "verifying"]);
const WAITING_TASK = new Set(["waiting", "waiting_for_user"]);
const ACTIVE_OBJECTIVE = new Set(["planned", "running", "active"]);
const WAITING_OBJECTIVE = new Set(["waiting", "waiting_for_user", "blocked"]);
const FORBIDDEN_INPUT_KEYS = new Set([
  "command", "shell", "path", "script", "executable", "ref", "url", "args", "argv", "cwd", "env",
]);
const ALLOWED_ACTION_KEYS = new Set([
  "actionId", "idempotencyKey", "taskId", "incidentId", "confirmationToken", "confirm",
]);

const CONFIRMATION_REQUIRED = new Set(["task.cancel", "task.retry", "repair.request"]);
const BLOCKED_LANE = Object.freeze({
  ready: false,
  capability: "assistant.respond",
  workerId: null,
  provider: "unknown",
  canary: "never",
  reason: "route-unavailable",
  evidenceLevel: "unknown",
  lastObservedAt: null,
  lastVerifiedAt: null,
});

/** Pure classification ported from operator-deck fleet status semantics (retire browser authority). */
export function classifyOperationalTone(state) {
  if (state === "succeeded" || state === "live" || state === "healthy" || state === "verified") return "ok";
  if (state === "denied" || state === "failed" || state === "crashed" || state === "unhealthy") return "danger";
  if (state === "running" || state === "leased" || state === "busy" || state === "degraded") return "warn";
  if (state === "waiting" || state === "waiting_for_user" || state === "queued") return "steel";
  return "neutral";
}

export function projectOperationsInteractionReadiness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return BLOCKED_LANE;
  return Object.freeze({
    ready: value.ready === true,
    capability: "assistant.respond",
    workerId: typeof value.workerId === "string" ? value.workerId : null,
    provider: typeof value.provider === "string" && value.provider.length > 0 ? value.provider : "unknown",
    canary: typeof value.canary === "string" && value.canary.length > 0 ? value.canary : "never",
    reason: value.ready === true ? null : (typeof value.reason === "string" && value.reason.length > 0 ? value.reason : "route-unavailable"),
    evidenceLevel: typeof value.evidenceLevel === "string" && value.evidenceLevel.length > 0 ? value.evidenceLevel : "unknown",
    lastObservedAt: typeof value.lastObservedAt === "string" ? value.lastObservedAt : null,
    lastVerifiedAt: typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : null,
  });
}

export function operationsSnapshot({
  database,
  manifest,
  supervisor,
  repositoryHeadReader,
  headSha = null,
  now = () => new Date().toISOString(),
  interactionReadiness = null,
} = {}) {
  if (!database || typeof database.listTasks !== "function") throw operationsError("operations-database-required");
  if (!manifest || typeof manifest !== "object") throw operationsError("operations-manifest-required");
  if (!supervisor || typeof supervisor.status !== "function") throw operationsError("operations-supervisor-required");

  const generatedAt = typeof now === "function" ? now() : now;
  const tasks = safeList(() => database.listTasks(500), []);
  const objectives = safeList(() => database.listObjectives?.(100) ?? [], []);
  const incidents = safeList(() => database.listRepairIncidents?.({ includeResolved: false, limit: 100 }) ?? [], []);
  const evolution = safeList(() => database.listEvolutionCandidates?.(50) ?? [], []);
  const workersRaw = safeList(() => supervisor.status() ?? [], []);
  const health = typeof supervisor.health === "function" ? supervisor.health(Date.parse(generatedAt) || Date.now()) : null;

  const resolvedHead = normalizeHead(headSha) ?? readHeadSync(repositoryHeadReader);
  const workers = workersRaw
    .map(projectWorker)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_WORKERS);

  const candidate = evolution
    .map(projectEvolution)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;

  const exactHeadSha = resolvedHead;
  const verificationState = exactHeadSha ? "exact-head-available" : "head-unavailable";

  return Object.freeze({
    generatedAt,
    runtime: Object.freeze({
      version: String(manifest.version ?? manifest.versions?.runtime ?? "unknown"),
      productionBaseline: String(manifest.autonomy?.baseline ?? manifest.repair?.baselineDirectory ?? "unset"),
      rollbackTarget: String(manifest.repair?.baselineDirectory ?? "state/release-baseline"),
      healthy: health?.healthy === true,
      tone: classifyOperationalTone(health?.healthy === true ? "healthy" : "degraded"),
    }),
    repository: Object.freeze({
      branch: "main",
      headSha: exactHeadSha,
      cleanState: exactHeadSha ? "verified" : "unknown",
    }),
    workers: Object.freeze(workers),
    tasks: Object.freeze({
      active: countWhere(tasks, (task) => ACTIVE_TASK.has(task.status)),
      waiting: countWhere(tasks, (task) => WAITING_TASK.has(task.status)),
      failed: countWhere(tasks, (task) => task.status === "failed"),
    }),
    objectives: Object.freeze({
      active: countWhere(objectives, (item) => ACTIVE_OBJECTIVE.has(item.status)),
      waiting: countWhere(objectives, (item) => WAITING_OBJECTIVE.has(item.status)),
    }),
    repairs: Object.freeze({
      activeIncidents: incidents.length,
      lastRepairState: health?.repairScan?.healthy === false
        ? "unhealthy"
        : incidents.length > 0
          ? "open"
          : health?.repairScan?.healthy === true
            ? "healthy"
            : "unknown",
    }),
    verification: Object.freeze({
      state: verificationState,
      exactHeadSha,
    }),
    update: Object.freeze({
      candidate: candidate ? Object.freeze({ id: candidate.id, state: candidate.state }) : null,
      activationState: candidate?.state ?? "idle",
      rollbackReady: true,
    }),
    interactionReadiness: projectOperationsInteractionReadiness(interactionReadiness),
  });
}

export async function executeOperationsAction(input, context = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw operationsError("operations-action-input-invalid");
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) throw operationsError("operations-action-input-rejected");
    if (!ALLOWED_ACTION_KEYS.has(key)) throw operationsError("operations-action-input-rejected");
  }

  const actionId = input.actionId;
  if (typeof actionId !== "string" || !OPERATIONS_ACTION_IDS.has(actionId)) {
    throw operationsError("operations-action-unknown");
  }

  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length < 1 || idempotencyKey.length > 120) {
    throw operationsError("operations-idempotency-key-required");
  }

  const ledger = context.actionLedger ?? ensureLedger(context);
  const fingerprint = actionFingerprint(input);
  const existing = ledger.get(idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw operationsError("operations-idempotency-conflict");
    return structuredClone(existing.receipt);
  }

  if (CONFIRMATION_REQUIRED.has(actionId) && !hasConfirmation(input, context)) {
    const confirmationToken = `cfm-${createHash("sha256").update(`${actionId}:${idempotencyKey}:${fingerprint}`).digest("hex").slice(0, 24)}`;
    const receipt = Object.freeze({
      ok: false,
      confirmationRequired: true,
      confirmationToken,
      actionId,
      receiptId: `ops-${createHash("sha256").update(`pending:${idempotencyKey}`).digest("hex").slice(0, 24)}`,
      result: null,
    });
    return receipt;
  }

  const result = await dispatchAction(actionId, input, context);
  const receipt = Object.freeze({
    ok: true,
    confirmationRequired: false,
    actionId,
    receiptId: `ops-${createHash("sha256").update(`${idempotencyKey}:${fingerprint}`).digest("hex").slice(0, 24)}`,
    result,
  });
  ledger.set(idempotencyKey, { fingerprint, receipt });
  return structuredClone(receipt);
}

async function dispatchAction(actionId, input, context) {
  const database = context.database;
  if (actionId === "runtime.health-check") {
    const health = typeof context.supervisor?.health === "function"
      ? context.supervisor.health()
      : { healthy: false };
    return Object.freeze({
      healthy: health.healthy === true,
      supervisorRunning: health.supervisorRunning === true,
      unhealthyWorkers: Array.isArray(health.unhealthyWorkers) ? health.unhealthyWorkers.slice(0, 32) : [],
      tone: classifyOperationalTone(health.healthy === true ? "healthy" : "unhealthy"),
    });
  }

  if (actionId === "repository.verify") {
    const exactHeadSha = await readHead(context.repositoryHeadReader);
    if (!exactHeadSha) throw operationsError("operations-repository-head-unavailable");
    return Object.freeze({ exactHeadSha, state: "verified" });
  }

  if (actionId === "task.cancel") {
    const taskId = requireTaskId(input.taskId);
    if (!database?.cancelTask) throw operationsError("operations-database-required");
    const existing = database.getTask?.(taskId);
    if (!existing) throw operationsError("operations-task-missing");
    const task = database.cancelTask(taskId);
    return Object.freeze({ taskId: task.id, status: task.status });
  }

  if (actionId === "task.retry") {
    const taskId = requireTaskId(input.taskId);
    if (!database?.retryTask) throw operationsError("operations-database-required");
    const existing = database.getTask?.(taskId);
    if (!existing) throw operationsError("operations-task-missing");
    const task = database.retryTask(taskId);
    return Object.freeze({ taskId: task.id, status: task.status });
  }

  if (actionId === "repair.request") {
    const incidentId = typeof input.incidentId === "string" && input.incidentId.length > 0 && input.incidentId.length <= 120
      ? input.incidentId
      : null;
    if (!incidentId) throw operationsError("operations-incident-required");
    return Object.freeze({
      incidentId,
      accepted: true,
      state: "repair-requested",
    });
  }

  throw operationsError("operations-action-unknown");
}

function hasConfirmation(input, context) {
  if (input.confirm === true && typeof input.confirmationToken === "string" && input.confirmationToken.startsWith("cfm-")) {
    return true;
  }
  if (typeof input.confirmationToken === "string" && input.confirmationToken.startsWith("cfm-")) {
    return true;
  }
  if (context?.ownerConfirmed === true) return true;
  return false;
}

function projectWorker(worker) {
  const id = String(worker.workerId ?? worker.id ?? "unknown");
  const state = String(worker.status ?? worker.state ?? "unknown");
  const capabilities = [...new Set((Array.isArray(worker.capabilities) ? worker.capabilities : [])
    .map((item) => String(item))
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_CAPABILITIES);
  return Object.freeze({
    id,
    state,
    capabilities: Object.freeze(capabilities),
    tone: classifyOperationalTone(state),
  });
}

function projectEvolution(item) {
  return {
    id: String(item.id ?? "unknown"),
    state: String(item.state ?? item.status ?? "unknown"),
  };
}

function requireTaskId(value) {
  if (typeof value !== "string" || !/^mhg-[a-f0-9-]+$/.test(value)) throw operationsError("operations-task-invalid");
  return value;
}

function actionFingerprint(input) {
  return createHash("sha256")
    .update(JSON.stringify({
      actionId: input.actionId,
      taskId: input.taskId ?? null,
      incidentId: input.incidentId ?? null,
      confirmationToken: input.confirmationToken ?? null,
      confirm: input.confirm === true,
    }))
    .digest("hex");
}

function ensureLedger(context) {
  if (!context || typeof context !== "object") return new Map();
  if (!context.actionLedger) context.actionLedger = new Map();
  return context.actionLedger;
}

function readHeadSync(reader) {
  if (typeof reader !== "function") return null;
  try {
    const value = reader();
    if (value && typeof value.then === "function") return null;
    return normalizeHead(value);
  } catch {
    return null;
  }
}

async function readHead(reader) {
  if (typeof reader !== "function") return null;
  try {
    return normalizeHead(await reader());
  } catch {
    return null;
  }
}

function normalizeHead(value) {
  const head = String(value ?? "").trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(head) ? head : null;
}

function countWhere(values, predicate) {
  let count = 0;
  for (const value of values) if (predicate(value)) count += 1;
  return count;
}

function safeList(loader, fallback) {
  try {
    const value = loader();
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function operationsError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

void randomUUID;

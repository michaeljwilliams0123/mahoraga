import { createHash } from "node:crypto";
import { classifyTaskIntent } from "./task-intent.mjs";
import { capabilityIndex } from "./router.mjs";

const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);

export function createConversationGateway({ database, manifest, supervisor, submitTask, capabilityResolver = null } = {}) {
  if (!database || typeof database.createConversationRun !== "function") throw gatewayError("gateway-database-required");
  if (!manifest || !supervisor || typeof submitTask !== "function") throw gatewayError("gateway-dependency-required");
  const listeners = new Map();
  const resolveCapabilities = capabilityResolver ?? (() => capabilityIndex(manifest, supervisor.status()));

  const notify = (event) => {
    for (const listener of listeners.get(event.runId) ?? []) listener(event);
    return event;
  };
  const emit = (runId, type, payload, options) => notify(database.appendRunEvent(runId, type, payload, options));

  const api = {
    createRun(input, context = {}) {
      const request = validateRunInput(input);
      let conversationId = request.conversationId;
      if (conversationId === null) {
        conversationId = database.createConversation({
          title: conversationTitle(request.content), initialMessage: request.content,
          classification: request.classification,
        }).id;
      } else {
        if (!database.getConversation(conversationId)) throw gatewayError("run-conversation-missing");
        database.addConversationMessage({ conversationId, role: "user", content: request.content, classification: request.classification });
      }
      let run = database.createConversationRun({ sessionId: request.sessionId, conversationId, idempotencyKey: request.idempotencyKey });
      if (run.taskId) return { run, intent: null, task: database.getTask(run.taskId) };
      const available = api.capabilities();
      const intent = classifyTaskIntent({ content: request.content, attachmentCount: request.attachmentCount, availableCapabilities: available.filter((item) => item.routable).map((item) => item.capability) });
      emit(run.id, "run-start", {
        requestSha256: digest(request.content), requestBytes: Buffer.byteLength(request.content, "utf8"),
        intentKind: intent.intentKind, capability: intent.capability, attachmentCount: request.attachmentCount,
      });
      if (!intent.capability) {
        emit(run.id, "run-failed", { reasonCode: intent.reasonCode, limitationCount: intent.limitations.length });
        return { run: database.getConversationRun(run.id), intent, task: null };
      }
      try {
        const task = submitTask({
          intent: intent.capability,
          requestedOutcome: request.content,
          idempotencyKey: `run:${request.idempotencyKey}`,
          correlationId: run.id,
          conversationId,
          taskArea: intent.intentKind,
          completionCriteria: "worker-verified",
        }, context);
        run = database.attachConversationRunTask(run.id, task.id);
        return { run, intent, task };
      } catch (error) {
        emit(run.id, "run-failed", { reasonCode: boundedCode(error?.code ?? "task-intake-failed") });
        throw error;
      }
    },

    cancelRun(runId) {
      const prior = database.getConversationRun(runId);
      if (!prior) throw gatewayError("run-missing");
      const run = database.cancelConversationRun(runId);
      const event = database.listRunEvents(runId, { afterEventId: 0 }).at(-1);
      if (event?.type === "run-cancelled") notify(event);
      return run;
    },

    replay(runId, afterEventId = 0) {
      projectTaskState(database, runId, emit);
      return database.listRunEvents(runId, { afterEventId });
    },

    capabilities() {
      const values = resolveCapabilities();
      if (!Array.isArray(values)) throw gatewayError("gateway-capabilities-invalid");
      return values.map((item) => Object.freeze({
        capability: item.capability,
        routable: item.routable === true,
        workerIds: Array.isArray(item.workerIds) ? [...item.workerIds] : item.workerId ? [item.workerId] : [],
      })).sort((left, right) => left.capability.localeCompare(right.capability));
    },

    getImprovement(candidateId) {
      return database.getImprovement(candidateId);
    },

    subscribe(runId, listener) {
      if (!database.getConversationRun(runId)) throw gatewayError("run-missing");
      if (typeof listener !== "function") throw gatewayError("gateway-listener-invalid");
      const runListeners = listeners.get(runId) ?? new Set();
      runListeners.add(listener); listeners.set(runId, runListeners);
      return () => { runListeners.delete(listener); if (runListeners.size === 0) listeners.delete(runId); };
    },

    close() { listeners.clear(); },
  };
  return Object.freeze(api);
}

function projectTaskState(database, runId, emit) {
  const run = database.getConversationRun(runId);
  if (!run) throw gatewayError("run-missing");
  if (!run.taskId || !new Set(["accepted", "running", "verifying", "waiting"]).has(run.state)) return run;
  const task = database.getTask(run.taskId);
  if (!task) return run;
  const existing = new Set(database.listRunEvents(runId, { afterEventId: 0 }).map((event) => event.type));
  if (["running", "verifying"].includes(task.status) && !existing.has("worker-started")) emit(runId, "worker-started", { workerId: task.assignedWorker ?? "unassigned" }, { agentId: task.assignedWorker ?? "mahoraga" });
  if (task.status === "verifying" && !existing.has("verification-started")) emit(runId, "verification-started", { verifierId: task.verifier ?? "worker-result" });
  if (["waiting", "waiting_for_user"].includes(task.status) && !existing.has("approval-required")) emit(runId, "approval-required", { reasonCode: task.errorCode ?? "user-input-required" });
  if (task.status === "completed") {
    if (!existing.has("receipt-created")) emit(runId, "receipt-created", { receiptCount: database.listReceipts(task.id).length, taskState: task.status });
    emit(runId, "run-completed", { taskState: task.status, verificationState: "verified" });
  } else if (task.status === "failed") emit(runId, "run-failed", { taskState: task.status, reasonCode: boundedCode(task.errorCode ?? "task-failed") });
  else if (task.status === "cancelled") emit(runId, "run-cancelled", { taskState: task.status, reasonCode: "cancelled-by-user" });
  else if (!ACTIVE_TASK_STATES.has(task.status)) throw gatewayError("gateway-task-state-invalid");
  return database.getConversationRun(runId);
}

function validateRunInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw gatewayError("run-input-invalid");
  const allowed = new Set(["sessionId", "conversationId", "content", "idempotencyKey", "attachmentCount", "classification"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw gatewayError("run-input-field-unknown");
  const sessionId = token(value.sessionId, 120, "run-session-invalid");
  const conversationId = value.conversationId === undefined || value.conversationId === null ? null : token(value.conversationId, 80, "run-conversation-invalid");
  const content = multiline(value.content, 12_000, "run-content-invalid");
  const idempotencyKey = token(value.idempotencyKey, 120, "run-idempotency-key-invalid");
  const attachmentCount = value.attachmentCount ?? 0;
  if (!Number.isSafeInteger(attachmentCount) || attachmentCount < 0 || attachmentCount > 20) throw gatewayError("run-attachment-count-invalid");
  const classification = value.classification ?? "local-only";
  if (!new Set(["synthetic", "personal", "enterprise", "local-only"]).has(classification)) throw gatewayError("run-classification-invalid");
  return Object.freeze({ sessionId, conversationId, content, idempotencyKey, attachmentCount, classification });
}

function conversationTitle(content) { return content.replace(/\s+/g, " ").trim().slice(0, 120); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function boundedCode(value) { const normalized = String(value).toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 64); return /^[a-z]/.test(normalized) ? normalized : `error-${normalized}`; }
function token(value, maximum, code) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value)) throw gatewayError(code); return value; }
function multiline(value, maximum, code) { if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\0/.test(value)) throw gatewayError(code); return value.trim(); }
function gatewayError(code) { const error = new TypeError(code); error.code = code; return error; }

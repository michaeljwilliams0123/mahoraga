import { createHash } from "node:crypto";
import { classifyTaskIntent } from "./task-intent.mjs";
import { capabilityIndex } from "./router.mjs";
import { planConversationCapabilities } from "./conversation-capability-planner.mjs";

export function createConversationGateway({ database, manifest, supervisor, submitTask, capabilityResolver = null, relayHandlers = {} } = {}) {
  if (!database || typeof database.createConversationRun !== "function") throw gatewayError("gateway-database-required");
  if (!manifest || !supervisor || typeof submitTask !== "function") throw gatewayError("gateway-dependency-required");
  const listeners = new Map();
  const resolveCapabilities = capabilityResolver ?? (() => capabilityIndex(manifest, supervisor.status()));

  const notify = (event) => {
    for (const listener of listeners.get(event.runId) ?? []) listener(event);
    return event;
  };
  const emit = (runId, type, payload, options) => notify(database.appendRunEvent(runId, type, payload, options));

  const projectCapabilities = () => {
    const values = resolveCapabilities();
    if (!Array.isArray(values)) throw gatewayError("gateway-capabilities-invalid");
    return values.map((item) => {
      const projected = {
        capability: item.capability,
        routable: item.routable === true,
        workerIds: Array.isArray(item.workerIds) ? [...item.workerIds] : item.workerId ? [item.workerId] : [],
      };
      if (typeof item.provider === "string") projected.provider = item.provider;
      if (typeof item.canary === "string") projected.canary = item.canary;
      if (item.routingReason === null || typeof item.routingReason === "string") projected.routingReason = item.routingReason;
      if (typeof item.evidenceLevel === "string") projected.evidenceLevel = item.evidenceLevel;
      if (item.lastObservedAt != null) projected.lastObservedAt = item.lastObservedAt;
      if (item.lastVerifiedAt != null) projected.lastVerifiedAt = item.lastVerifiedAt;
      if (typeof item.workerId === "string") projected.workerId = item.workerId;
      return Object.freeze(projected);
    }).sort((left, right) => left.capability.localeCompare(right.capability));
  };

  const api = {
    chat(input, context = {}) { return relayCall(relayHandlers, "chat", input, context); },
    tasks(conversationId, context = {}) { return relayCall(relayHandlers, "tasks", conversationId, context); },
    messages(conversationId, context = {}) { return relayCall(relayHandlers, "messages", conversationId, context); },
    messageContent(input, context = {}) { return relayCall(relayHandlers, "messageContent", input, context); },
    taskAction(input, context = {}) { return relayCall(relayHandlers, "taskAction", input, context); },
    operationsSnapshot(context = {}) { return relayCall(relayHandlers, "operationsSnapshot", null, context); },
    operationsAction(input, context = {}) { return relayCall(relayHandlers, "operationsAction", input, context); },

    createRun(input, context = {}) {
      const request = validateRunInput(input);
      const requestSha256 = digest(canonicalRequest(request));
      const existing = typeof database.getConversationRunByIdempotencyKey === "function"
        ? database.getConversationRunByIdempotencyKey(request.idempotencyKey)
        : null;
      if (existing) {
        if (existing.requestSha256 && existing.requestSha256 !== requestSha256) throw gatewayError("run-idempotency-conflict");
        return { run: existing, intent: null, task: existing.taskId ? database.getTask(existing.taskId) : null };
      }
      let conversationId = request.conversationId;
      let run;
      if (conversationId === null) {
        if (typeof database.createConversationAndRun === "function") {
          const created = database.createConversationAndRun({
            sessionId: request.sessionId, title: conversationTitle(request.content), content: request.content,
            classification: request.classification, idempotencyKey: request.idempotencyKey, requestSha256,
          });
          conversationId = created.conversation.id;
          run = created.run;
        } else {
          conversationId = database.createConversation({
            title: conversationTitle(request.content), initialMessage: request.content,
            classification: request.classification,
          }).id;
        }
      } else {
        if (!database.getConversation(conversationId)) throw gatewayError("run-conversation-missing");
        database.addConversationMessage({ conversationId, role: "user", content: request.content, classification: request.classification });
      }
      run ??= database.createConversationRun({ sessionId: request.sessionId, conversationId, idempotencyKey: request.idempotencyKey, requestSha256 });
      if (run.taskId) return { run, intent: null, task: database.getTask(run.taskId) };
      const capabilityRoutes = resolveCapabilities();
      const priorTasks = conversationId && typeof database.listTasks === "function"
        ? database.listTasks(500).filter((task) => task.conversationId === conversationId)
        : [];
      const ucfPlan = planConversationCapabilities({
        content: request.content, attachmentCount: request.attachmentCount, capabilityRoutes, priorTasks,
      });
      const fallbackIntent = classifyTaskIntent({
        content: request.content, attachmentCount: request.attachmentCount,
        availableCapabilities: capabilityRoutes.filter((item) => item.routable === true).map((item) => item.capability),
      });
      const intent = ucfPlan.execution === "task" && ucfPlan.capability
        ? gatewayIntentFromPlan(ucfPlan)
        : fallbackIntent;
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
      return database.listRunEvents(runId, { afterEventId });
    },

    capabilities() {
      return projectCapabilities();
    },

    getImprovement(candidateId) {
      const candidate = database.getEvolutionCandidate?.(candidateId);
      if (candidate) return Object.freeze({ ...candidate, status: candidate.state });
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


function gatewayIntentFromPlan(plan) {
  return Object.freeze({
    schemaVersion: 2, intentKind: plan.intentKind, capability: plan.capability, confidence: 1,
    requiredEvidenceIds: [], targetId: null, limitations: [], reasonCode: plan.reasonCode,
  });
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
function canonicalRequest(value) {
  return JSON.stringify({
    sessionId: value.sessionId, conversationId: value.conversationId, content: value.content,
    idempotencyKey: value.idempotencyKey, attachmentCount: value.attachmentCount, classification: value.classification,
  });
}
function boundedCode(value) { const normalized = String(value).toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 64); return /^[a-z]/.test(normalized) ? normalized : `error-${normalized}`; }
function relayCall(handlers, name, input, context) {
  if (typeof handlers[name] !== "function") throw gatewayError("gateway-relay-action-unavailable");
  return handlers[name](input, context);
}
function token(value, maximum, code) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value)) throw gatewayError(code); return value; }
function multiline(value, maximum, code) { if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\0/.test(value)) throw gatewayError(code); return value.trim(); }
function gatewayError(code) { const error = new TypeError(code); error.code = code; return error; }

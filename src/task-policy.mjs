const POLICY_VERSION = "7.0.0-alpha.1";
const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const PRIORITIES = new Set(["critical", "high", "normal", "low", "background"]);
const FORBIDDEN_CALLER_FIELDS = new Set([
  "capability", "dataClass", "executionPlane", "workerId", "allowedWorkerIds",
  "attendedRequired", "requestedMode", "excludedWorkerIds", "policyVersion",
]);
const GENERIC_INTENTS = new Set([
  "assistant.respond", "artifact.inspect", "system.health", "manifest.validate", "provider.gap",
  "repository.status", "repository.inspect", "repository.history", "repository.remote-inspect",
  "browser.status", "browser.smoke", "browser.observe", "desktop.inspect", "desktop.interact",
  "m365.health", "m365.open", "codex.health",
]);

export function sanitizeTaskIntake(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw policyError("task-intake-invalid");
  for (const field of Object.keys(body)) if (FORBIDDEN_CALLER_FIELDS.has(field)) throw policyError("caller-authority-field-forbidden");
  const allowed = new Set([
    "intent", "requestedOutcome", "idempotencyKey", "correlationId", "priority", "conversationId",
    "initialMessage", "attachmentIds", "contentReferences", "taskArea", "completionCriteria",
    "maximumAttempts", "baseCommit", "allowedPaths", "authoritySessionId", "integrationLeaseId",
  ]);
  for (const field of Object.keys(body)) if (!allowed.has(field)) throw policyError("task-intake-field-unknown");
  return Object.freeze({ ...body });
}

export function deriveTaskPolicy(input, {
  manifest,
  source = "control-center",
  internal = false,
  attendedSession = null,
  integrationLease = null,
} = {}) {
  if (!manifest || !Array.isArray(manifest.workers)) throw policyError("task-policy-manifest-required");
  const request = internal ? Object.freeze({ ...input }) : sanitizeTaskIntake(input);
  const intent = bounded(request.intent, 80, "task-intent-invalid");
  if (!internal && !GENERIC_INTENTS.has(intent)) throw policyError("task-intent-not-allowed");
  const candidates = manifest.workers.filter((worker) => worker.enabled && worker.capabilities.includes(intent));
  if (candidates.length === 0) throw policyError("task-capability-unavailable");
  const dataClass = deriveDataClass(intent, request);
  const eligible = candidates.filter((worker) => worker.dataClasses.includes(dataClass));
  if (eligible.length === 0) throw policyError("task-data-class-unsupported");
  const attendedRequired = eligible.some((worker) => worker.routing?.requiresAttendedDesktop === true);
  if (attendedRequired && !attendedSession?.active) throw policyError("attended-session-required");
  const integrationLeaseId = request.integrationLeaseId ?? integrationLease?.leaseId ?? null;
  if (intent === "codex.execute" && !integrationLeaseId) throw policyError("integration-lease-required");
  const contentReferences = normalizeReferences(request.contentReferences ?? []);
  const executionPlanes = [...new Set(eligible.map((worker) => worker.executionPlane))];
  if (executionPlanes.length !== 1) throw policyError("task-execution-plane-ambiguous");

  return Object.freeze({
    source: bounded(source, 64, "task-source-invalid"),
    intent,
    capability: intent,
    dataClass,
    executionPlane: executionPlanes[0],
    attendedRequired,
    allowedWorkerIds: eligible.map((worker) => worker.id).sort(),
    authoritySessionId: request.authoritySessionId ?? attendedSession?.sessionId ?? null,
    integrationLeaseId,
    contentReferences,
    policyVersion: POLICY_VERSION,
  });
}

export function policyTaskInput(request, policy, manifest) {
  return Object.freeze({
    intent: policy.intent,
    capability: policy.capability,
    dataClass: policy.dataClass,
    requestedMode: manifest.defaultAutonomyMode,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    taskType: policy.intent.split(".")[0],
    requestedOutcome: boundedMultiline(request.requestedOutcome ?? policy.intent, 1000, "requested-outcome-invalid"),
    executionPlane: policy.executionPlane,
    priority: normalizePriority(request.priority),
    maximumAttempts: normalizeAttempts(request.maximumAttempts, manifest.queue.maximumAttempts),
    taskArea: request.taskArea ?? policy.intent.split(".")[0],
    completionCriteria: request.completionCriteria ?? (policy.intent === "assistant.respond" ? "substantive-response" : "worker-verified"),
    attendedRequired: policy.attendedRequired,
    allowedWorkerIds: policy.allowedWorkerIds,
    authoritySessionId: policy.authoritySessionId,
    integrationLeaseId: policy.integrationLeaseId,
    contentReferences: policy.contentReferences,
    policyVersion: policy.policyVersion,
  });
}

export function taskPolicyVersion() {
  return POLICY_VERSION;
}

function deriveDataClass(intent, request) {
  if (intent.startsWith("m365.")) return "enterprise";
  if (intent.startsWith("repository.") || intent.startsWith("desktop.") || intent.startsWith("codex.")) return "local-only";
  if (intent === "assistant.respond") return "personal";
  if (intent === "artifact.inspect") return request.contentReferences?.length ? "local-only" : "synthetic";
  return "synthetic";
}

function normalizeReferences(value) {
  if (!Array.isArray(value) || value.length > 20) throw policyError("content-references-invalid");
  const references = [...new Set(value)];
  for (const item of references) if (typeof item !== "string" || !/^(?:art|vault)-?[a-z0-9:-]{16,160}$/i.test(item)) throw policyError("content-reference-invalid");
  return references.sort();
}

function normalizePriority(value = "normal") {
  if (!PRIORITIES.has(value)) throw policyError("task-priority-invalid");
  return value;
}

function normalizeAttempts(value, fallback) {
  const attempts = value ?? fallback;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw policyError("maximum-attempts-invalid");
  return attempts;
}

function bounded(value, maximum, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\r\n\u0000]/.test(value)) throw policyError(code);
  return value;
}

function boundedMultiline(value, maximum, code) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /\u0000/.test(value)) throw policyError(code);
  return value.trim();
}

function policyError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

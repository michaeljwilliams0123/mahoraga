const REQUEST_KEYS = new Set(["reason", "task", "consideredRoutes", "excludedWorkerIds"]);
const ACTION_KINDS = new Set([
  "refresh-readiness", "retry-route", "reroute", "repair-worker",
  "refresh-auth", "configure-adapter", "provision-adapter",
]);
const RECOVERY = Object.freeze({
  "canary-stale": ["refresh-readiness", "retry-route"],
  "provider-unavailable": ["refresh-readiness", "reroute"],
  "worker-excluded": ["reroute"],
  "routing-evidence-missing": ["refresh-readiness", "configure-adapter", "reroute"],
  "platform-authority-missing": ["refresh-auth"],
});
const STRUCTURAL = new Set([
  "owner-grant-missing", "scope-revoked", "data-class-not-supported",
  "agent-capability-not-declared", "owner-confirmation-required", "recipient-not-authorized",
]);

export function planCapabilityRecovery(input) {
  exact(input, REQUEST_KEYS, "capability-recovery-request-invalid");
  const task = normalizeTask(input.task);
  const routes = normalizeRoutes(input.consideredRoutes);
  normalizeWorkerIds(input.excludedWorkerIds);
  const reason = normalizeReason(input.reason);
  const exhausted = task.attemptCount >= task.maximumAttempts;
  if (exhausted) return freezePlan({ recoverable: false, reason, actions: [], exhausted: true });
  if (reason === "unclassified" || STRUCTURAL.has(reason)) {
    return freezePlan({ recoverable: false, reason, actions: [], exhausted: false });
  }
  const kinds = RECOVERY[reason] ?? [];
  const actions = kinds.slice(0, 8).map((kind) => action(kind));
  return freezePlan({ recoverable: actions.length > 0, reason, actions, exhausted: false });
}
function normalizeTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("capability-recovery-task-invalid");
  const attemptCount = value.attemptCount === undefined ? 0 : boundedInteger(value.attemptCount, 0, 1000, "capability-recovery-task-invalid");
  const maximumAttempts = value.maximumAttempts === undefined ? 3 : boundedInteger(value.maximumAttempts, 1, 1000, "capability-recovery-task-invalid");
  if (value.id !== undefined) token(value.id, 80, "capability-recovery-task-invalid");
  token(value.capability, 96, "capability-recovery-task-invalid");
  return { attemptCount, maximumAttempts };
}

function normalizeRoutes(value) {
  if (!Array.isArray(value) || value.length > 64) fail("capability-recovery-routes-invalid");
  return value.map((route) => {
    if (!route || typeof route !== "object" || Array.isArray(route)) fail("capability-recovery-route-invalid");
    const keys = Object.keys(route);
    if (keys.some((key) => !new Set(["workerId", "routeFingerprint"]).has(key))) fail("capability-recovery-route-invalid");
    slug(route.workerId, "capability-recovery-route-invalid");
    if (route.routeFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(String(route.routeFingerprint))) fail("capability-recovery-route-invalid");
    return { workerId: route.workerId, routeFingerprint: route.routeFingerprint ?? null };
  });
}

function normalizeWorkerIds(value) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail("capability-recovery-workers-invalid");
  return value.map((item) => slug(item, "capability-recovery-workers-invalid"));
}
function normalizeReason(value) {
  if (typeof value !== "string" || value.length < 2 || value.length > 96 || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) {
    return "unclassified";
  }
  if (Object.hasOwn(RECOVERY, value) || STRUCTURAL.has(value)) return value;
  return "unclassified";
}

function action(kind) {
  if (!ACTION_KINDS.has(kind)) fail("capability-recovery-action-invalid");
  return Object.freeze({ kind });
}

function freezePlan(value) {
  const plan = { ...value, actions: Object.freeze([...value.actions]) };
  return Object.freeze(plan);
}

function boundedInteger(value, min, max, code) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code);
  return value;
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function token(value, max, code) {
  if (typeof value !== "string" || value.length < 2 || value.length > max || !/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(code);
  return value;
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

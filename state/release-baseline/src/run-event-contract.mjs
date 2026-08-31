const EVENT_TYPES = new Set([
  "run-start", "text-delta", "reasoning-summary", "tool-input-start", "tool-call", "tool-result", "tool-error",
  "worker-started", "worker-completed", "approval-required", "verification-started", "verification-result",
  "candidate-created", "deployment-started", "deployment-completed", "receipt-created", "run-completed", "run-failed", "run-cancelled",
]);
const TERMINAL_TYPES = new Set(["run-completed", "run-failed", "run-cancelled"]);
const PRIVATE_KEYS = /^(?:text|content|prompt|response|transcript|message|reasoning|modelResponse|raw)$/i;
const EVENT_KEYS = new Set(["schemaVersion", "eventId", "sessionId", "conversationId", "runId", "agentId", "type", "timestamp", "payload"]);

export function validateRunEvent(value) {
  exact(value, EVENT_KEYS, "run-event-invalid");
  if (value.schemaVersion !== 1) fail("run-event-version-invalid");
  if (!Number.isSafeInteger(value.eventId) || value.eventId < 1) fail("run-event-id-invalid");
  identifier(value.sessionId, "ses", "run-event-session-invalid");
  identifier(value.conversationId, "con", "run-event-conversation-invalid");
  identifier(value.runId, "run", "run-event-run-invalid");
  slug(value.agentId, "run-event-agent-invalid");
  if (!EVENT_TYPES.has(value.type)) fail("run-event-type-invalid");
  timestamp(value.timestamp, "run-event-time-invalid");
  validatePayload(value.payload);
  return deepFreeze(structuredClone(value));
}

export function terminalRunType(type) { return TERMINAL_TYPES.has(type); }

export function runStateForEvent(type, current) {
  if (type === "run-start") return "running";
  if (type === "verification-started") return "verifying";
  if (type === "approval-required") return "waiting";
  if (type === "run-completed") return "completed";
  if (type === "run-failed") return "failed";
  if (type === "run-cancelled") return "cancelled";
  return current;
}

function validatePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("run-event-payload-invalid");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 8192) fail("run-event-payload-too-large");
  visit(value, 0);
}

function visit(value, depth) {
  if (depth > 5) fail("run-event-payload-depth");
  for (const [key, child] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key)) fail("run-event-payload-key-invalid");
    if (PRIVATE_KEYS.test(key)) fail("run-event-payload-private");
    if (child === null || typeof child === "boolean") continue;
    if (typeof child === "number") { if (!Number.isFinite(child)) fail("run-event-payload-value-invalid"); continue; }
    if (typeof child === "string") { if (child.length > 240 || /[\0\r\n]/.test(child)) fail("run-event-payload-value-invalid"); continue; }
    if (Array.isArray(child)) {
      if (child.length > 64) fail("run-event-payload-value-invalid");
      for (const item of child) {
        if (item && typeof item === "object" && !Array.isArray(item)) visit(item, depth + 1);
        else if (typeof item === "string" && item.length <= 240 && !/[\0\r\n]/.test(item)) continue;
        else if (typeof item === "number" && Number.isFinite(item)) continue;
        else if (typeof item === "boolean" || item === null) continue;
        else fail("run-event-payload-value-invalid");
      }
      continue;
    }
    if (child && typeof child === "object") { visit(child, depth + 1); continue; }
    fail("run-event-payload-value-invalid");
  }
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}
function identifier(value, prefix, code) { if (typeof value !== "string" || !new RegExp(`^${prefix}-[A-Za-z0-9-]{5,100}$`).test(value)) fail(code); }
function slug(value, code) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) fail(code); }
function timestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

const CONTEXT_KEYS = new Set(["dataClass", "allowedCapabilityIds", "permissionClass", "spendingClass"]);
const ROLES = new Set(["system", "user", "assistant"]);

export function createOpenClawAdapter({ providerId, send, maximumRequestBytes = 65_536, maximumResponseBytes = 262_144 } = {}) {
  slug(providerId, "openclaw-provider-invalid");
  if (typeof send !== "function") fail("openclaw-send-required");
  byteLimit(maximumRequestBytes, 1024, 1_048_576, "openclaw-request-limit-invalid");
  byteLimit(maximumResponseBytes, 1024, 4_194_304, "openclaw-response-limit-invalid");
  return Object.freeze({
    providerId,
    start(messages, context) { return normalizeStream({ providerId, send, messages, context, maximumRequestBytes, maximumResponseBytes }); },
  });
}

async function* normalizeStream({ providerId, send, messages, context, maximumRequestBytes, maximumResponseBytes }) {
  const normalizedMessages = validateMessages(messages, maximumRequestBytes);
  const normalizedContext = validateContext(context);
  const stream = await send({ messages: normalizedMessages, context: normalizedContext });
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") fail("openclaw-stream-invalid");
  let responseBytes = 0;
  for await (const event of stream) {
    if (!event || typeof event !== "object" || Array.isArray(event)) fail("openclaw-event-invalid");
    responseBytes += Buffer.byteLength(JSON.stringify(event), "utf8");
    if (responseBytes > maximumResponseBytes) fail("openclaw-response-too-large");
    if (event.type === "text_delta") {
      yield Object.freeze({ type: "text-delta", text: boundedText(event.text, 16_384, "openclaw-text-invalid"), providerId });
    } else if (event.type === "reasoning_summary") {
      yield Object.freeze({ type: "reasoning-summary", summary: boundedText(event.summary, 4000, "openclaw-reasoning-invalid"), providerId });
    } else if (event.type === "tool_call") {
      if (!normalizedContext.allowedCapabilityIds.includes(event.tool)) fail("openclaw-tool-not-allowed");
      const input = jsonObject(event.arguments, maximumRequestBytes, "openclaw-tool-input-invalid");
      yield deepFreeze({ type: "tool-request", capabilityId: event.tool, input, authority: "proposal-only", providerId });
    } else if (event.type === "done") {
      yield deepFreeze({ type: "completed", usage: normalizeUsage(event.usage), providerId });
    } else if (event.type === "error") {
      yield Object.freeze({ type: "failed", reasonCode: safeCode(event.code), providerId });
    } else fail("openclaw-event-type-invalid");
  }
}

function validateMessages(value, maximumBytes) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail("openclaw-messages-invalid");
  const normalized = value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message) || Object.keys(message).sort().join(",") !== "content,role" || !ROLES.has(message.role)) fail("openclaw-message-invalid");
    return Object.freeze({ role: message.role, content: boundedText(message.content, 32_000, "openclaw-message-invalid") });
  });
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > maximumBytes) fail("openclaw-request-too-large");
  return Object.freeze(normalized);
}
function validateContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !CONTEXT_KEYS.has(key))) fail("openclaw-context-field-unknown");
  if (!new Set(["synthetic", "personal", "enterprise", "local-only"]).has(value.dataClass)) fail("openclaw-data-class-invalid");
  if (!Array.isArray(value.allowedCapabilityIds) || value.allowedCapabilityIds.length > 64 || new Set(value.allowedCapabilityIds).size !== value.allowedCapabilityIds.length) fail("openclaw-capabilities-invalid");
  value.allowedCapabilityIds.forEach((item) => capability(item, "openclaw-capabilities-invalid"));
  if (value.permissionClass !== undefined) slug(value.permissionClass, "openclaw-permission-invalid");
  if (value.spendingClass !== undefined) slug(value.spendingClass, "openclaw-spending-invalid");
  return deepFreeze({ dataClass: value.dataClass, allowedCapabilityIds: [...value.allowedCapabilityIds], permissionClass: value.permissionClass ?? null, spendingClass: value.spendingClass ?? null });
}
function normalizeUsage(value) { const inputTokens = value?.inputTokens ?? 0; const outputTokens = value?.outputTokens ?? 0; if (![inputTokens, outputTokens].every((item) => Number.isSafeInteger(item) && item >= 0)) fail("openclaw-usage-invalid"); return Object.freeze({ inputTokens, outputTokens }); }
function jsonObject(value, maximumBytes, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) fail(code); return structuredClone(value); }
function boundedText(value, maximum, code) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /\0/.test(value)) fail(code); return value; }
function capability(value, code) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(value)) fail(code); }
function slug(value, code) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) fail(code); }
function byteLimit(value, minimum, maximum, code) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code); }
function safeCode(value) { const code = String(value ?? "provider-failed").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 64); return /^[a-z]/.test(code) ? code : "provider-failed"; }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

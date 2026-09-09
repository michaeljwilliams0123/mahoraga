import { createHash } from "node:crypto";

export const OMNICHANNEL_SCHEMA_VERSION = 1;
export const OMNICHANNEL_SOURCES = Object.freeze([
  "github-event",
  "microsoft-message",
  "google-message",
  "file-drop",
  "cloud-queue",
  "owner-request",
]);
export const OMNICHANNEL_ACTION_CLASSES = Object.freeze([
  "observe",
  "triage",
  "draft",
  "execute-pack",
  "high-impact",
]);

const ENVELOPE_KEYS = new Set([
  "schemaVersion",
  "envelopeId",
  "source",
  "channelFamily",
  "actor",
  "object",
  "allowedActionClass",
  "dataClass",
  "freshness",
  "zeroCreditEligible",
  "correlationId",
  "idempotencyKey",
  "contentReferences",
  "receivedAt",
  "expiresAt",
  "routeHint",
  "metadata",
]);
const CREATE_KEYS = new Set([
  "source",
  "actor",
  "object",
  "allowedActionClass",
  "correlationId",
  "idempotencyKey",
  "contentReferences",
  "routeHint",
  "metadata",
  "zeroCreditEligible",
]);
const ACTOR_KEYS = new Set(["actorType", "actorId", "trustClass", "accountBoundary"]);
const GITHUB_OBJECT_KEYS = new Set(["repository", "eventName", "action", "objectType", "objectId", "deliveryId"]);
const MESSAGE_OBJECT_KEYS = new Set(["service", "objectType", "objectId", "threadId", "accountBoundary"]);
const FILE_OBJECT_KEYS = new Set(["locationClass", "fileName", "sha256", "objectType"]);
const OWNER_OBJECT_KEYS = new Set(["surface", "requestId", "objectType"]);
const QUEUE_OBJECT_KEYS = new Set(["queueKind", "messageId", "objectType"]);
const MESSAGE_SERVICES = new Set(["outlook", "teams", "gmail", "gchat", "drive", "calendar"]);
const FILE_LOCATIONS = new Set(["local-folder", "cloud-drive", "message-attachment", "repository-artifact", "browser-download"]);
const OWNER_SURFACES = new Set(["control-center", "workflow", "conversation", "command"]);
const ACCOUNT_BOUNDARIES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const TRUST_CLASSES = new Set(["owner-explicit", "connected-evidence", "signed-receipt", "observed-session", "queued-ingress"]);
const ACTOR_TYPES = new Set(["owner", "github-app", "microsoft-account", "google-account", "system", "file-watcher", "queue-worker"]);
const FRESHNESS_VALUES = new Set(["fresh", "stale", "expired"]);
const SECRET = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;
const CONTENT_REFERENCE = /^(?:art|vault)-?[A-Za-z0-9:-]{16,160}$/;

export function createOmnichannelEnvelope(input, { now = new Date().toISOString(), ttlSeconds = 3600 } = {}) {
  exact(input, CREATE_KEYS, "omnichannel-envelope-invalid");
  const source = allowed(input.source, OMNICHANNEL_SOURCES, "omnichannel-source-invalid");
  const actor = normalizeActor(input.actor);
  const object = normalizeObject(source, input.object);
  const allowedActionClass = allowed(input.allowedActionClass, OMNICHANNEL_ACTION_CLASSES, "omnichannel-action-class-invalid");
  const receivedAt = timestamp(now, "omnichannel-time-invalid");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7 * 24 * 60 * 60) fail("omnichannel-expiry-invalid");
  const expiresAt = new Date(Date.parse(receivedAt) + ttlSeconds * 1000).toISOString();
  const dataClass = deriveDataClass(source, object);
  const envelopeId = `omni-${digest(canonicalJson({ source, actor, object, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, receivedAt })).slice(0, 32)}`;
  return validateOmnichannelEnvelope({
    schemaVersion: OMNICHANNEL_SCHEMA_VERSION,
    envelopeId,
    source,
    channelFamily: sourceChannelFamily(source, object),
    actor,
    object,
    allowedActionClass,
    dataClass,
    freshness: "fresh",
    zeroCreditEligible: input.zeroCreditEligible !== false,
    correlationId: bounded(input.correlationId, 128, "omnichannel-correlation-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    idempotencyKey: bounded(input.idempotencyKey, 128, "omnichannel-idempotency-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    contentReferences: normalizeContentReferences(input.contentReferences ?? []),
    receivedAt,
    expiresAt,
    routeHint: normalizeRouteHint(input.routeHint, source, object),
    metadata: normalizeMetadata(input.metadata ?? {}),
  }, { now: receivedAt });
}

export function validateOmnichannelEnvelope(value, { now = new Date().toISOString() } = {}) {
  exact(value, ENVELOPE_KEYS, "omnichannel-envelope-invalid");
  if (value.schemaVersion !== OMNICHANNEL_SCHEMA_VERSION) fail("omnichannel-envelope-invalid");
  const source = allowed(value.source, OMNICHANNEL_SOURCES, "omnichannel-source-invalid");
  const actor = normalizeActor(value.actor);
  const object = normalizeObject(source, value.object);
  const allowedActionClass = allowed(value.allowedActionClass, OMNICHANNEL_ACTION_CLASSES, "omnichannel-action-class-invalid");
  const dataClass = allowed(value.dataClass, [...ACCOUNT_BOUNDARIES], "omnichannel-data-class-invalid");
  if (dataClass !== deriveDataClass(source, object)) fail("omnichannel-data-class-invalid");
  if (typeof value.zeroCreditEligible !== "boolean") fail("omnichannel-zero-credit-invalid");
  const receivedAt = timestamp(value.receivedAt, "omnichannel-time-invalid");
  const expiresAt = timestamp(value.expiresAt, "omnichannel-expiry-invalid");
  if (Date.parse(expiresAt) <= Date.parse(receivedAt)) fail("omnichannel-expiry-invalid");
  const freshness = normalizeFreshness(receivedAt, expiresAt, now, value.freshness);
  const routeHint = normalizeRouteHint(value.routeHint, source, object);
  const channelFamily = sourceChannelFamily(source, object);
  if (value.channelFamily !== channelFamily) fail("omnichannel-channel-family-invalid");
  return deepFreeze({
    schemaVersion: OMNICHANNEL_SCHEMA_VERSION,
    envelopeId: bounded(value.envelopeId, 40, "omnichannel-envelope-id-invalid", /^omni-[a-f0-9]{32}$/),
    source,
    channelFamily,
    actor,
    object,
    allowedActionClass,
    dataClass,
    freshness,
    zeroCreditEligible: value.zeroCreditEligible,
    correlationId: bounded(value.correlationId, 128, "omnichannel-correlation-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    idempotencyKey: bounded(value.idempotencyKey, 128, "omnichannel-idempotency-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    contentReferences: normalizeContentReferences(value.contentReferences),
    receivedAt,
    expiresAt,
    routeHint,
    metadata: normalizeMetadata(value.metadata),
  });
}

export function deriveTaskIntakeFromOmnichannelEnvelope(value) {
  const envelope = validateOmnichannelEnvelope(value);
  const withArtifacts = envelope.contentReferences.length > 0 || envelope.object.objectType === "file";
  const capability = envelope.routeHint.capability
    ?? (withArtifacts ? "artifact.inspect" : envelope.channelFamily === "github" ? "repository.inspect" : "assistant.respond");
  const taskArea = envelope.channelFamily === "queue" ? "automation" : envelope.channelFamily;
  const completionCriteria = capability === "assistant.respond"
    ? (envelope.allowedActionClass === "draft" ? "draft-response" : "substantive-response")
    : capability === "artifact.inspect"
      ? "worker-verified"
      : "worker-verified";
  return deepFreeze({
    intent: capability,
    requestedOutcome: defaultRequestedOutcome(envelope, capability),
    idempotencyKey: envelope.idempotencyKey,
    correlationId: envelope.correlationId,
    contentReferences: envelope.contentReferences,
    taskArea,
    priority: derivePriority(envelope),
    completionCriteria,
    maximumAttempts: capability === "repository.inspect" ? 2 : 3,
  });
}

function normalizeActor(value) {
  exact(value, ACTOR_KEYS, "omnichannel-actor-invalid");
  return {
    actorType: allowed(value.actorType, [...ACTOR_TYPES], "omnichannel-actor-invalid"),
    actorId: bounded(value.actorId, 128, "omnichannel-actor-invalid", /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/),
    trustClass: allowed(value.trustClass, [...TRUST_CLASSES], "omnichannel-actor-invalid"),
    accountBoundary: allowed(value.accountBoundary, [...ACCOUNT_BOUNDARIES], "omnichannel-actor-invalid"),
  };
}

function normalizeObject(source, value) {
  if (source === "github-event") {
    exact(value, GITHUB_OBJECT_KEYS, "omnichannel-object-invalid");
    return {
      repository: normalizeRepository(value.repository),
      eventName: bounded(value.eventName, 40, "omnichannel-object-invalid", /^[a-z][a-z0-9_:-]*$/),
      action: bounded(value.action, 40, "omnichannel-object-invalid", /^[a-z][a-z0-9_:-]*$/),
      objectType: bounded(value.objectType, 40, "omnichannel-object-invalid", /^(?:issue|pull-request|comment|check-run|repository)$/),
      objectId: bounded(value.objectId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/),
      deliveryId: bounded(value.deliveryId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    };
  }
  if (source === "microsoft-message" || source === "google-message") {
    exact(value, MESSAGE_OBJECT_KEYS, "omnichannel-object-invalid");
    return {
      service: allowed(value.service, [...MESSAGE_SERVICES], "omnichannel-object-invalid"),
      objectType: bounded(value.objectType, 40, "omnichannel-object-invalid", /^(?:email|teams-message|chat-message|drive-file|calendar-event|attachment)$/),
      objectId: bounded(value.objectId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:@/#-]*$/),
      threadId: bounded(value.threadId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:@/#-]*$/),
      accountBoundary: allowed(value.accountBoundary, [...ACCOUNT_BOUNDARIES], "omnichannel-object-invalid"),
    };
  }
  if (source === "file-drop") {
    exactOptional(value, FILE_OBJECT_KEYS, ["objectType"], "omnichannel-object-invalid");
    if (Object.hasOwn(value, "objectType") && value.objectType !== "file") fail("omnichannel-object-invalid");
    return {
      locationClass: allowed(value.locationClass, [...FILE_LOCATIONS], "omnichannel-object-invalid"),
      fileName: safeText(value.fileName, 180, "omnichannel-object-invalid"),
      sha256: bounded(value.sha256, 64, "omnichannel-object-invalid", /^[a-f0-9]{64}$/),
      objectType: "file",
    };
  }
  if (source === "owner-request") {
    exactOptional(value, OWNER_OBJECT_KEYS, ["objectType"], "omnichannel-object-invalid");
    if (Object.hasOwn(value, "objectType") && value.objectType !== "request") fail("omnichannel-object-invalid");
    return {
      surface: allowed(value.surface, [...OWNER_SURFACES], "omnichannel-object-invalid"),
      requestId: bounded(value.requestId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
      objectType: "request",
    };
  }
  exactOptional(value, QUEUE_OBJECT_KEYS, ["objectType"], "omnichannel-object-invalid");
  if (Object.hasOwn(value, "objectType") && value.objectType !== "queue-message") fail("omnichannel-object-invalid");
  return {
    queueKind: bounded(value.queueKind, 64, "omnichannel-object-invalid", /^[a-z][a-z0-9-]*$/),
    messageId: bounded(value.messageId, 128, "omnichannel-object-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    objectType: "queue-message",
  };
}

function normalizeContentReferences(value) {
  if (!Array.isArray(value) || value.length > 20 || new Set(value).size !== value.length) fail("omnichannel-content-references-invalid");
  return value.map((item) => bounded(item, 160, "omnichannel-content-reference-invalid", CONTENT_REFERENCE)).sort();
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("omnichannel-metadata-invalid");
  const keys = Object.keys(value).sort();
  if (keys.length > 12) fail("omnichannel-metadata-invalid");
  const result = {};
  for (const key of keys) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(key) || /(secret|token|password|prompt|response|conversation|credential)/i.test(key) || SECRET.test(key)) fail("omnichannel-metadata-invalid");
    const item = value[key];
    if (typeof item === "string") result[key] = safeText(item, 200, "omnichannel-metadata-invalid");
    else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
    else if (typeof item === "boolean") result[key] = item;
    else fail("omnichannel-metadata-invalid");
  }
  return result;
}

function normalizeRouteHint(value, source, object) {
  const defaultCapability = source === "github-event"
    ? "repository.inspect"
    : source === "file-drop" || object.objectType === "attachment" || object.objectType === "drive-file"
      ? "artifact.inspect"
      : "assistant.respond";
  if (value == null) return Object.freeze({ capability: defaultCapability, actionPackId: defaultActionPackId(source, object) });
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("omnichannel-route-hint-invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "actionPackId,capability") fail("omnichannel-route-hint-invalid");
  return Object.freeze({
    capability: bounded(value.capability, 64, "omnichannel-route-hint-invalid", /^(?:assistant\.respond|artifact\.inspect|repository\.inspect|provider\.gap)$/),
    actionPackId: bounded(value.actionPackId, 64, "omnichannel-route-hint-invalid", /^[a-z][a-z0-9-]*$/),
  });
}

function deriveDataClass(source, object) {
  if (source === "github-event") return "local-only";
  if (source === "file-drop") return object.locationClass === "local-folder" || object.locationClass === "repository-artifact" ? "local-only" : "personal";
  if (source === "owner-request" || source === "cloud-queue") return "synthetic";
  return object.accountBoundary;
}

function sourceChannelFamily(source, object) {
  if (source === "github-event") return "github";
  if (source === "file-drop") return "file";
  if (source === "cloud-queue") return "queue";
  if (source === "owner-request") return "owner";
  if (object.service === "outlook" || object.service === "teams") return "microsoft";
  return "google";
}

function normalizeFreshness(receivedAt, expiresAt, now, asserted) {
  const nowValue = timestamp(now, "omnichannel-time-invalid");
  const computed = Date.parse(nowValue) >= Date.parse(expiresAt)
    ? "expired"
    : Date.parse(nowValue) - Date.parse(receivedAt) > 30 * 60 * 1000
      ? "stale"
      : "fresh";
  if (asserted != null && (!FRESHNESS_VALUES.has(asserted) || (asserted !== computed && !(asserted === "stale" && computed === "expired")))) {
    fail("omnichannel-freshness-invalid");
  }
  return computed;
}

function derivePriority(envelope) {
  if (envelope.source === "github-event" && envelope.object.objectType === "pull-request") return "high";
  if (envelope.allowedActionClass === "high-impact") return "critical";
  if (envelope.allowedActionClass === "draft") return "normal";
  return "background";
}

function defaultRequestedOutcome(envelope, capability) {
  if (capability === "repository.inspect") {
    return `Inspect ${envelope.object.repository} ${envelope.object.objectType} ${envelope.object.objectId} from ${envelope.object.eventName}.${envelope.object.action}.`;
  }
  if (capability === "artifact.inspect") {
    return envelope.source === "file-drop"
      ? `Inspect file ${envelope.object.fileName} from ${envelope.object.locationClass}.`
      : `Inspect referenced artifacts for ${envelope.object.objectType} ${envelope.object.objectId}.`;
  }
  return `Prepare a bounded ${envelope.allowedActionClass} response for ${envelope.channelFamily} ${objectLabel(envelope.object)}.`;
}

function objectLabel(object) {
  return object.objectId ?? object.fileName ?? object.requestId ?? object.messageId ?? "event";
}

function defaultActionPackId(source, object) {
  if (source === "github-event") return "github-status-report";
  if (source === "file-drop") return "file-intake";
  if (object.service === "teams") return "teams-triage";
  if (object.service === "outlook") return "email-triage";
  if (object.service === "drive") return "drive-fetch";
  return "draft-follow-up";
}

function normalizeRepository(value) {
  return bounded(value, 200, "omnichannel-object-invalid", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
}

function timestamp(value, code) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) fail(code);
  return text;
}

function safeText(value, maximum, code) {
  if (typeof value !== "string") fail(code);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximum || /[\0]/.test(value) || SECRET.test(normalized)) fail(code);
  return normalized;
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/.test(value) || SECRET.test(value) || !pattern.test(value)) fail(code);
  return value;
}

function allowed(value, values, code) {
  if (!values.includes(value)) fail(code);
  return value;
}

function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function exactOptional(value, keys, optionalKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  const allowed = new Set(keys);
  for (const key of optionalKeys) allowed.add(key);
  if (actual.some((key) => !allowed.has(key))) fail(code);
  const required = [...keys].filter((key) => !optionalKeys.includes(key));
  if (required.some((key) => !Object.hasOwn(value, key))) fail(code);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

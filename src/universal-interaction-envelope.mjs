import { createHash } from "node:crypto";
import { validateOmnichannelEnvelope } from "./omnichannel-intake.mjs";

export const UNIVERSAL_INTERACTION_SCHEMA_VERSION = 1;
export const UNIVERSAL_INTERACTION_MODALITIES = Object.freeze([
  "text",
  "structured",
  "file",
  "image",
  "audio",
  "video",
  "event",
]);

const MODALITIES = new Set(UNIVERSAL_INTERACTION_MODALITIES);
const DATA_CLASSES = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const ACTION_CLASSES = new Set(["observe", "triage", "draft", "execute-pack", "high-impact"]);
const DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
const MEASUREMENT_SYSTEMS = new Set(["metric", "us", "uk"]);
const DEVICE_CLASSES = new Set(["phone", "tablet", "desktop", "embedded", "headless"]);
const NETWORK_CLASSES = new Set(["online", "degraded", "offline"]);
const PROTOCOL_FAMILIES = new Set(["native", "http-json", "mcp", "webhook", "sse", "websocket", "queue"]);
const FRESHNESS = new Set(["fresh", "stale", "expired"]);
const CONTENT_REFERENCE = /^(?:art|vault)-?[A-Za-z0-9:-]{16,160}$/;
const CAPABILITY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const SCHEMA_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PROTOCOL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;

const CONTEXT_KEYS = new Set(["modalities", "presentation", "delivery", "protocol", "requestedCapability"]);
const PRESENTATION_KEYS = new Set(["locale", "timeZone", "direction", "measurementSystem", "currency", "deviceClass", "networkClass"]);
const DELIVERY_REQUIRED_KEYS = ["supportsStreaming", "supportsMarkdown", "supportsRichText", "supportsImages", "supportsAudio", "supportsVideo", "supportsFiles"];
const DELIVERY_KEYS = new Set([...DELIVERY_REQUIRED_KEYS, "maxOutputBytes"]);
const PROTOCOL_KEYS = new Set(["family", "version", "schemaIds"]);
const ENVELOPE_REQUIRED_KEYS = [
  "schemaVersion",
  "kind",
  "interactionId",
  "sourceEnvelopeId",
  "correlationId",
  "idempotencyKey",
  "receivedAt",
  "expiresAt",
  "freshness",
  "dataClass",
  "allowedActionClass",
  "zeroCreditEligible",
  "modalities",
  "contentReferences",
  "presentation",
  "delivery",
  "protocol",
  "fingerprint",
];
const ENVELOPE_KEYS = new Set([...ENVELOPE_REQUIRED_KEYS, "requestedCapability"]);

export function projectUniversalInteractionEnvelope(omnichannel, context = {}, { now = new Date().toISOString() } = {}) {
  exactOptional(context, CONTEXT_KEYS, ["requestedCapability"], "universal-interaction-context-invalid");
  const ingress = validateOmnichannelEnvelope(omnichannel, { now });
  const modalities = normalizeModalities(context.modalities);
  const presentation = normalizePresentation(context.presentation);
  const delivery = normalizeDelivery(context.delivery);
  const protocol = normalizeProtocol(context.protocol);
  const requestedCapability = normalizeRequestedCapability(context.requestedCapability, ingress.routeHint.capability);
  const interactionId = `interaction-${digest(canonicalJson({
    sourceEnvelopeId: ingress.envelopeId,
    correlationId: ingress.correlationId,
    idempotencyKey: ingress.idempotencyKey,
  })).slice(0, 32)}`;

  const record = {
    schemaVersion: UNIVERSAL_INTERACTION_SCHEMA_VERSION,
    kind: "universal-interaction-envelope",
    interactionId,
    sourceEnvelopeId: ingress.envelopeId,
    correlationId: ingress.correlationId,
    idempotencyKey: ingress.idempotencyKey,
    receivedAt: ingress.receivedAt,
    expiresAt: ingress.expiresAt,
    freshness: ingress.freshness,
    dataClass: ingress.dataClass,
    allowedActionClass: ingress.allowedActionClass,
    zeroCreditEligible: ingress.zeroCreditEligible,
    modalities,
    contentReferences: [...ingress.contentReferences],
    presentation,
    delivery,
    protocol,
  };
  if (requestedCapability !== undefined) record.requestedCapability = requestedCapability;
  record.fingerprint = digest(canonicalJson(record));
  return validateUniversalInteractionEnvelope(record, { now });
}

export function validateUniversalInteractionEnvelope(value, { now = new Date().toISOString() } = {}) {
  exactOptional(value, ENVELOPE_KEYS, ["requestedCapability"], "universal-interaction-envelope-invalid", ENVELOPE_REQUIRED_KEYS);
  if (value.schemaVersion !== UNIVERSAL_INTERACTION_SCHEMA_VERSION || value.kind !== "universal-interaction-envelope") {
    fail("universal-interaction-envelope-invalid");
  }
  const receivedAt = timestamp(value.receivedAt, "universal-interaction-time-invalid");
  const expiresAt = timestamp(value.expiresAt, "universal-interaction-time-invalid");
  if (Date.parse(expiresAt) <= Date.parse(receivedAt)) fail("universal-interaction-time-invalid");
  const freshness = normalizeFreshness(value.freshness, receivedAt, expiresAt, now);
  const normalized = {
    schemaVersion: UNIVERSAL_INTERACTION_SCHEMA_VERSION,
    kind: "universal-interaction-envelope",
    interactionId: bounded(value.interactionId, 44, "universal-interaction-id-invalid", /^interaction-[a-f0-9]{32}$/),
    sourceEnvelopeId: bounded(value.sourceEnvelopeId, 40, "universal-interaction-source-invalid", /^omni-[a-f0-9]{32}$/),
    correlationId: bounded(value.correlationId, 128, "universal-interaction-lineage-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    idempotencyKey: bounded(value.idempotencyKey, 128, "universal-interaction-lineage-invalid", /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    receivedAt,
    expiresAt,
    freshness,
    dataClass: allowed(value.dataClass, DATA_CLASSES, "universal-interaction-data-class-invalid"),
    allowedActionClass: allowed(value.allowedActionClass, ACTION_CLASSES, "universal-interaction-action-class-invalid"),
    zeroCreditEligible: boolean(value.zeroCreditEligible, "universal-interaction-zero-credit-invalid"),
    modalities: normalizeModalities(value.modalities),
    contentReferences: normalizeContentReferences(value.contentReferences),
    presentation: normalizePresentation(value.presentation),
    delivery: normalizeDelivery(value.delivery),
    protocol: normalizeProtocol(value.protocol),
  };
  if (Object.hasOwn(value, "requestedCapability")) {
    normalized.requestedCapability = bounded(value.requestedCapability, 64, "universal-interaction-capability-invalid", CAPABILITY);
  }
  const expectedFingerprint = digest(canonicalJson(normalized));
  if (value.fingerprint !== expectedFingerprint) fail("universal-interaction-fingerprint-invalid");
  normalized.fingerprint = expectedFingerprint;
  return deepFreeze(normalized);
}

function normalizeRequestedCapability(value, ingressCapability) {
  if (value == null) return undefined;
  const requested = bounded(value, 64, "universal-interaction-capability-invalid", CAPABILITY);
  if (requested !== ingressCapability) fail("universal-interaction-capability-invalid");
  return requested;
}

function normalizeModalities(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > UNIVERSAL_INTERACTION_MODALITIES.length) {
    fail("universal-interaction-modalities-invalid");
  }
  if (new Set(value).size !== value.length) fail("universal-interaction-modalities-invalid");
  const result = value.map((item) => allowed(item, MODALITIES, "universal-interaction-modality-invalid")).sort();
  return Object.freeze(result);
}

function normalizePresentation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("universal-interaction-presentation-invalid");
  exactSubset(value, PRESENTATION_KEYS, "universal-interaction-presentation-invalid");
  const result = {};
  if (Object.hasOwn(value, "locale")) {
    if (typeof value.locale !== "string") fail("universal-interaction-presentation-invalid");
    try {
      const locales = Intl.getCanonicalLocales(value.locale);
      if (locales.length !== 1) fail("universal-interaction-presentation-invalid");
      result.locale = locales[0];
    } catch {
      fail("universal-interaction-presentation-invalid");
    }
  }
  if (Object.hasOwn(value, "timeZone")) {
    if (typeof value.timeZone !== "string" || value.timeZone.length > 64) fail("universal-interaction-presentation-invalid");
    try {
      result.timeZone = new Intl.DateTimeFormat("en", { timeZone: value.timeZone }).resolvedOptions().timeZone;
    } catch {
      fail("universal-interaction-presentation-invalid");
    }
  }
  if (Object.hasOwn(value, "direction")) result.direction = allowed(value.direction, DIRECTIONS, "universal-interaction-presentation-invalid");
  if (Object.hasOwn(value, "measurementSystem")) result.measurementSystem = allowed(value.measurementSystem, MEASUREMENT_SYSTEMS, "universal-interaction-presentation-invalid");
  if (Object.hasOwn(value, "currency")) result.currency = bounded(value.currency, 3, "universal-interaction-presentation-invalid", /^[A-Z]{3}$/);
  if (Object.hasOwn(value, "deviceClass")) result.deviceClass = allowed(value.deviceClass, DEVICE_CLASSES, "universal-interaction-presentation-invalid");
  if (Object.hasOwn(value, "networkClass")) result.networkClass = allowed(value.networkClass, NETWORK_CLASSES, "universal-interaction-presentation-invalid");
  return deepFreeze(result);
}

function normalizeDelivery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("universal-interaction-delivery-invalid");
  exactOptional(value, DELIVERY_KEYS, ["maxOutputBytes"], "universal-interaction-delivery-invalid", DELIVERY_REQUIRED_KEYS);
  const result = {};
  for (const key of DELIVERY_REQUIRED_KEYS) result[key] = boolean(value[key], "universal-interaction-delivery-invalid");
  if (Object.hasOwn(value, "maxOutputBytes")) {
    if (!Number.isSafeInteger(value.maxOutputBytes) || value.maxOutputBytes < 1 || value.maxOutputBytes > 64 * 1024 * 1024) {
      fail("universal-interaction-delivery-invalid");
    }
    result.maxOutputBytes = value.maxOutputBytes;
  }
  return deepFreeze(result);
}

function normalizeProtocol(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("universal-interaction-protocol-invalid");
  exactRequired(value, PROTOCOL_KEYS, "universal-interaction-protocol-invalid");
  if (!Array.isArray(value.schemaIds) || value.schemaIds.length < 1 || value.schemaIds.length > 12 || new Set(value.schemaIds).size !== value.schemaIds.length) {
    fail("universal-interaction-protocol-invalid");
  }
  return deepFreeze({
    family: allowed(value.family, PROTOCOL_FAMILIES, "universal-interaction-protocol-invalid"),
    version: bounded(value.version, 32, "universal-interaction-protocol-invalid", PROTOCOL_VERSION),
    schemaIds: Object.freeze(value.schemaIds.map((item) => bounded(item, 128, "universal-interaction-protocol-invalid", SCHEMA_ID)).sort()),
  });
}

function normalizeContentReferences(value) {
  if (!Array.isArray(value) || value.length > 20 || new Set(value).size !== value.length) fail("universal-interaction-content-references-invalid");
  return Object.freeze(value.map((item) => bounded(item, 160, "universal-interaction-content-reference-invalid", CONTENT_REFERENCE)).sort());
}

function normalizeFreshness(value, receivedAt, expiresAt, now) {
  const claimed = allowed(value, FRESHNESS, "universal-interaction-freshness-invalid");
  const nowMs = Date.parse(timestamp(now, "universal-interaction-time-invalid"));
  const receivedMs = Date.parse(receivedAt);
  const expiresMs = Date.parse(expiresAt);
  const expected = nowMs >= expiresMs ? "expired" : nowMs < receivedMs ? "stale" : "fresh";
  if (claimed !== expected) fail("universal-interaction-freshness-invalid");
  return claimed;
}

function exactRequired(value, allowedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.length !== allowedKeys.size || keys.some((key) => !allowedKeys.has(key))) fail(code);
}

function exactSubset(value, allowedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) fail(code);
}

function exactOptional(value, allowedKeys, optionalKeys, code, requiredOverride = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedKeys.has(key))) fail(code);
  const required = requiredOverride ?? [...allowedKeys].filter((key) => !optionalKeys.includes(key));
  if (required.some((key) => !Object.hasOwn(value, key))) fail(code);
}

function bounded(value, maxLength, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength || !pattern.test(value)) fail(code);
  return value;
}

function allowed(value, set, code) {
  if (!set.has(value)) fail(code);
  return value;
}

function boolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  return new Date(Date.parse(value)).toISOString();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code) {
  throw new Error(code);
}

import { createHash } from "node:crypto";
import {
  UNIVERSAL_INTERACTION_MODALITIES,
  validateUniversalInteractionEnvelope,
} from "./universal-interaction-envelope.mjs";

export const INTERACTION_NEGOTIATION_SCHEMA_VERSION = 1;

const PROTOCOL_FAMILIES = new Set(["native", "http-json", "mcp", "webhook", "sse", "websocket", "queue"]);
const MODALITIES = new Set(UNIVERSAL_INTERACTION_MODALITIES);
const RECEIPT_STATUSES = new Set(["accepted", "hold"]);
const HOLD_REASONS = new Set([
  "no-trusted-family",
  "protocol-version-incompatible",
  "schema-incompatible",
  "modality-incompatible",
  "payload-too-large",
]);
const ADAPTER_KEYS = new Set(["adapterId", "family", "versions", "schemaIds", "modalities", "maxPayloadBytes"]);
const RECEIPT_KEYS = new Set([
  "schemaVersion",
  "kind",
  "interactionId",
  "interactionFingerprint",
  "protocolFamily",
  "protocolVersion",
  "schemaIds",
  "status",
  "reason",
  "fingerprint",
]);
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/;
const SCHEMA_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const HEX64 = /^[a-f0-9]{64}$/;

export function validateInteractionAdapterDescriptor(value) {
  exactObject(value, ADAPTER_KEYS, "interaction-adapter-invalid");
  const descriptor = {
    adapterId: bounded(value.adapterId, 64, "interaction-adapter-id-invalid", /^[a-z][a-z0-9-]{1,63}$/),
    family: allowed(value.family, PROTOCOL_FAMILIES, "interaction-adapter-family-invalid"),
    versions: normalizeStringSet(value.versions, {
      maximumItems: 12,
      maximumLength: 32,
      pattern: VERSION,
      duplicateCode: "interaction-adapter-versions-invalid",
      valueCode: "interaction-adapter-version-invalid",
    }),
    schemaIds: normalizeStringSet(value.schemaIds, {
      maximumItems: 16,
      maximumLength: 128,
      pattern: SCHEMA_ID,
      duplicateCode: "interaction-adapter-schemas-invalid",
      valueCode: "interaction-adapter-schema-invalid",
      rejectUrl: true,
    }),
    modalities: normalizeAllowedSet(value.modalities, MODALITIES, {
      maximumItems: UNIVERSAL_INTERACTION_MODALITIES.length,
      duplicateCode: "interaction-adapter-modalities-invalid",
      valueCode: "interaction-adapter-modality-invalid",
    }),
    maxPayloadBytes: payloadLimit(value.maxPayloadBytes),
  };
  return deepFreeze(descriptor);
}

export function negotiateInteractionProtocol(envelope, adapters, { payloadBytes = 0, now = new Date().toISOString() } = {}) {
  const interaction = validateUniversalInteractionEnvelope(envelope, { now });
  const bytes = payloadSize(payloadBytes);
  if (!Array.isArray(adapters) || adapters.length > 32) fail("interaction-adapters-invalid");
  const trusted = adapters.map(validateInteractionAdapterDescriptor).sort((a, b) => a.adapterId.localeCompare(b.adapterId));
  if (new Set(trusted.map((item) => item.adapterId)).size !== trusted.length) fail("interaction-adapters-invalid");

  const sameFamily = trusted.filter((item) => item.family === interaction.protocol.family);
  if (sameFamily.length === 0) return hold(interaction, "no-trusted-family");

  const sameVersion = sameFamily.filter((item) => item.versions.includes(interaction.protocol.version));
  if (sameVersion.length === 0) return hold(interaction, "protocol-version-incompatible");

  const withSchemas = sameVersion
    .map((item) => ({ item, schemaIds: intersection(interaction.protocol.schemaIds, item.schemaIds) }))
    .filter(({ schemaIds }) => schemaIds.length > 0);
  if (withSchemas.length === 0) return hold(interaction, "schema-incompatible");

  const withModalities = withSchemas.filter(({ item }) => interaction.modalities.every((modality) => item.modalities.includes(modality)));
  if (withModalities.length === 0) return hold(interaction, "modality-incompatible");

  const withinPayload = withModalities.filter(({ item }) => bytes <= item.maxPayloadBytes);
  if (withinPayload.length === 0) return hold(interaction, "payload-too-large");

  const selected = withinPayload.sort((a, b) => a.item.adapterId.localeCompare(b.item.adapterId))[0];
  return receipt(interaction, {
    schemaIds: selected.schemaIds,
    status: "accepted",
    reason: "accepted",
  });
}

export function validateInteractionNegotiationReceipt(value) {
  exactObject(value, RECEIPT_KEYS, "interaction-negotiation-receipt-invalid");
  if (value.schemaVersion !== INTERACTION_NEGOTIATION_SCHEMA_VERSION || value.kind !== "interaction-negotiation-receipt") {
    fail("interaction-negotiation-receipt-invalid");
  }
  const status = allowed(value.status, RECEIPT_STATUSES, "interaction-negotiation-status-invalid");
  const reason = bounded(value.reason, 64, "interaction-negotiation-reason-invalid", /^[a-z][a-z0-9-]*$/);
  const schemaIds = normalizeReceiptSchemas(value.schemaIds, status);
  if (status === "accepted") {
    if (reason !== "accepted" || schemaIds.length === 0) fail("interaction-negotiation-receipt-invalid");
  } else if (!HOLD_REASONS.has(reason) || schemaIds.length !== 0) {
    fail("interaction-negotiation-receipt-invalid");
  }
  const normalized = {
    schemaVersion: INTERACTION_NEGOTIATION_SCHEMA_VERSION,
    kind: "interaction-negotiation-receipt",
    interactionId: bounded(value.interactionId, 44, "interaction-negotiation-interaction-id-invalid", /^interaction-[a-f0-9]{32}$/),
    interactionFingerprint: bounded(value.interactionFingerprint, 64, "interaction-negotiation-interaction-fingerprint-invalid", HEX64),
    protocolFamily: allowed(value.protocolFamily, PROTOCOL_FAMILIES, "interaction-negotiation-family-invalid"),
    protocolVersion: bounded(value.protocolVersion, 32, "interaction-negotiation-version-invalid", VERSION),
    schemaIds,
    status,
    reason,
  };
  const expectedFingerprint = digest(canonicalJson(normalized));
  if (value.fingerprint !== expectedFingerprint) fail("interaction-negotiation-fingerprint-invalid");
  normalized.fingerprint = expectedFingerprint;
  return deepFreeze(normalized);
}

function receipt(interaction, { schemaIds, status, reason }) {
  const value = {
    schemaVersion: INTERACTION_NEGOTIATION_SCHEMA_VERSION,
    kind: "interaction-negotiation-receipt",
    interactionId: interaction.interactionId,
    interactionFingerprint: interaction.fingerprint,
    protocolFamily: interaction.protocol.family,
    protocolVersion: interaction.protocol.version,
    schemaIds: [...schemaIds].sort(),
    status,
    reason,
  };
  value.fingerprint = digest(canonicalJson(value));
  return validateInteractionNegotiationReceipt(value);
}

function hold(interaction, reason) {
  return receipt(interaction, { schemaIds: [], status: "hold", reason });
}

function intersection(left, right) {
  const allowedValues = new Set(right);
  return [...new Set(left.filter((item) => allowedValues.has(item)))].sort();
}

function normalizeReceiptSchemas(value, status) {
  if (!Array.isArray(value) || value.length > 16 || new Set(value).size !== value.length) {
    fail("interaction-negotiation-schemas-invalid");
  }
  if (status === "accepted" && value.length < 1) fail("interaction-negotiation-schemas-invalid");
  return Object.freeze(value.map((item) => boundedSchema(item, "interaction-negotiation-schema-invalid")).sort());
}

function normalizeStringSet(value, { maximumItems, maximumLength, pattern, duplicateCode, valueCode, rejectUrl = false }) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems || new Set(value).size !== value.length) fail(duplicateCode);
  const normalized = value.map((item) => {
    const result = bounded(item, maximumLength, valueCode, pattern);
    if (rejectUrl && result.includes("://")) fail(valueCode);
    return result;
  }).sort();
  return Object.freeze(normalized);
}

function normalizeAllowedSet(value, allowedValues, { maximumItems, duplicateCode, valueCode }) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems || new Set(value).size !== value.length) fail(duplicateCode);
  return Object.freeze(value.map((item) => allowed(item, allowedValues, valueCode)).sort());
}

function boundedSchema(value, code) {
  const result = bounded(value, 128, code, SCHEMA_ID);
  if (result.includes("://")) fail(code);
  return result;
}

function payloadLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 64 * 1024 * 1024) fail("interaction-adapter-payload-limit-invalid");
  return value;
}

function payloadSize(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 64 * 1024 * 1024) fail("interaction-payload-bytes-invalid");
  return value;
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(code);
  return value;
}

function allowed(value, values, code) {
  if (!values.has(value)) fail(code);
  return value;
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

import { createHash } from "node:crypto";

const INPUT_KEYS = new Set(["interactionId","taskId","chainId","idempotencyKey","outputReferences","channelFamily"]);
const STATE_KEYS = new Set([
  "schemaVersion","kind","interactionId","taskId","chainId","idempotencyKey","outputReferences","channelFamily",
  "status","reason","createdAt","updatedAt","deliveredAt","lineageFingerprint","stateFingerprint",
]);
const RECEIPT_KEYS = new Set([
  "schemaVersion","kind","interactionId","taskId","chainId","outputReferences","status","channelFamily","deliveredAt","reason","fingerprint",
]);
const STATUSES = new Set(["delivered","queued","hold"]);
const CHANNEL_FAMILIES = new Set(["native","http-json","mcp","webhook","sse","websocket","queue"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const REASON = /^[a-z][a-z0-9-]*$/;
const INTERACTION = /^interaction-[a-f0-9]{32}$/;
const HEX64 = /^[a-f0-9]{64}$/;

export function createDeliveryState(input, { now = new Date().toISOString() } = {}) {
  exactSubset(input, INPUT_KEYS, "universal-delivery-input-invalid");
  const core = normalizeLineage(input);
  const createdAt = timestamp(now, "universal-delivery-time-invalid");
  return stateFrom({
    ...core,
    status:"hold",
    reason:"pending-delivery",
    createdAt,
    updatedAt:createdAt,
  });
}

export function queueUniversalDelivery(state, reason, { now = new Date().toISOString() } = {}) {
  const current = validateDeliveryState(state);
  const normalizedReason = bounded(reason, 64, "universal-delivery-reason-invalid", REASON);
  if (current.status === "delivered") fail("universal-delivery-terminal");
  if (current.status === "queued" && current.reason === normalizedReason) return current;
  return stateFrom({
    ...lineageFromState(current),
    status:"queued",
    reason:normalizedReason,
    createdAt:current.createdAt,
    updatedAt:timestamp(now, "universal-delivery-time-invalid"),
  });
}

export function markUniversalDeliveryDelivered(state, { now = new Date().toISOString() } = {}) {
  const current = validateDeliveryState(state);
  if (current.status === "delivered") return current;
  const deliveredAt = timestamp(now, "universal-delivery-time-invalid");
  return stateFrom({
    ...lineageFromState(current),
    status:"delivered",
    reason:"delivered",
    createdAt:current.createdAt,
    updatedAt:deliveredAt,
    deliveredAt,
  });
}

export function projectUniversalDeliveryReceipt(state) {
  const current = validateDeliveryState(state);
  const receipt = {
    schemaVersion:1,
    kind:"universal-delivery-receipt",
    interactionId:current.interactionId,
    ...(current.taskId === undefined ? {} : { taskId:current.taskId, chainId:current.chainId }),
    outputReferences:[...current.outputReferences],
    status:current.status,
    channelFamily:current.channelFamily,
    ...(current.deliveredAt === undefined ? {} : { deliveredAt:current.deliveredAt }),
    reason:current.reason,
  };
  return validateUniversalDeliveryReceipt({ ...receipt, fingerprint:digest(canonicalJson(receipt)) });
}

export function validateUniversalDeliveryReceipt(value) {
  exactOptional(value, RECEIPT_KEYS, ["taskId","chainId","deliveredAt"], "universal-delivery-receipt-invalid", [
    "schemaVersion","kind","interactionId","outputReferences","status","channelFamily","reason","fingerprint",
  ]);
  if (value.schemaVersion !== 1 || value.kind !== "universal-delivery-receipt") fail("universal-delivery-receipt-invalid");
  const taskId = optionalToken(value.taskId, 128, "universal-delivery-lineage-invalid");
  const chainId = optionalToken(value.chainId, 128, "universal-delivery-lineage-invalid");
  if ((taskId === undefined) !== (chainId === undefined)) fail("universal-delivery-lineage-invalid");
  const status = allowed(value.status, STATUSES, "universal-delivery-status-invalid");
  const deliveredAt = Object.hasOwn(value, "deliveredAt") ? timestamp(value.deliveredAt, "universal-delivery-time-invalid") : undefined;
  if ((status === "delivered") !== (deliveredAt !== undefined)) fail("universal-delivery-receipt-invalid");
  const normalized = {
    schemaVersion:1,
    kind:"universal-delivery-receipt",
    interactionId:bounded(value.interactionId, 44, "universal-delivery-interaction-invalid", INTERACTION),
    ...(taskId === undefined ? {} : { taskId, chainId }),
    outputReferences:normalizeOutputReferences(value.outputReferences),
    status,
    channelFamily:allowed(value.channelFamily, CHANNEL_FAMILIES, "universal-delivery-channel-invalid"),
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
    reason:bounded(value.reason, 64, "universal-delivery-reason-invalid", REASON),
  };
  const fingerprint = bounded(value.fingerprint, 64, "universal-delivery-fingerprint-invalid", HEX64);
  if (fingerprint !== digest(canonicalJson(normalized))) fail("universal-delivery-fingerprint-invalid");
  return deepFreeze({ ...normalized, fingerprint });
}

function validateDeliveryState(value) {
  exactOptional(value, STATE_KEYS, ["taskId","chainId","deliveredAt"], "universal-delivery-state-invalid", [
    "schemaVersion","kind","interactionId","idempotencyKey","outputReferences","channelFamily","status","reason",
    "createdAt","updatedAt","lineageFingerprint","stateFingerprint",
  ]);
  if (value.schemaVersion !== 1 || value.kind !== "universal-delivery-state") fail("universal-delivery-state-invalid");
  const core = normalizeLineage(value);
  const lineageFingerprint = bounded(value.lineageFingerprint, 64, "universal-delivery-state-invalid", HEX64);
  if (lineageFingerprint !== digest(canonicalJson(core))) fail("universal-delivery-state-invalid");
  const status = allowed(value.status, STATUSES, "universal-delivery-state-invalid");
  const reason = bounded(value.reason, 64, "universal-delivery-state-invalid", REASON);
  const createdAt = timestamp(value.createdAt, "universal-delivery-state-invalid");
  const updatedAt = timestamp(value.updatedAt, "universal-delivery-state-invalid");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail("universal-delivery-state-invalid");
  const deliveredAt = Object.hasOwn(value, "deliveredAt") ? timestamp(value.deliveredAt, "universal-delivery-state-invalid") : undefined;
  if ((status === "delivered") !== (deliveredAt !== undefined)) fail("universal-delivery-state-invalid");
  if (deliveredAt !== undefined && deliveredAt !== updatedAt) fail("universal-delivery-state-invalid");
  const normalized = {
    schemaVersion:1,
    kind:"universal-delivery-state",
    ...core,
    status,
    reason,
    createdAt,
    updatedAt,
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
    lineageFingerprint,
  };
  const stateFingerprint = bounded(value.stateFingerprint, 64, "universal-delivery-state-invalid", HEX64);
  if (stateFingerprint !== digest(canonicalJson(normalized))) fail("universal-delivery-state-invalid");
  return deepFreeze({ ...normalized, stateFingerprint });
}

function stateFrom(value) {
  const core = normalizeLineage(value);
  const lineageFingerprint = digest(canonicalJson(core));
  const normalized = {
    schemaVersion:1,
    kind:"universal-delivery-state",
    ...core,
    status:allowed(value.status, STATUSES, "universal-delivery-state-invalid"),
    reason:bounded(value.reason, 64, "universal-delivery-reason-invalid", REASON),
    createdAt:timestamp(value.createdAt, "universal-delivery-time-invalid"),
    updatedAt:timestamp(value.updatedAt, "universal-delivery-time-invalid"),
    ...(value.deliveredAt === undefined ? {} : { deliveredAt:timestamp(value.deliveredAt, "universal-delivery-time-invalid") }),
    lineageFingerprint,
  };
  return validateDeliveryState({ ...normalized, stateFingerprint:digest(canonicalJson(normalized)) });
}

function normalizeLineage(value) {
  const taskId = optionalToken(value.taskId, 128, "universal-delivery-lineage-invalid");
  const chainId = optionalToken(value.chainId, 128, "universal-delivery-lineage-invalid");
  if ((taskId === undefined) !== (chainId === undefined)) fail("universal-delivery-lineage-invalid");
  return {
    interactionId:bounded(value.interactionId, 44, "universal-delivery-interaction-invalid", INTERACTION),
    ...(taskId === undefined ? {} : { taskId, chainId }),
    idempotencyKey:bounded(value.idempotencyKey, 128, "universal-delivery-idempotency-invalid", TOKEN),
    outputReferences:normalizeOutputReferences(value.outputReferences),
    channelFamily:allowed(value.channelFamily, CHANNEL_FAMILIES, "universal-delivery-channel-invalid"),
  };
}

function lineageFromState(value) {
  return {
    interactionId:value.interactionId,
    ...(value.taskId === undefined ? {} : { taskId:value.taskId, chainId:value.chainId }),
    idempotencyKey:value.idempotencyKey,
    outputReferences:[...value.outputReferences],
    channelFamily:value.channelFamily,
  };
}

function normalizeOutputReferences(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32 || new Set(value).size !== value.length) fail("universal-delivery-output-references-invalid");
  return value.map((item) => {
    const result = bounded(item, 160, "universal-delivery-output-reference-invalid", TOKEN);
    if (result.includes("://")) fail("universal-delivery-output-reference-invalid");
    return result;
  }).sort();
}

function exactSubset(value, allowedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) fail(code);
}

function exactOptional(value, allowedKeys, optionalKeys, code, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedKeys.has(key)) || required.some((key) => !Object.hasOwn(value, key))) fail(code);
  for (const key of optionalKeys) if (Object.hasOwn(value, key) && value[key] === undefined) fail(code);
}

function optionalToken(value, maximum, code) {
  if (value === undefined) return undefined;
  return bounded(value, maximum, code, TOKEN);
}

function bounded(value, maximum, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(code);
  return value;
}

function allowed(value, values, code) {
  if (!values.has(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) fail(code);
  return new Date(ms).toISOString();
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

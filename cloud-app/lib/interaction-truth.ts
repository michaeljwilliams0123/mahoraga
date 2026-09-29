import type { RuntimeDeliveryTruth, RuntimeInteractionTruth } from "./runtime-relay";

export type InteractionTruthState = "observed" | "hold" | "absent";
export type ProjectedInteractionTruth = {
  state: InteractionTruthState;
  reason: string;
  interaction: RuntimeInteractionTruth | null;
  delivery: RuntimeDeliveryTruth | null;
};

const INTERACTION_KEYS = new Set([
  "status", "interactionId", "sourceFamily", "channelFamily", "modalities",
  "protocolFamily", "protocolVersion", "locale", "timezone", "direction",
  "unitSystem", "currency", "deviceClass", "networkClass", "executionStatus",
  "interactionFingerprint", "negotiationFingerprint", "executionFingerprint",
  "observedAt", "reason",
]);
const DELIVERY_KEYS = new Set([
  "status", "interactionId", "taskId", "chainId", "outputReferences",
  "deliveryFingerprint", "observedAt", "reason",
]);
const WRAPPER_KEYS = new Set(["interaction", "delivery"]);
const MODALITIES = new Set(["text", "structured", "file", "image", "audio", "video", "event"]);
const PROTOCOLS = new Set(["native", "http-json", "mcp", "webhook", "sse", "websocket", "queue"]);
const DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
const UNIT_SYSTEMS = new Set(["metric", "us", "uk"]);
const DEVICE_CLASSES = new Set(["phone", "tablet", "desktop", "embedded", "headless"]);
const NETWORK_CLASSES = new Set(["online", "degraded", "offline"]);
const INTERACTION_STATUSES = new Set(["observed", "hold"]);
const DELIVERY_STATUSES = new Set(["delivered", "queued", "hold"]);
const FORBIDDEN_KEYS = new Set([
  "authority", "actionAuthority", "trafficAuthority", "trafficAuthorityVerified",
  "providerRoute", "route", "credentials", "credential", "headers", "authorization",
  "token", "secret", "lease", "spendingAuthority", "imei", "macAddress",
  "advertisingId", "screenFingerprint", "hardwareId",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasForbiddenKey(value: unknown): boolean {
  const candidate = record(value);
  if (!candidate) return false;
  for (const [key, nested] of Object.entries(candidate)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (Array.isArray(nested)) {
      if (nested.some((item) => hasForbiddenKey(item))) return true;
    } else if (hasForbiddenKey(nested)) {
      return true;
    }
  }
  return false;
}

function boundedString(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function optionalBoundedString(value: unknown, max = 256): value is string | null | undefined {
  return value === undefined || value === null || boundedString(value, max);
}

function stableIdentifier(value: unknown, max = 256): value is string {
  return boundedString(value, max) && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) && !/^https?:\/\//i.test(value);
}

function optionalStableIdentifier(value: unknown, max = 256): value is string | null | undefined {
  return value === undefined || value === null || stableIdentifier(value, max);
}

function isoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function validLocale(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch { return false; }
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; } catch { return false; }
}

function validInteraction(value: unknown): value is RuntimeInteractionTruth {
  const candidate = record(value);
  if (!candidate || !hasOnlyKeys(candidate, INTERACTION_KEYS) || hasForbiddenKey(candidate)) return false;
  if (!INTERACTION_STATUSES.has(String(candidate.status))) return false;
  if (!stableIdentifier(candidate.interactionId)) return false;
  if (!stableIdentifier(candidate.sourceFamily) || !stableIdentifier(candidate.channelFamily)) return false;
  if (!Array.isArray(candidate.modalities) || candidate.modalities.length === 0 || candidate.modalities.length > 7) return false;
  if (new Set(candidate.modalities).size !== candidate.modalities.length || !candidate.modalities.every((item) => typeof item === "string" && MODALITIES.has(item))) return false;
  if (!PROTOCOLS.has(String(candidate.protocolFamily))) return false;
  if (!optionalBoundedString(candidate.protocolVersion, 32)) return false;
  if (candidate.locale !== undefined && candidate.locale !== null && !validLocale(candidate.locale)) return false;
  if (candidate.timezone !== undefined && candidate.timezone !== null && !validTimezone(candidate.timezone)) return false;
  if (candidate.direction !== undefined && candidate.direction !== null && !DIRECTIONS.has(String(candidate.direction))) return false;
  if (candidate.unitSystem !== undefined && candidate.unitSystem !== null && !UNIT_SYSTEMS.has(String(candidate.unitSystem))) return false;
  if (candidate.currency !== undefined && candidate.currency !== null && (typeof candidate.currency !== "string" || !/^[A-Z]{3}$/.test(candidate.currency))) return false;
  if (candidate.deviceClass !== undefined && candidate.deviceClass !== null && !DEVICE_CLASSES.has(String(candidate.deviceClass))) return false;
  if (candidate.networkClass !== undefined && candidate.networkClass !== null && !NETWORK_CLASSES.has(String(candidate.networkClass))) return false;
  if (!optionalBoundedString(candidate.executionStatus, 64)) return false;
  if (!stableIdentifier(candidate.interactionFingerprint, 256)) return false;
  if (!optionalStableIdentifier(candidate.negotiationFingerprint, 256) || !optionalStableIdentifier(candidate.executionFingerprint, 256)) return false;
  if (candidate.observedAt !== undefined && candidate.observedAt !== null && !isoTimestamp(candidate.observedAt)) return false;
  if (!optionalBoundedString(candidate.reason, 160)) return false;
  return true;
}

function validDelivery(value: unknown): value is RuntimeDeliveryTruth {
  const candidate = record(value);
  if (!candidate || !hasOnlyKeys(candidate, DELIVERY_KEYS) || hasForbiddenKey(candidate)) return false;
  if (!DELIVERY_STATUSES.has(String(candidate.status))) return false;
  if (!stableIdentifier(candidate.interactionId)) return false;
  if (!optionalStableIdentifier(candidate.taskId) || !optionalStableIdentifier(candidate.chainId)) return false;
  if (!Array.isArray(candidate.outputReferences) || candidate.outputReferences.length > 32) return false;
  if (new Set(candidate.outputReferences).size !== candidate.outputReferences.length) return false;
  if (!candidate.outputReferences.every((item) => stableIdentifier(item, 512))) return false;
  if (!stableIdentifier(candidate.deliveryFingerprint, 256)) return false;
  if (candidate.observedAt !== undefined && candidate.observedAt !== null && !isoTimestamp(candidate.observedAt)) return false;
  if (!optionalBoundedString(candidate.reason, 160)) return false;
  return true;
}

export function projectInteractionTruth(value: unknown): ProjectedInteractionTruth {
  if (value === null || value === undefined) {
    return { state: "absent", reason: "interaction-truth-absent", interaction: null, delivery: null };
  }
  const wrapper = record(value);
  if (!wrapper || !hasOnlyKeys(wrapper, WRAPPER_KEYS) || hasForbiddenKey(wrapper)) {
    return { state: "hold", reason: "interaction-truth-invalid-or-forbidden", interaction: null, delivery: null };
  }
  const interactionValue = wrapper.interaction;
  const deliveryValue = wrapper.delivery;
  if (interactionValue === null || interactionValue === undefined) {
    if (deliveryValue === null || deliveryValue === undefined) {
      return { state: "absent", reason: "interaction-truth-absent", interaction: null, delivery: null };
    }
    return { state: "hold", reason: "delivery-without-interaction", interaction: null, delivery: null };
  }
  if (!validInteraction(interactionValue)) {
    return { state: "hold", reason: "interaction-truth-invalid-or-forbidden", interaction: null, delivery: null };
  }
  const interaction = Object.freeze({ ...interactionValue, modalities: Object.freeze([...interactionValue.modalities]) }) as RuntimeInteractionTruth;
  let delivery: RuntimeDeliveryTruth | null = null;
  if (deliveryValue !== null && deliveryValue !== undefined) {
    if (!validDelivery(deliveryValue)) {
      return { state: "hold", reason: "delivery-truth-invalid-or-forbidden", interaction, delivery: null };
    }
    if (deliveryValue.interactionId !== interaction.interactionId) {
      return { state: "hold", reason: "interaction-delivery-mismatch", interaction, delivery: null };
    }
    delivery = Object.freeze({ ...deliveryValue, outputReferences: Object.freeze([...deliveryValue.outputReferences]) }) as RuntimeDeliveryTruth;
  }
  if (interaction.status === "hold") {
    return { state: "hold", reason: interaction.reason ?? "interaction-held", interaction, delivery };
  }
  if (delivery?.status === "hold") {
    return { state: "hold", reason: delivery.reason ?? "delivery-held", interaction, delivery };
  }
  return { state: "observed", reason: "interaction-truth-observed", interaction, delivery };
}

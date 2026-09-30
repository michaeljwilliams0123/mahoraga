import { createHash } from "node:crypto";
// @ts-expect-error Canonical runtime-neutral JavaScript contract.
import { validateUniversalInteractionEnvelope } from "../../src/universal-interaction-envelope.mjs";
// @ts-expect-error Canonical runtime-neutral JavaScript contract.
import { validateInteractionNegotiationReceipt } from "../../src/interaction-protocol-negotiation.mjs";
// @ts-expect-error Canonical runtime-neutral JavaScript contract.
import { projectUniversalDeliveryReceipt } from "../../src/universal-delivery.mjs";

type RuntimeInteractionTransportFamily = "native" | "http-json";
const TRUSTED_RUNTIME_TRANSPORTS: ReadonlySet<RuntimeInteractionTransportFamily> = new Set(["native", "http-json"]);
const EXECUTION_KEYS = new Set(["status", "taskId", "chainId", "handoffCount", "receipts"]);
const EXECUTION_RECEIPT_KINDS = new Set(["route-selection-receipt", "handoff-receipt", "execution-receipt"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

export function projectInteractionContext(envelope: unknown, negotiationReceipt: unknown, { now = new Date().toISOString() } = {}) {
  const interaction = validateUniversalInteractionEnvelope(envelope, { now });
  const negotiation = validateInteractionNegotiationReceipt(negotiationReceipt);
  bindNegotiation(interaction, negotiation);
  if (negotiation.status !== "accepted") throw new Error(`interaction-negotiation-hold:${negotiation.reason}`);
  if (!TRUSTED_RUNTIME_TRANSPORTS.has(negotiation.protocolFamily)) throw new Error("interaction-runtime-transport-unavailable");
  const presentation = interaction.presentation as Record<string, unknown>;
  return deepFreeze({
    interactionId: interaction.interactionId,
    modalities: [...interaction.modalities],
    protocolFamily: negotiation.protocolFamily,
    ...(typeof presentation.locale === "string" ? { locale:presentation.locale } : {}),
    ...(typeof presentation.deviceClass === "string" ? { deviceClass:presentation.deviceClass } : {}),
    ...(typeof presentation.networkClass === "string" ? { networkClass:presentation.networkClass } : {}),
  });
}

export function projectInteractionRuntimeTruth(input: unknown, { now = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("interaction-runtime-input-invalid");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !new Set(["envelope","negotiationReceipt","execution","deliveryState"]).has(key))) fail("interaction-runtime-input-invalid");
  const interaction = validateUniversalInteractionEnvelope(value.envelope, { now });
  const negotiation = validateInteractionNegotiationReceipt(value.negotiationReceipt);
  bindNegotiation(interaction, negotiation);
  if (negotiation.status !== "accepted") fail(`interaction-negotiation-hold:${negotiation.reason}`);
  if (!TRUSTED_RUNTIME_TRANSPORTS.has(negotiation.protocolFamily)) fail("interaction-runtime-transport-unavailable");
  const execution = normalizeExecution(value.execution);
  const delivery = value.deliveryState === undefined ? null : projectUniversalDeliveryReceipt(value.deliveryState);
  if (delivery !== null) {
    if (delivery.interactionId !== interaction.interactionId) fail("interaction-runtime-delivery-mismatch");
    if (delivery.taskId !== undefined && (delivery.taskId !== execution.taskId || delivery.chainId !== execution.chainId)) {
      fail("interaction-runtime-delivery-mismatch");
    }
  }
  const observedAt = timestamp(now, "interaction-runtime-time-invalid");
  const presentation = interaction.presentation as Record<string, unknown>;
  const interactionTruth = deepFreeze({
    status:"observed",
    interactionId:interaction.interactionId,
    sourceFamily:"omnichannel",
    channelFamily:"cloudflare-runtime",
    modalities:[...interaction.modalities],
    protocolFamily:negotiation.protocolFamily,
    protocolVersion:negotiation.protocolVersion,
    ...(typeof presentation.locale === "string" ? { locale:presentation.locale } : {}),
    ...(typeof presentation.timeZone === "string" ? { timezone:presentation.timeZone } : {}),
    ...(typeof presentation.direction === "string" ? { direction:presentation.direction } : {}),
    ...(typeof presentation.measurementSystem === "string" ? { unitSystem:presentation.measurementSystem } : {}),
    ...(typeof presentation.currency === "string" ? { currency:presentation.currency } : {}),
    ...(typeof presentation.deviceClass === "string" ? { deviceClass:presentation.deviceClass } : {}),
    ...(typeof presentation.networkClass === "string" ? { networkClass:presentation.networkClass } : {}),
    executionStatus:"completed",
    interactionFingerprint:interaction.fingerprint,
    negotiationFingerprint:negotiation.fingerprint,
    executionFingerprint:execution.fingerprint,
    observedAt,
    reason:"accepted",
  });
  const deliveryTruth = delivery === null ? null : deepFreeze({
    status:delivery.status,
    interactionId:delivery.interactionId,
    ...(delivery.taskId === undefined ? {} : { taskId:delivery.taskId, chainId:delivery.chainId }),
    outputReferences:[...delivery.outputReferences],
    deliveryFingerprint:delivery.fingerprint,
    observedAt:delivery.deliveredAt ?? observedAt,
    reason:delivery.reason,
  });
  return deepFreeze({ interactionTruth, deliveryTruth });
}

export function interactionNegotiationHoldReason(error: unknown) {
  if (!(error instanceof Error)) return null;
  const match = /^interaction-negotiation-hold:([a-z][a-z0-9-]*)$/.exec(error.message);
  return match?.[1] ?? null;
}

function bindNegotiation(interaction: Record<string, unknown>, negotiation: Record<string, unknown>) {
  if (
    negotiation.interactionId !== interaction.interactionId ||
    negotiation.interactionFingerprint !== interaction.fingerprint
  ) fail("interaction-runtime-negotiation-mismatch");
  if (
    negotiation.status === "accepted" && (
      negotiation.protocolFamily !== (interaction.protocol as Record<string, unknown>).family ||
      negotiation.protocolVersion !== (interaction.protocol as Record<string, unknown>).version
    )
  ) fail("interaction-runtime-negotiation-mismatch");
}

function normalizeExecution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("interaction-runtime-execution-invalid");
  const execution = value as Record<string, unknown>;
  if (Object.keys(execution).some((key) => !EXECUTION_KEYS.has(key)) || EXECUTION_KEYS.size !== Object.keys(execution).length) fail("interaction-runtime-execution-invalid");
  if (execution.status !== "complete") fail("interaction-runtime-execution-invalid");
  const taskId = bounded(execution.taskId, 200, "interaction-runtime-execution-invalid", TOKEN);
  const chainId = bounded(execution.chainId, 200, "interaction-runtime-execution-invalid", TOKEN);
  if (!Number.isSafeInteger(execution.handoffCount) || Number(execution.handoffCount) < 0 || Number(execution.handoffCount) > 16) fail("interaction-runtime-execution-invalid");
  if (!Array.isArray(execution.receipts) || execution.receipts.length > 64) fail("interaction-runtime-execution-invalid");
  const receiptRefs = execution.receipts.map((raw, index) => sanitizeReceiptReference(raw, taskId, chainId, index));
  return deepFreeze({
    status:"complete",
    taskId,
    chainId,
    handoffCount:Number(execution.handoffCount),
    receiptRefs,
    fingerprint:digest(canonicalJson({ status:"complete", taskId, chainId, handoffCount:Number(execution.handoffCount), receiptRefs })),
  });
}

function sanitizeReceiptReference(value: unknown, taskId: string, chainId: string, index: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("interaction-runtime-execution-invalid");
  const receipt = value as Record<string, unknown>;
  if (!EXECUTION_RECEIPT_KINDS.has(String(receipt.kind)) || receipt.taskId !== taskId || receipt.chainId !== chainId) fail("interaction-runtime-execution-invalid");
  const result: Record<string, unknown> = { index, kind:String(receipt.kind), taskId, chainId };
  if (typeof receipt.id === "string") result.id = bounded(receipt.id, 200, "interaction-runtime-execution-invalid", TOKEN);
  if (typeof receipt.capability === "string") result.capability = bounded(receipt.capability, 80, "interaction-runtime-execution-invalid", TOKEN);
  if (typeof receipt.requiredNextCapability === "string") result.requiredNextCapability = bounded(receipt.requiredNextCapability, 80, "interaction-runtime-execution-invalid", TOKEN);
  if (Number.isSafeInteger(receipt.hopCount)) result.hopCount = Number(receipt.hopCount);
  return result;
}

function bounded(value: unknown, maximum: number, code: string, pattern: RegExp) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !pattern.test(value)) fail(code);
  return value;
}

function timestamp(value: unknown, code: string) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(ms)) fail(code);
  return new Date(ms).toISOString();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code: string): never {
  throw new Error(code);
}

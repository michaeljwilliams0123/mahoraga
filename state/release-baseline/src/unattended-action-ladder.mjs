import { deriveTaskIntakeFromOmnichannelEnvelope, validateOmnichannelEnvelope } from "./omnichannel-intake.mjs";

export const AUTONOMY_ACTION_PACKS = Object.freeze([
  Object.freeze({ actionPackId: "email-triage", connectorFamily: "microsoft", allowedActionClass: "draft", preferredCapability: "assistant.respond", tier: 2 }),
  Object.freeze({ actionPackId: "teams-triage", connectorFamily: "microsoft", allowedActionClass: "draft", preferredCapability: "assistant.respond", tier: 2 }),
  Object.freeze({ actionPackId: "file-intake", connectorFamily: "file", allowedActionClass: "triage", preferredCapability: "artifact.inspect", tier: 2 }),
  Object.freeze({ actionPackId: "drive-fetch", connectorFamily: "google", allowedActionClass: "triage", preferredCapability: "artifact.inspect", tier: 2 }),
  Object.freeze({ actionPackId: "github-status-report", connectorFamily: "github", allowedActionClass: "observe", preferredCapability: "repository.inspect", tier: 1 }),
  Object.freeze({ actionPackId: "scheduled-follow-up", connectorFamily: "queue", allowedActionClass: "execute-pack", preferredCapability: "assistant.respond", tier: 3 }),
]);

const APPROVAL_STATES = new Set(["withheld", "approved"]);
const DECISION_STATUSES = new Set(["dispatch", "hold", "approval-required"]);

export function classifyAutonomyTier(actionClass) {
  if (actionClass === "observe") return 1;
  if (actionClass === "triage" || actionClass === "draft") return 2;
  if (actionClass === "execute-pack") return 3;
  return 4;
}

export function planUnattendedAction({
  envelope,
  connectorRecords = [],
  localReasonerReady = false,
  zeroCreditReadyCapabilities = [],
  approvalState = "withheld",
} = {}) {
  const normalized = validateOmnichannelEnvelope(envelope);
  if (!APPROVAL_STATES.has(approvalState)) fail("autonomy-action-approval-invalid");
  if (!Array.isArray(zeroCreditReadyCapabilities) || zeroCreditReadyCapabilities.length > 64) fail("autonomy-action-capabilities-invalid");
  const tier = classifyAutonomyTier(normalized.allowedActionClass);
  const intake = deriveTaskIntakeFromOmnichannelEnvelope(normalized);
  const pack = selectActionPack(normalized);
  const connector = findConnector(connectorRecords, normalized.channelFamily);
  if (normalized.zeroCreditEligible !== true) return decision("hold", tier, pack, intake, "zero-credit-required");
  if (!connector) return decision("hold", tier, pack, intake, "connector-unavailable");
  if (connector.trustState !== "ready" || connector.zeroCreditReady !== true) return decision("hold", tier, pack, intake, "connector-not-ready");
  if (tier >= 4 && approvalState !== "approved") return decision("approval-required", tier, pack, intake, "high-impact-approval-required");
  if (pack.preferredCapability === "assistant.respond"
    && !zeroCreditReadyCapabilities.includes("assistant.respond")
    && localReasonerReady !== true) return decision("hold", tier, pack, intake, "wait-for-local-reasoner");
  if (!zeroCreditReadyCapabilities.includes(pack.preferredCapability)
    && !(pack.preferredCapability === "assistant.respond" && localReasonerReady === true)) {
    return decision("hold", tier, pack, intake, "capability-not-ready");
  }
  return decision("dispatch", tier, pack, intake, "bounded-action-admitted");
}

function selectActionPack(envelope) {
  const actionPackId = envelope.routeHint.actionPackId;
  const direct = AUTONOMY_ACTION_PACKS.find((item) => item.actionPackId === actionPackId);
  if (direct) return direct;
  return AUTONOMY_ACTION_PACKS.find((item) => item.connectorFamily === envelope.channelFamily)
    ?? AUTONOMY_ACTION_PACKS.find((item) => item.actionPackId === "file-intake");
}

function findConnector(records, family) {
  if (!Array.isArray(records)) fail("autonomy-action-connectors-invalid");
  return records.find((item) => item?.family === family) ?? null;
}

function decision(status, tier, pack, intake, reasonCode) {
  if (!DECISION_STATUSES.has(status)) fail("autonomy-action-status-invalid");
  return Object.freeze({
    schemaVersion: 1,
    status,
    tier,
    actionPackId: pack.actionPackId,
    connectorFamily: pack.connectorFamily,
    preferredCapability: pack.preferredCapability,
    nextAction: status === "dispatch" ? "dispatch-credit-free" : status === "approval-required" ? "request-approval" : reasonCode,
    reasonCode,
    taskIntake: intake,
    zeroCredit: true,
    paidFallback: false,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

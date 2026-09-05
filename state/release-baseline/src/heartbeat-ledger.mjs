import { compoundCreditFreeLearning, validateHeartbeatReceipt } from "./autonomy-heartbeat.mjs";
import { compoundCreditFreeSkills } from "./credit-free-skill-compound.mjs";

export const HEARTBEAT_LEDGER_KIND = "credit-free-heartbeat-ledger";
export const HEARTBEAT_LEDGER_SCHEMA_VERSION = 1;
export const HEARTBEAT_LEDGER_CAP = 256;

export function createHeartbeatLedger(records = []) {
  if (!Array.isArray(records)) fail("heartbeat-ledger-invalid");
  const receipts = [];
  let duplicatesSuppressed = 0;
  for (const record of records) {
    const result = appendHeartbeatReceipt(receipts, record);
    if (result.appended === false && result.reason === "duplicate-suppressed") duplicatesSuppressed += 1;
  }
  return freezeLedger(receipts, duplicatesSuppressed);
}

export function appendHeartbeatReceipt(receipts, receipt) {
  if (!Array.isArray(receipts)) fail("heartbeat-ledger-invalid");
  validateHeartbeatReceipt(receipt);
  const duplicate = receipts.some((existing) => sameReceipt(existing, receipt));
  if (duplicate) return Object.freeze({ appended: false, reason: "duplicate-suppressed" });
  while (receipts.length >= HEARTBEAT_LEDGER_CAP) receipts.shift();
  receipts.push(Object.freeze({ ...receipt }));
  return Object.freeze({ appended: true, reason: "accepted" });
}

export function reduceHeartbeatLedger(records = []) {
  const ledger = createHeartbeatLedger(records);
  return Object.freeze({
    ...ledger,
    learning: ledger.learning,
    skills: ledger.skills,
  });
}

function freezeLedger(receipts, duplicatesSuppressed) {
  const learning = compoundCreditFreeLearning(receipts);
  const learnedAt = learning.lastObservedAt ?? "2026-09-05T00:00:00.000Z";
  const skills = compoundCreditFreeSkills({ learning, learnedAt });
  return Object.freeze({
    schemaVersion: HEARTBEAT_LEDGER_SCHEMA_VERSION,
    kind: HEARTBEAT_LEDGER_KIND,
    receipts: Object.freeze([...receipts]),
    heartbeatCount: receipts.length,
    duplicatesSuppressed,
    lastObservedAt: learning.lastObservedAt,
    lastHealthyAt: learning.lastHealthyAt,
    creditCost: 0,
    paidFallback: false,
    learning,
    skills,
  });
}

function sameReceipt(left, right) {
  return left.observedAt === right.observedAt
    && left.worldDigest === right.worldDigest
    && left.nextAction === right.nextAction
    && left.intentKind === right.intentKind;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

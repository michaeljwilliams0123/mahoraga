import test from "node:test";
import assert from "node:assert/strict";
import { runCreditFreeHeartbeat } from "../src/autonomy-heartbeat.mjs";
import { HEARTBEAT_LEDGER_KIND, createHeartbeatLedger, reduceHeartbeatLedger } from "../src/heartbeat-ledger.mjs";

const NOW = new Date("2026-09-05T08:00:00.000Z");
const LATER = new Date("2026-09-05T08:04:00.000Z");
const EARLIER = new Date("2026-09-05T07:00:00.000Z");

const UNCONFIGURED_DESTINY = Object.freeze({
  schemaVersion: 1,
  triggerId: "destiny-event-dispatch-v1",
  repository: "michaeljwilliams0123/mahoraga",
  owner: "michaeljwilliams0123",
  readinessMaxAgeMs: 300000,
  zeroCreditRequired: true,
  receiptTrust: { mode: "unconfigured" },
});

test("heartbeat ledger appends content-free receipts and suppresses duplicates", () => {
  const first = runCreditFreeHeartbeat({ now: NOW, world: { openIssues: 2 } });
  const duplicate = runCreditFreeHeartbeat({ now: NOW, world: { openIssues: 2 } });
  const second = runCreditFreeHeartbeat({ now: LATER, requestedProvider: "ollama" });
  const ledger = createHeartbeatLedger([first, duplicate, second]);
  assert.equal(ledger.kind, HEARTBEAT_LEDGER_KIND);
  assert.equal(ledger.heartbeatCount, 2);
  assert.equal(ledger.duplicatesSuppressed, 1);
  assert.equal(ledger.creditCost, 0);
  assert.equal(ledger.paidFallback, false);
  assert.equal(JSON.stringify(ledger).includes("prompt"), false);
});

test("ledger compounding records Destiny unreadiness without buying a probe", () => {
  const receipt = runCreditFreeHeartbeat({
    now: NOW,
    destinyManifest: UNCONFIGURED_DESTINY,
  });
  const reduced = reduceHeartbeatLedger([receipt]);
  assert.equal(reduced.learning.zeroCredit, true);
  assert.equal(reduced.learning.gaps.some((item) => item.id === "heartbeat-destiny-trigger-not-ready"), true);
  assert.equal(reduced.receipts[0].destinyTrigger.ready, false);
  assert.equal(reduced.receipts[0].destinyTrigger.reason, "destiny-trigger-identity-unconfigured");
  assert.throws(() => createHeartbeatLedger([{ ...receipt, creditCost: 1 }]), /heartbeat-paid-contamination/);
  assert.throws(() => createHeartbeatLedger([{ ...receipt, paidFallback: null }]), /heartbeat-paid-contamination/);
});

test("ledger lastObservedAt follows canonical chronology, not input order", () => {
  const newer = runCreditFreeHeartbeat({ now: LATER, world: { openIssues: 1 } });
  const older = runCreditFreeHeartbeat({ now: EARLIER, world: { openIssues: 2 } });
  const ledger = createHeartbeatLedger([newer, older]);
  assert.equal(ledger.lastObservedAt, "2026-09-05T08:04:00.000Z");
  assert.equal(ledger.lastHealthyAt, "2026-09-05T08:04:00.000Z");
});

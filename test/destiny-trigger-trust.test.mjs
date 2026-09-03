import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDestinyTriggerTrustManifest,
  evaluateDestinyTriggerReadiness,
  validateDestinyTriggerReceipt,
  reduceDestinyReceiptLifecycle,
} from "../src/destiny-trigger-trust.mjs";

const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const headSha = "a".repeat(40);
const requestSha256 = "b".repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    owner,
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust: { mode: "dedicated-actor", actorLogin: "destiny-codex-trigger[bot]" },
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    status: "ready",
    observedAt: "2026-09-03T02:00:00.000Z",
    zeroCreditEligible: true,
    actorLogin: "destiny-codex-trigger[bot]",
    installationFingerprint: "gha-installation:destiny:v1",
    ...overrides,
  };
}

function receipt(kind, overrides = {}) {
  return {
    schemaVersion: 1,
    kind,
    repository,
    pullRequest: 101,
    dispatchId: "dcx-0123456789abcdef01234567",
    requestSha256,
    headSha,
    deliveryId: `delivery-${kind}`,
    status: kind === "result" ? "success" : kind,
    observedAt: "2026-09-03T02:00:10.000Z",
    actorLogin: "destiny-codex-trigger[bot]",
    ...overrides,
  };
}

test("unconfigured trust is valid but never ready", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest({ receiptTrust: { mode: "unconfigured" } }));
  const readiness = evaluateDestinyTriggerReadiness(configured, observation(), { now: "2026-09-03T02:00:30.000Z" });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, "destiny-trigger-identity-unconfigured");
});

test("dedicated actor must be distinct from repository owner", () => {
  assert.throws(() => validateDestinyTriggerTrustManifest(manifest({ receiptTrust: { mode: "dedicated-actor", actorLogin: owner } })), /destiny-trigger-actor-not-independent/);
});

test("readiness requires exact identity, freshness, and zero-credit eligibility", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest());
  assert.equal(evaluateDestinyTriggerReadiness(configured, observation(), { now: "2026-09-03T02:03:00.000Z" }).ready, true);
  assert.equal(evaluateDestinyTriggerReadiness(configured, observation({ zeroCreditEligible: false }), { now: "2026-09-03T02:03:00.000Z" }).reason, "destiny-trigger-zero-credit-not-eligible");
  assert.equal(evaluateDestinyTriggerReadiness(configured, observation({ actorLogin: "someone-else" }), { now: "2026-09-03T02:03:00.000Z" }).reason, "destiny-trigger-actor-mismatch");
  assert.equal(evaluateDestinyTriggerReadiness(configured, observation(), { now: "2026-09-03T02:10:00.001Z" }).reason, "destiny-trigger-readiness-stale");
});

test("trusted receipts bind full hashes, exact head, delivery id, and independent actor", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest());
  assert.equal(validateDestinyTriggerReceipt(configured, receipt("acked")).kind, "acked");
  assert.throws(() => validateDestinyTriggerReceipt(configured, receipt("acked", { requestSha256: requestSha256.slice(0, 12) })), /destiny-trigger-receipt-invalid/);
  assert.throws(() => validateDestinyTriggerReceipt(configured, receipt("acked", { headSha: headSha.slice(0, 12) })), /destiny-trigger-receipt-invalid/);
  assert.throws(() => validateDestinyTriggerReceipt(configured, receipt("acked", { actorLogin: owner })), /destiny-trigger-receipt-actor-mismatch/);
});

test("receipt lifecycle is monotonic, suppresses identical duplicates, and rejects conflicts", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest());
  const correlation = { repository, pullRequest: 101, dispatchId: "dcx-0123456789abcdef01234567", requestSha256, headSha, createdAt: "2026-09-03T02:00:00.000Z" };
  const ack = receipt("acked", { deliveryId: "delivery-1", observedAt: "2026-09-03T02:00:10.000Z" });
  const running = receipt("running", { deliveryId: "delivery-2", observedAt: "2026-09-03T02:00:20.000Z" });
  const result = receipt("result", { deliveryId: "delivery-3", observedAt: "2026-09-03T02:00:30.000Z" });
  const lifecycle = reduceDestinyReceiptLifecycle(configured, correlation, [ack, ack, running, result], { now: "2026-09-03T02:01:00.000Z" });
  assert.equal(lifecycle.state, "result");
  assert.equal(lifecycle.duplicatesSuppressed, 1);
  assert.throws(() => reduceDestinyReceiptLifecycle(configured, correlation, [ack, receipt("running", { deliveryId: "delivery-1" })], { now: "2026-09-03T02:01:00.000Z" }), /destiny-trigger-receipt-delivery-conflict/);
  assert.throws(() => reduceDestinyReceiptLifecycle(configured, correlation, [running, ack], { now: "2026-09-03T02:01:00.000Z" }), /destiny-trigger-receipt-out-of-order/);
  assert.throws(() => reduceDestinyReceiptLifecycle(configured, correlation, [result, running], { now: "2026-09-03T02:01:00.000Z" }), /destiny-trigger-receipt-after-terminal/);
});

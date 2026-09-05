import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDestinyTriggerMetrics,
  recordDestinyTriggerMetric,
  summarizeDestinyTriggerMetrics,
} from "../src/destiny-trigger-metrics.mjs";

test("metrics stay content-free and fail closed on prompts or secrets", () => {
  const empty = emptyDestinyTriggerMetrics();
  assert.equal(empty.creditCost, 0);
  assert.equal(empty.paidFallback, false);
  assert.throws(() => recordDestinyTriggerMetric(empty, { type: "validation-rejected", prompt: "nope" }), /destiny-metrics-field-forbidden/);
  assert.throws(() => recordDestinyTriggerMetric(empty, { type: "validation-rejected", reason: "secret-token-leak" }), /destiny-metrics-reason-invalid/);
});

test("aggregates dispatch, validation, latency, duplicates, and expiry without storing payloads", () => {
  let metrics = emptyDestinyTriggerMetrics();
  metrics = recordDestinyTriggerMetric(metrics, { type: "dispatch-created" });
  metrics = recordDestinyTriggerMetric(metrics, { type: "validation-accepted" });
  metrics = recordDestinyTriggerMetric(metrics, { type: "validation-rejected", reason: "envelope-invalid" });
  metrics = recordDestinyTriggerMetric(metrics, { type: "acked", latencyMs: 1200, healthy: true, observedAt: "2026-09-05T13:00:00.000Z", actorFingerprint: "gha:destiny:v1" });
  metrics = recordDestinyTriggerMetric(metrics, { type: "result", latencyMs: 4800 });
  metrics = recordDestinyTriggerMetric(metrics, { type: "duplicate-suppressed" });
  metrics = recordDestinyTriggerMetric(metrics, { type: "expired-no-ack" });
  const summary = summarizeDestinyTriggerMetrics(metrics);
  assert.equal(summary.dispatchesCreated, 1);
  assert.equal(summary.validationAccepted, 1);
  assert.equal(summary.validationRejected, 1);
  assert.equal(summary.rejectReasons["envelope-invalid"], 1);
  assert.equal(summary.ackLatencyAvgMs, 1200);
  assert.equal(summary.resultLatencyAvgMs, 4800);
  assert.equal(summary.duplicatesSuppressed, 1);
  assert.equal(summary.expiredNoAck, 1);
  assert.equal(summary.lastHealthyAt, "2026-09-05T13:00:00.000Z");
  assert.equal(summary.actorFingerprint, "gha:destiny:v1");
  assert.equal(summary.creditCost, 0);
});

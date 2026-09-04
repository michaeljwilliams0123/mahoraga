import test from "node:test";
import assert from "node:assert/strict";
import { createAutonomyCycleEnvelope, validateAutonomyCycleEnvelope } from "../src/autonomy-cycle-contract.mjs";

const now = new Date("2026-08-29T08:30:00.000Z");
const windowStartedAt = "2026-08-29T08:17:00.000Z";
const baseSha = "90007aa751ba8b1128062a6aa35053305f309381";
const options = { now, expectedBaseSha: baseSha, registeredProjectIds: ["mahoraga"], existingCycleIds: [] };

test("creates the exact frozen four-hour GitHub schedule envelope", () => {
  const envelope = createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt, baseSha }, options);
  assert.deepEqual(envelope, { schemaVersion: 1, cycleId: "mahoraga:2026-08-29T08:17:00.000Z", projectId: "mahoraga", source: "github-schedule", windowStartedAt, baseSha, workflowId: "sovereign-four-hour-cycle", maximumDurationMs: 7_200_000, maximumActions: 12, maximumRepairAttempts: 2, normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0 });
  assert.equal(Object.isFrozen(envelope), true);
});

test("accepts the next four-hour window and rejects non-window starts", () => {
  const nextWindow = "2026-08-29T12:17:00.000Z";
  const nextOptions = { ...options, now: new Date("2026-08-29T12:30:00.000Z") };
  assert.equal(createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt: nextWindow, baseSha }, nextOptions).windowStartedAt, nextWindow);
  assert.throws(() => createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt: "2026-08-29T10:17:00.000Z", baseSha }, nextOptions), /window/);
});

test("rejects contract fields and values that could widen an autonomous cycle", () => {
  const envelope = createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt, baseSha }, options);
  for (const mutation of [{ extra: true }, { baseSha: baseSha.toUpperCase() }, { maximumDurationMs: 7_200_001 }, { maximumActions: 13 }, { maximumRepairAttempts: 3 }, { normalCreditBudget: 1 }, { hostedComputeSpendCeilingUsd: 0.01 }]) {
    assert.throws(() => validateAutonomyCycleEnvelope({ ...envelope, ...mutation }, options), /Autonomy cycle envelope/);
  }
  const { maximumActions, ...missing } = envelope;
  assert.throws(() => validateAutonomyCycleEnvelope(missing, options), /field is missing/);
});

test("requires an injected authoritative base SHA that exactly matches the envelope", () => {
  const envelope = createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt, baseSha }, options);
  assert.throws(() => validateAutonomyCycleEnvelope(envelope, { ...options, expectedBaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), /base SHA/);
  const { expectedBaseSha, ...withoutAuthority } = options;
  assert.throws(() => validateAutonomyCycleEnvelope(envelope, withoutAuthority), /expected base SHA/);
});

test("rejects unregistered, stale, non-window, nondeterministic, and duplicate cycle identities", () => {
  const envelope = createAutonomyCycleEnvelope({ projectId: "mahoraga", windowStartedAt, baseSha }, options);
  assert.throws(() => validateAutonomyCycleEnvelope({ ...envelope, projectId: "other" }, options), /project/);
  assert.throws(() => validateAutonomyCycleEnvelope({ ...envelope, windowStartedAt: "2026-08-29T08:16:00.000Z" }, options), /window/);
  assert.throws(() => validateAutonomyCycleEnvelope({ ...envelope, windowStartedAt: "2026-08-29T04:17:00.000Z" }, options), /stale/);
  assert.throws(() => validateAutonomyCycleEnvelope({ ...envelope, cycleId: "mahoraga:other" }, options), /cycle identity/);
  assert.throws(() => validateAutonomyCycleEnvelope(envelope, { ...options, existingCycleIds: [envelope.cycleId] }), /duplicate/);
});

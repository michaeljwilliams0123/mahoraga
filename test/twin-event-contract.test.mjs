import test from "node:test";
import assert from "node:assert/strict";
import {
  createTwinEvent,
  deriveTwinEvent,
  validateTwinEvent,
  TwinEventContractError,
} from "../src/twin-event-contract.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const createdAt = "2026-09-08T01:30:00.000Z";

function presence(overrides = {}) {
  return createTwinEvent({
    lineageId: "lin-alpha-001",
    causationId: null,
    originReplicaId: "mahoraga-alpha",
    targetReplicaId: "*",
    sequence: 1,
    hopCount: 0,
    maximumHops: 8,
    kind: "presence",
    objectiveId: "obj-twin-canary",
    repository: "michaeljwilliams0123/mahoraga",
    baseSha: shaA,
    observedHeadSha: shaA,
    payload: {
      status: "ready",
      capabilities: ["analyze", "build", "review", "verify"],
    },
    createdAt,
    ...overrides,
  });
}

test("creates an immutable deterministic twin event", () => {
  const first = presence();
  const second = presence();
  assert.equal(first.schemaVersion, 1);
  assert.match(first.eventId, /^twe_[a-f0-9]{64}$/);
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.originReplicaId, "mahoraga-alpha");
  assert.equal(first.maximumHops, 8);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.payload));
  assert.deepEqual(validateTwinEvent(first), first);
});

test("event identity changes when canonical content changes", () => {
  assert.notEqual(presence().eventId, presence({ sequence: 2 }).eventId);
  assert.notEqual(presence().eventId, presence({ observedHeadSha: shaB }).eventId);
});

test("rejects unknown fields and malformed identities", () => {
  const event = presence();
  assert.throws(() => validateTwinEvent({ ...event, extra: true }), TwinEventContractError);
  assert.throws(() => presence({ originReplicaId: "bad id" }), /replica/i);
  assert.throws(() => presence({ targetReplicaId: "?" }), /target/i);
  assert.throws(() => presence({ baseSha: "main" }), /sha/i);
  assert.throws(() => presence({ observedHeadSha: "123" }), /sha/i);
});

test("rejects oversized hop budgets and exhausted derivation", () => {
  assert.throws(() => presence({ maximumHops: 17 }), /maximum-hops/i);
  const atLimit = presence({ hopCount: 8, maximumHops: 8 });
  assert.throws(() => deriveTwinEvent(atLimit, {
    originReplicaId: "mahoraga-beta",
    targetReplicaId: "mahoraga-alpha",
    sequence: 1,
    kind: "analysis-result",
    observedHeadSha: shaA,
    payload: { summary: "done" },
    createdAt,
  }), /hop-exhausted/i);
});

test("derives lineage and causation while incrementing hop count", () => {
  const parent = presence();
  const child = deriveTwinEvent(parent, {
    originReplicaId: "mahoraga-beta",
    targetReplicaId: "mahoraga-alpha",
    sequence: 1,
    kind: "analysis-result",
    observedHeadSha: shaA,
    payload: { summary: "peer is ready" },
    createdAt: "2026-09-08T01:30:01.000Z",
  });
  assert.equal(child.lineageId, parent.lineageId);
  assert.equal(child.causationId, parent.eventId);
  assert.equal(child.hopCount, 1);
  assert.equal(child.maximumHops, parent.maximumHops);
  assert.equal(child.repository, parent.repository);
  assert.equal(child.baseSha, parent.baseSha);
});

test("rejects secret-shaped payload material", () => {
  assert.throws(() => presence({ payload: { token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" } }), /payload-secret/i);
  assert.throws(() => presence({ payload: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" } }), /payload-secret/i);
  assert.throws(() => presence({ payload: { privateKey: "-----BEGIN PRIVATE KEY-----" } }), /payload-secret/i);
});

test("rejects tampered event ids", () => {
  const event = presence();
  assert.throws(() => validateTwinEvent({ ...event, eventId: `twe_${"0".repeat(64)}` }), /event-id/i);
});

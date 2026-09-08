import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRelayBroker } from "../relay/core.mjs";
import {
  cloneTwinDescriptor,
  createTwinDescriptor,
  validateTwinDescriptor,
  createTwinEvent,
  validateTwinEvent,
  createTwinInbox,
  classifyTwinConvergence,
  createTwinHandoff,
} from "../src/twin-federation.mjs";

const sha = "803baa806ad64cc2e3b4b5be75f4dcecf21e3bf1";
const sha2 = "1111111111111111111111111111111111111111";
const sha3 = "2222222222222222222222222222222222222222";
const createdAt = "2026-09-08T01:30:00.000Z";

function primary(overrides = {}) {
  return createTwinDescriptor({
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    repository: "michaeljwilliams0123/mahoraga",
    commit: sha,
    capabilities: ["twin.review", "twin.analyze", "twin.build"],
    ...overrides,
  }, { createdAt });
}

function twinEvent(overrides = {}) {
  return createTwinEvent({
    federationId: "mahoraga-federation",
    originPeerId: "mahoraga-primary",
    targetPeerId: "mahoraga-twin-1",
    sequence: 1,
    kind: "presence",
    repository: "michaeljwilliams0123/mahoraga",
    baseCommit: sha,
    headCommit: sha,
    capability: null,
    payloadDigest: "a".repeat(64),
    createdAt,
    ...overrides,
  });
}

test("creates an immutable primary twin descriptor bound to Mahoraga", () => {
  const value = primary();
  assert.deepEqual(value, {
    schemaVersion: 1,
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    parentPeerId: null,
    generation: 0,
    repository: "michaeljwilliams0123/mahoraga",
    commit: sha,
    capabilities: ["twin.analyze", "twin.build", "twin.review"],
    createdAt,
  });
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.capabilities), true);
});

test("clones a distinct peer while inheriting federation code and capabilities", () => {
  const source = primary();
  const clone = cloneTwinDescriptor(source, { peerId: "mahoraga-twin-1" }, { createdAt: "2026-09-08T01:31:00.000Z" });
  assert.deepEqual(clone, {
    schemaVersion: 1,
    federationId: source.federationId,
    peerId: "mahoraga-twin-1",
    parentPeerId: source.peerId,
    generation: 1,
    repository: source.repository,
    commit: source.commit,
    capabilities: source.capabilities,
    createdAt: "2026-09-08T01:31:00.000Z",
  });
  assert.notEqual(clone.peerId, source.peerId);
});

test("rejects credential-shaped or unknown descriptor fields", () => {
  const value = primary();
  assert.throws(() => validateTwinDescriptor({ ...value, token: "secret" }), /twin-descriptor-invalid/);
  assert.throws(() => createTwinDescriptor({
    federationId: "mahoraga-federation",
    peerId: "mahoraga-primary",
    repository: "other/repo",
    commit: sha,
    capabilities: [],
  }, { createdAt }), /twin-repository-invalid/);
});

test("rejects clone identity collisions", () => {
  const source = primary();
  assert.throws(() => cloneTwinDescriptor(source, { peerId: source.peerId }, { createdAt }), /twin-peer-collision/);
});

test("creates immutable deterministic presence, update, handoff, and receipt events", () => {
  for (const kind of ["presence", "update", "handoff", "receipt"]) {
    const capability = kind === "handoff" ? "twin.review" : null;
    const event = twinEvent({ kind, capability, headCommit: kind === "update" ? sha2 : sha });
    const replay = twinEvent({ kind, capability, headCommit: kind === "update" ? sha2 : sha });
    assert.match(event.eventId, /^twe_[a-f0-9]{64}$/);
    assert.equal(event.eventId, replay.eventId);
    assert.equal(event.kind, kind);
    assert.equal(Object.isFrozen(event), true);
    assert.deepEqual(validateTwinEvent(event), event);
  }
});

test("twin inbox applies a targeted event once and suppresses duplicate echo", () => {
  const inbox = createTwinInbox({ peerId: "mahoraga-twin-1", maximumEventIds: 8 });
  const event = twinEvent();
  assert.deepEqual(inbox.accept(event), { accepted: true, applied: true, reason: "accepted" });
  assert.deepEqual(inbox.accept(event), { accepted: true, applied: false, reason: "duplicate" });
  assert.deepEqual(inbox.snapshot(), {
    peerId: "mahoraga-twin-1",
    highestSequenceByOrigin: { "mahoraga-primary": 1 },
    eventIds: [event.eventId],
  });
});

test("twin inbox ignores stale origin sequences and events for a different peer", () => {
  const inbox = createTwinInbox({ peerId: "mahoraga-twin-1", maximumEventIds: 8 });
  const newest = twinEvent({ sequence: 4, kind: "update", headCommit: sha2 });
  const stale = twinEvent({ sequence: 3, payloadDigest: "b".repeat(64) });
  const other = twinEvent({ sequence: 5, targetPeerId: "mahoraga-other", payloadDigest: "c".repeat(64) });
  assert.equal(inbox.accept(newest).applied, true);
  assert.deepEqual(inbox.accept(stale), { accepted: true, applied: false, reason: "stale" });
  assert.deepEqual(inbox.accept(other), { accepted: false, applied: false, reason: "not-target" });
});

test("broadcast twin events are accepted by the addressed federation peer", () => {
  const inbox = createTwinInbox({ peerId: "mahoraga-twin-1", maximumEventIds: 2 });
  const first = twinEvent({ targetPeerId: "*", sequence: 1 });
  const second = twinEvent({ targetPeerId: "*", sequence: 2, payloadDigest: "b".repeat(64) });
  const third = twinEvent({ targetPeerId: "*", sequence: 3, payloadDigest: "c".repeat(64) });
  assert.equal(inbox.accept(first).applied, true);
  assert.equal(inbox.accept(second).applied, true);
  assert.equal(inbox.accept(third).applied, true);
  assert.deepEqual(inbox.snapshot().eventIds, [second.eventId, third.eventId]);
});

test("classifies same-head, fast-forward, divergent, and candidate-review convergence", () => {
  assert.equal(classifyTwinConvergence({ localCommit: sha, event: twinEvent() }), "in-sync");
  assert.equal(classifyTwinConvergence({
    localCommit: sha,
    event: twinEvent({ kind: "update", baseCommit: sha, headCommit: sha2 }),
  }), "fast-forward-candidate");
  assert.equal(classifyTwinConvergence({
    localCommit: sha3,
    event: twinEvent({ kind: "update", baseCommit: sha, headCommit: sha2 }),
  }), "reconciliation-required");
  assert.equal(classifyTwinConvergence({
    localCommit: sha,
    event: twinEvent({ kind: "handoff", capability: "twin.review", baseCommit: sha, headCommit: sha2 }),
  }), "candidate-review");
});

test("creates content-free reciprocal analyze, review, and build handoffs", () => {
  const origin = primary();
  const target = cloneTwinDescriptor(origin, { peerId: "mahoraga-twin-1" }, { createdAt: "2026-09-08T01:31:00.000Z" });
  for (const capability of ["twin.analyze", "twin.review", "twin.build"]) {
    const event = createTwinHandoff({
      origin,
      target,
      capability,
      baseCommit: sha,
      headCommit: sha2,
      objective: `objective-${capability}`,
      sequence: 7,
      createdAt,
    });
    assert.equal(event.kind, "handoff");
    assert.equal(event.originPeerId, origin.peerId);
    assert.equal(event.targetPeerId, target.peerId);
    assert.equal(event.capability, capability);
    assert.match(event.payloadDigest, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(event, "objective"), false);
  }
});

test("handoff refuses cross-federation peers and unsupported capabilities", () => {
  const origin = primary();
  const target = cloneTwinDescriptor(origin, { peerId: "mahoraga-twin-1" }, { createdAt: "2026-09-08T01:31:00.000Z" });
  const foreign = createTwinDescriptor({
    federationId: "foreign-federation",
    peerId: "mahoraga-foreign",
    repository: origin.repository,
    commit: origin.commit,
    capabilities: origin.capabilities,
  }, { createdAt });
  assert.throws(() => createTwinHandoff({
    origin,
    target: foreign,
    capability: "twin.review",
    baseCommit: sha,
    headCommit: sha2,
    objective: "review candidate",
    sequence: 1,
    createdAt,
  }), /twin-handoff-federation-mismatch/);
  assert.throws(() => createTwinHandoff({
    origin,
    target,
    capability: "twin.deploy",
    baseCommit: sha,
    headCommit: sha2,
    objective: "deploy candidate",
    sequence: 1,
    createdAt,
  }), /twin-handoff-capability-invalid/);
});

test("federation activation requires the prepared flag and supports two relay device sessions", () => {
  const manifest = JSON.parse(readFileSync(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.featureFlags.a2aFederation, true);

  const owner = "owner@example.com";
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: "https://michaeljwilliams0123.github.io", now: () => 0 });
  const primarySession = broker.pairLocal({ owner, deviceId: "mahoraga-primary", pairingId: "pair-primary" });
  const twinSession = broker.pairLocal({ owner, deviceId: "mahoraga-twin-1", pairingId: "pair-twin-1" });
  assert.notEqual(primarySession.sessionId, twinSession.sessionId);
});

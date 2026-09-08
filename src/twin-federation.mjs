import { createHash } from "node:crypto";

const REPOSITORY = "michaeljwilliams0123/mahoraga";
const DESCRIPTOR_KEYS = new Set([
  "schemaVersion",
  "federationId",
  "peerId",
  "parentPeerId",
  "generation",
  "repository",
  "commit",
  "capabilities",
  "createdAt",
]);
const EVENT_INPUT_KEYS = new Set([
  "federationId",
  "originPeerId",
  "targetPeerId",
  "sequence",
  "kind",
  "repository",
  "baseCommit",
  "headCommit",
  "capability",
  "payloadDigest",
  "createdAt",
]);
const EVENT_KEYS = new Set(["schemaVersion", "eventId", ...EVENT_INPUT_KEYS]);
const EVENT_KINDS = new Set(["presence", "update", "handoff", "receipt"]);
const HANDOFF_CAPABILITIES = new Set(["twin.analyze", "twin.review", "twin.build"]);

export function createTwinDescriptor(input, { createdAt = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("twin-descriptor-invalid");
  const value = {
    schemaVersion: 1,
    federationId: input.federationId,
    peerId: input.peerId,
    parentPeerId: input.parentPeerId ?? null,
    generation: input.generation ?? 0,
    repository: input.repository,
    commit: input.commit,
    capabilities: normalizeCapabilities(input.capabilities ?? []),
    createdAt,
  };
  return validateTwinDescriptor(value);
}

export function cloneTwinDescriptor(parent, input, { createdAt = new Date().toISOString() } = {}) {
  const source = validateTwinDescriptor(parent);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "peerId")) {
    fail("twin-clone-invalid");
  }
  peerId(input.peerId);
  if (input.peerId === source.peerId) fail("twin-peer-collision");
  return createTwinDescriptor({
    federationId: source.federationId,
    peerId: input.peerId,
    parentPeerId: source.peerId,
    generation: source.generation + 1,
    repository: source.repository,
    commit: source.commit,
    capabilities: source.capabilities,
  }, { createdAt });
}

export function validateTwinDescriptor(value) {
  exactObject(value, DESCRIPTOR_KEYS, "twin-descriptor-invalid");
  if (value.schemaVersion !== 1) fail("twin-descriptor-invalid");
  slug(value.federationId, "twin-federation-invalid");
  peerId(value.peerId);
  if (value.parentPeerId !== null) peerId(value.parentPeerId);
  if (!Number.isSafeInteger(value.generation) || value.generation < 0 || value.generation > 1024) fail("twin-generation-invalid");
  if (value.repository !== REPOSITORY) fail("twin-repository-invalid");
  sha(value.commit, "twin-commit-invalid");
  const capabilities = normalizeCapabilities(value.capabilities);
  timestamp(value.createdAt, "twin-created-at-invalid");
  return deepFreeze({
    schemaVersion: 1,
    federationId: value.federationId,
    peerId: value.peerId,
    parentPeerId: value.parentPeerId,
    generation: value.generation,
    repository: value.repository,
    commit: value.commit,
    capabilities,
    createdAt: value.createdAt,
  });
}

export function createTwinEvent(input) {
  exactObject(input, EVENT_INPUT_KEYS, "twin-event-invalid");
  const content = normalizeEventContent(input);
  const value = {
    schemaVersion: 1,
    eventId: twinEventId(content),
    ...content,
  };
  return validateTwinEvent(value);
}

export function validateTwinEvent(value) {
  exactObject(value, EVENT_KEYS, "twin-event-invalid");
  if (value.schemaVersion !== 1) fail("twin-event-invalid");
  const content = normalizeEventContent(value);
  if (value.eventId !== twinEventId(content)) fail("twin-event-id-invalid");
  return deepFreeze({ schemaVersion: 1, eventId: value.eventId, ...content });
}

export function createTwinInbox({ peerId: localPeerId, maximumEventIds = 256 } = {}) {
  peerId(localPeerId);
  if (!Number.isSafeInteger(maximumEventIds) || maximumEventIds < 1 || maximumEventIds > 4096) fail("twin-inbox-limit-invalid");
  const highestSequenceByOrigin = new Map();
  const eventIds = [];
  const eventIdSet = new Set();

  return Object.freeze({
    accept(rawEvent) {
      const event = validateTwinEvent(rawEvent);
      if (event.targetPeerId !== "*" && event.targetPeerId !== localPeerId) {
        return Object.freeze({ accepted: false, applied: false, reason: "not-target" });
      }
      if (eventIdSet.has(event.eventId)) {
        return Object.freeze({ accepted: true, applied: false, reason: "duplicate" });
      }
      const highest = highestSequenceByOrigin.get(event.originPeerId) ?? 0;
      if (event.sequence <= highest) {
        return Object.freeze({ accepted: true, applied: false, reason: "stale" });
      }
      highestSequenceByOrigin.set(event.originPeerId, event.sequence);
      eventIds.push(event.eventId);
      eventIdSet.add(event.eventId);
      while (eventIds.length > maximumEventIds) {
        eventIdSet.delete(eventIds.shift());
      }
      return Object.freeze({ accepted: true, applied: true, reason: "accepted" });
    },
    snapshot() {
      const sequenceEntries = [...highestSequenceByOrigin.entries()].sort(([left], [right]) => left.localeCompare(right));
      return deepFreeze({
        peerId: localPeerId,
        highestSequenceByOrigin: Object.fromEntries(sequenceEntries),
        eventIds: [...eventIds],
      });
    },
  });
}

function normalizeEventContent(value) {
  slug(value.federationId, "twin-federation-invalid");
  peerId(value.originPeerId);
  if (value.targetPeerId !== "*") peerId(value.targetPeerId);
  if (value.targetPeerId === value.originPeerId) fail("twin-event-self-target-invalid");
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) fail("twin-event-sequence-invalid");
  if (!EVENT_KINDS.has(value.kind)) fail("twin-event-kind-invalid");
  if (value.repository !== REPOSITORY) fail("twin-repository-invalid");
  sha(value.baseCommit, "twin-base-commit-invalid");
  sha(value.headCommit, "twin-head-commit-invalid");
  if (value.kind === "handoff") {
    if (!HANDOFF_CAPABILITIES.has(value.capability)) fail("twin-handoff-capability-invalid");
  } else if (value.capability !== null) {
    fail("twin-event-capability-invalid");
  }
  digest(value.payloadDigest, "twin-payload-digest-invalid");
  timestamp(value.createdAt, "twin-created-at-invalid");
  return {
    federationId: value.federationId,
    originPeerId: value.originPeerId,
    targetPeerId: value.targetPeerId,
    sequence: value.sequence,
    kind: value.kind,
    repository: value.repository,
    baseCommit: value.baseCommit,
    headCommit: value.headCommit,
    capability: value.capability,
    payloadDigest: value.payloadDigest,
    createdAt: value.createdAt,
  };
}

function twinEventId(content) {
  const canonical = [
    content.federationId,
    content.originPeerId,
    content.targetPeerId,
    content.sequence,
    content.kind,
    content.repository,
    content.baseCommit,
    content.headCommit,
    content.capability,
    content.payloadDigest,
    content.createdAt,
  ];
  return `twe_${createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex")}`;
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length) fail("twin-capabilities-invalid");
  return value.map((item) => capability(item)).sort();
}

function capability(value) {
  if (typeof value !== "string" || !/^twin\.[a-z][a-z0-9.-]{1,63}$/.test(value)) fail("twin-capability-invalid");
  return value;
}

function peerId(value) {
  slug(value, "twin-peer-invalid");
  return value;
}

function slug(value, code) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code);
  return value;
}

function sha(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) fail(code);
  return value;
}

function digest(value, code) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(code);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

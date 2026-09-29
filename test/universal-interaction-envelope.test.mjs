import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";

const NOW = "2026-09-29T12:45:56.000Z";
const LATER = "2026-09-29T14:15:56.000Z";

async function loadSubject() {
  try {
    return await import("../src/universal-interaction-envelope.mjs");
  } catch (error) {
    assert.fail(`universal interaction module missing: ${error?.code ?? error?.message}`);
  }
}

function makeIngress({ ttlSeconds = 3600 } = {}) {
  return createOmnichannelEnvelope({
    source: "microsoft-message",
    actor: {
      actorType: "microsoft-account",
      actorId: "owner@outlook",
      trustClass: "observed-session",
      accountBoundary: "personal",
    },
    object: {
      service: "outlook",
      objectType: "attachment",
      objectId: "msg-882",
      threadId: "thread-882",
      accountBoundary: "personal",
    },
    allowedActionClass: "draft",
    correlationId: "corr-universal-882",
    idempotencyKey: "interaction:msg-882",
    contentReferences: ["vault:12345678-1234-4234-8234-123456789abc"],
    routeHint: { capability: "artifact.inspect", actionPackId: "universal-interaction" },
    metadata: { channel: "outlook" },
    zeroCreditEligible: true,
  }, { now: NOW, ttlSeconds });
}

function context(overrides = {}) {
  return {
    modalities: ["text", "file"],
    presentation: {
      locale: "en-US",
      timeZone: "America/New_York",
      direction: "ltr",
      measurementSystem: "us",
      currency: "USD",
      deviceClass: "phone",
      networkClass: "degraded",
    },
    delivery: {
      supportsStreaming: true,
      supportsMarkdown: true,
      supportsRichText: true,
      supportsImages: true,
      supportsAudio: false,
      supportsVideo: false,
      supportsFiles: true,
      maxOutputBytes: 1048576,
    },
    protocol: {
      family: "http-json",
      version: "1.0",
      schemaIds: ["mahoraga.interaction.v1"],
    },
    requestedCapability: "artifact.inspect",
    ...overrides,
  };
}

test("projects a deterministic frozen interaction envelope from validated ingress", async () => {
  const { projectUniversalInteractionEnvelope, validateUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress();
  const first = projectUniversalInteractionEnvelope(ingress, context(), { now: NOW });
  const second = projectUniversalInteractionEnvelope(ingress, context(), { now: NOW });

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.kind, "universal-interaction-envelope");
  assert.equal(first.sourceEnvelopeId, ingress.envelopeId);
  assert.equal(first.correlationId, ingress.correlationId);
  assert.equal(first.idempotencyKey, ingress.idempotencyKey);
  assert.equal(first.dataClass, ingress.dataClass);
  assert.equal(first.allowedActionClass, ingress.allowedActionClass);
  assert.equal(first.zeroCreditEligible, ingress.zeroCreditEligible);
  assert.deepEqual(first.contentReferences, ingress.contentReferences);
  assert.deepEqual(first.modalities, ["file", "text"]);
  assert.equal(first.requestedCapability, ingress.routeHint.capability);
  assert.match(first.interactionId, /^interaction-[a-f0-9]{32}$/);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.presentation));
  assert.ok(Object.isFrozen(first.delivery));
  assert.ok(Object.isFrozen(first.protocol));
  assert.deepEqual(validateUniversalInteractionEnvelope(first, { now: NOW }), first);
});

test("presentation changes do not change interaction identity or authority-bearing ingress facts", async () => {
  const { projectUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress();
  const mobile = projectUniversalInteractionEnvelope(ingress, context(), { now: NOW });
  const desktop = projectUniversalInteractionEnvelope(ingress, context({
    presentation: {
      ...context().presentation,
      locale: "fr-FR",
      timeZone: "Europe/Paris",
      direction: "rtl",
      measurementSystem: "metric",
      currency: "EUR",
      deviceClass: "desktop",
      networkClass: "online",
    },
  }), { now: NOW });

  assert.equal(desktop.interactionId, mobile.interactionId);
  for (const key of ["sourceEnvelopeId", "correlationId", "idempotencyKey", "dataClass", "allowedActionClass", "zeroCreditEligible", "receivedAt", "expiresAt", "freshness", "requestedCapability"]) {
    assert.equal(desktop[key], mobile[key]);
  }
  assert.deepEqual(desktop.contentReferences, mobile.contentReferences);
  assert.notEqual(desktop.fingerprint, mobile.fingerprint);
});

test("requested capability may be omitted or equal ingress but cannot be replaced", async () => {
  const { projectUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress();
  const omitted = context();
  delete omitted.requestedCapability;
  const value = projectUniversalInteractionEnvelope(ingress, omitted, { now: NOW });
  assert.equal(Object.hasOwn(value, "requestedCapability"), false);
  assert.throws(
    () => projectUniversalInteractionEnvelope(ingress, context({ requestedCapability: "assistant.respond" }), { now: NOW }),
    /universal-interaction-capability-invalid/,
  );
});

test("fails closed on unknown fields, duplicate modalities, and raw/secret-bearing context", async () => {
  const { projectUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress();
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ rawPayload: "hello" }), { now: NOW }), /universal-interaction-context-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ credential: "Bearer abcdefghijklmnopqrstuvwxyz" }), { now: NOW }), /universal-interaction-context-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ modalities: ["text", "text"] }), { now: NOW }), /universal-interaction-modalities-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ modalities: ["text", "hologram"] }), { now: NOW }), /universal-interaction-modality-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ contentReferences: [] }), { now: NOW }), /universal-interaction-context-invalid/);
});

test("fails closed on invalid presentation, delivery, and protocol metadata", async () => {
  const { projectUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress();
  const badPresentations = [
    { ...context().presentation, locale: "en_US" },
    { ...context().presentation, timeZone: "Mars/Olympus" },
    { ...context().presentation, currency: "usd" },
    { ...context().presentation, direction: "sideways" },
    { ...context().presentation, measurementSystem: "imperial" },
    { ...context().presentation, deviceClass: "watch" },
    { ...context().presentation, networkClass: "satellite" },
  ];
  for (const presentation of badPresentations) {
    assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ presentation }), { now: NOW }), /universal-interaction-presentation-invalid/);
  }
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ delivery: { ...context().delivery, supportsFiles: "yes" } }), { now: NOW }), /universal-interaction-delivery-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ delivery: { ...context().delivery, maxOutputBytes: 0 } }), { now: NOW }), /universal-interaction-delivery-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ protocol: { ...context().protocol, family: "ftp" } }), { now: NOW }), /universal-interaction-protocol-invalid/);
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context({ protocol: { ...context().protocol, schemaIds: ["a", "a"] } }), { now: NOW }), /universal-interaction-protocol-invalid/);
});

test("cannot project stale or expired ingress as fresh", async () => {
  const { projectUniversalInteractionEnvelope } = await loadSubject();
  const ingress = makeIngress({ ttlSeconds: 60 });
  assert.throws(() => projectUniversalInteractionEnvelope(ingress, context(), { now: LATER }), /omnichannel-freshness-invalid/);
});

test("validator rejects tampering and unknown output fields", async () => {
  const { projectUniversalInteractionEnvelope, validateUniversalInteractionEnvelope } = await loadSubject();
  const value = projectUniversalInteractionEnvelope(makeIngress(), context(), { now: NOW });
  assert.throws(() => validateUniversalInteractionEnvelope({ ...value, fingerprint: "0".repeat(64) }, { now: NOW }), /universal-interaction-fingerprint-invalid/);
  assert.throws(() => validateUniversalInteractionEnvelope({ ...value, trafficAuthority: true }, { now: NOW }), /universal-interaction-envelope-invalid/);
});

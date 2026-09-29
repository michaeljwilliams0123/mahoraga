import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";
import { projectUniversalInteractionEnvelope } from "../src/universal-interaction-envelope.mjs";

const NOW = "2026-09-29T13:09:30.000Z";

async function loadSubject() {
  try {
    return await import("../src/interaction-protocol-negotiation.mjs");
  } catch (error) {
    assert.fail(`interaction negotiation module missing: ${error?.code ?? error?.message}`);
  }
}

function makeEnvelope(overrides = {}) {
  const ingress = createOmnichannelEnvelope({
    source: "owner-request",
    actor: {
      actorType: "owner",
      actorId: "owner",
      trustClass: "owner-explicit",
      accountBoundary: "synthetic",
    },
    object: {
      surface: "control-center",
      requestId: "req-interaction-2",
      objectType: "request",
    },
    allowedActionClass: "observe",
    correlationId: "corr-interaction-2",
    idempotencyKey: "interaction:req-2",
    contentReferences: ["vault:12345678-1234-4234-8234-123456789abc"],
    routeHint: { capability: "assistant.respond", actionPackId: "draft-follow-up" },
    metadata: { channel: "owner" },
    zeroCreditEligible: true,
  }, { now: NOW, ttlSeconds: 3600 });

  const context = {
    modalities: ["text", "structured"],
    presentation: {
      locale: "en-US",
      timeZone: "America/New_York",
      direction: "ltr",
      deviceClass: "desktop",
      networkClass: "online",
    },
    delivery: {
      supportsStreaming: true,
      supportsMarkdown: true,
      supportsRichText: true,
      supportsImages: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsFiles: false,
      maxOutputBytes: 4096,
    },
    protocol: {
      family: "http-json",
      version: "1.0",
      schemaIds: ["mahoraga.interaction.v1", "mahoraga.result.v1"],
    },
    requestedCapability: "assistant.respond",
    ...overrides,
  };
  return projectUniversalInteractionEnvelope(ingress, context, { now: NOW });
}

function adapter(overrides = {}) {
  return {
    adapterId: "trusted-http",
    family: "http-json",
    versions: ["1.0"],
    schemaIds: ["mahoraga.interaction.v1"],
    modalities: ["text", "structured"],
    maxPayloadBytes: 8192,
    ...overrides,
  };
}

test("validates and freezes exact trusted adapter descriptors", async () => {
  const { validateInteractionAdapterDescriptor } = await loadSubject();
  const value = validateInteractionAdapterDescriptor(adapter({ versions: ["1.1", "1.0"], modalities: ["structured", "text"] }));
  assert.deepEqual(value.versions, ["1.0", "1.1"]);
  assert.deepEqual(value.modalities, ["structured", "text"]);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.versions));
  assert.throws(() => validateInteractionAdapterDescriptor({ ...adapter(), url: "https://example.com" }), /interaction-adapter-invalid/);
  assert.throws(() => validateInteractionAdapterDescriptor({ ...adapter(), adapterId: "https://example.com" }), /interaction-adapter-id-invalid/);
  assert.throws(() => validateInteractionAdapterDescriptor({ ...adapter(), versions: ["1.0", "1.0"] }), /interaction-adapter-versions-invalid/);
  assert.throws(() => validateInteractionAdapterDescriptor({ ...adapter(), modalities: ["text", "hologram"] }), /interaction-adapter-modality-invalid/);
  assert.throws(() => validateInteractionAdapterDescriptor({ ...adapter(), maxPayloadBytes: 0 }), /interaction-adapter-payload-limit-invalid/);
});

test("negotiates one deterministic accepted intersection independent of adapter ordering", async () => {
  const { negotiateInteractionProtocol, validateInteractionNegotiationReceipt } = await loadSubject();
  const envelope = makeEnvelope();
  const adapters = [
    adapter({ adapterId: "z-adapter", schemaIds: ["mahoraga.result.v1"] }),
    adapter({ adapterId: "a-adapter", schemaIds: ["mahoraga.interaction.v1"] }),
  ];
  const first = negotiateInteractionProtocol(envelope, adapters, { payloadBytes: 1024, now: NOW });
  const second = negotiateInteractionProtocol(envelope, [...adapters].reverse(), { payloadBytes: 1024, now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.kind, "interaction-negotiation-receipt");
  assert.equal(first.interactionId, envelope.interactionId);
  assert.equal(first.interactionFingerprint, envelope.fingerprint);
  assert.equal(first.protocolFamily, "http-json");
  assert.equal(first.protocolVersion, "1.0");
  assert.deepEqual(first.schemaIds, ["mahoraga.interaction.v1"]);
  assert.equal(first.status, "accepted");
  assert.equal(first.reason, "accepted");
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(first));
  for (const forbidden of ["actionClass", "authorityScope", "credential", "url", "trafficAuthority", "providerRoute", "zeroCreditEligible"]) {
    assert.equal(Object.hasOwn(first, forbidden), false);
  }
  assert.deepEqual(validateInteractionNegotiationReceipt(first), first);
});

test("negotiation is filter-only and cannot mutate source authority or capability", async () => {
  const { negotiateInteractionProtocol } = await loadSubject();
  const envelope = makeEnvelope();
  const snapshot = structuredClone(envelope);
  const receipt = negotiateInteractionProtocol(envelope, [adapter()], { payloadBytes: 1, now: NOW });
  assert.equal(receipt.status, "accepted");
  assert.deepEqual(envelope, snapshot);
  assert.equal(envelope.dataClass, "synthetic");
  assert.equal(envelope.allowedActionClass, "observe");
  assert.equal(envelope.zeroCreditEligible, true);
  assert.equal(envelope.requestedCapability, "assistant.respond");
});

test("returns deterministic typed holds without weaker fallback", async () => {
  const { negotiateInteractionProtocol } = await loadSubject();
  const envelope = makeEnvelope();
  const cases = [
    [[], "no-trusted-family"],
    [[adapter({ family: "mcp" })], "no-trusted-family"],
    [[adapter({ versions: ["2.0"] })], "protocol-version-incompatible"],
    [[adapter({ schemaIds: ["other.schema.v1"] })], "schema-incompatible"],
    [[adapter({ modalities: ["text"] })], "modality-incompatible"],
    [[adapter({ maxPayloadBytes: 100 })], "payload-too-large"],
  ];
  for (const [adapters, reason] of cases) {
    const receipt = negotiateInteractionProtocol(envelope, adapters, { payloadBytes: 101, now: NOW });
    assert.equal(receipt.status, "hold");
    assert.equal(receipt.reason, reason);
    assert.equal(receipt.interactionFingerprint, envelope.fingerprint);
    assert.deepEqual(receipt.schemaIds, []);
  }
});

test("requires explicit requested version support and never silently downgrades", async () => {
  const { negotiateInteractionProtocol } = await loadSubject();
  const envelope = makeEnvelope();
  const receipt = negotiateInteractionProtocol(envelope, [adapter({ versions: ["1.1", "1.2"] })], { now: NOW });
  assert.equal(receipt.status, "hold");
  assert.equal(receipt.reason, "protocol-version-incompatible");
});

test("rejects invalid payload size, invalid descriptors, and tampered interaction envelopes", async () => {
  const { negotiateInteractionProtocol } = await loadSubject();
  const envelope = makeEnvelope();
  assert.throws(() => negotiateInteractionProtocol(envelope, [adapter()], { payloadBytes: -1, now: NOW }), /interaction-payload-bytes-invalid/);
  assert.throws(() => negotiateInteractionProtocol(envelope, [{ ...adapter(), token: "secret" }], { now: NOW }), /interaction-adapter-invalid/);
  assert.throws(() => negotiateInteractionProtocol({ ...envelope, fingerprint: "0".repeat(64) }, [adapter()], { now: NOW }), /universal-interaction-fingerprint-invalid/);
});

test("receipt validation rejects tampering and authority-bearing fields", async () => {
  const { negotiateInteractionProtocol, validateInteractionNegotiationReceipt } = await loadSubject();
  const receipt = negotiateInteractionProtocol(makeEnvelope(), [adapter()], { now: NOW });
  assert.throws(() => validateInteractionNegotiationReceipt({ ...receipt, fingerprint: "0".repeat(64) }), /interaction-negotiation-fingerprint-invalid/);
  assert.throws(() => validateInteractionNegotiationReceipt({ ...receipt, trafficAuthority: true }), /interaction-negotiation-receipt-invalid/);
  assert.throws(() => validateInteractionNegotiationReceipt({ ...receipt, interactionFingerprint: "0".repeat(64), fingerprint: receipt.fingerprint }), /interaction-negotiation-fingerprint-invalid/);
});

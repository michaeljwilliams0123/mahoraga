import test from "node:test";
import assert from "node:assert/strict";
import { createRelayBroker } from "../relay/core.mjs";

const owner = "owner@example.com";
const origin = "https://michaeljwilliams0123.github.io";
const frame = (sessionId, counter = 1) => ({ schemaVersion: 1, sessionId, direction: "ui-to-runtime", counter, iv: "a".repeat(16), ciphertext: "b".repeat(32) });

test("relay binds pairing and ciphertext forwarding to the exact owner and Pages origin", () => {
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-123456" });
  assert.throws(() => broker.pairRemote({ owner: "other@example.com", origin, pairingId: "pair-123456" }), /relay-owner-required/);
  assert.throws(() => broker.pairRemote({ owner, origin: "https://evil.example", pairingId: "pair-123456" }), /relay-origin-required/);
  broker.pairRemote({ owner, origin, pairingId: "pair-123456" });
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.deepEqual(broker.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), [frame(local.sessionId)]);
});

test("relay rejects generic proxy metadata and enforces frame, rate, and reconnect limits", () => {
  let current = 0;
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { maximumFrameBytes: 512, maximumFramesPerMinute: 1, reconnectTtlMs: 300_000 } });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-limits" });
  broker.pairRemote({ owner, origin, pairingId: "pair-limits" });
  assert.throws(() => broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: { ...frame(local.sessionId), url: "http://127.0.0.1:4782" } }), /relay-frame-invalid/);
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.throws(() => broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId, 2) }), /relay-rate-limit/);
  current = 300_001;
  assert.deepEqual(broker.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), []);
});

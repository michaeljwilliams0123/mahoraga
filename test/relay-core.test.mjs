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

test("relay pairing binds the proof and routes ciphertext to the opposite socket", () => {
  const localSocket = { messages: [], send(value) { this.messages.push(JSON.parse(value)); } };
  const remoteSocket = { messages: [], send(value) { this.messages.push(JSON.parse(value)); } };
  const localPublicKey = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
  const remotePublicKey = { kty: "EC", crv: "P-256", x: "c".repeat(43), y: "d".repeat(43) };
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-proof", code: "ABCD2345", devicePublicKey: localPublicKey, socket: localSocket });
  assert.throws(() => broker.pairRemote({ owner, origin, pairingId: "pair-proof", code: "WRONG234", devicePublicKey: remotePublicKey }), /relay-pairing-proof-invalid/);
  const paired = broker.pairRemote({ owner, origin, pairingId: "pair-proof", code: "ABCD2345", devicePublicKey: remotePublicKey, socket: remoteSocket });
  assert.equal(paired.sessionId, local.sessionId);
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.deepEqual(localSocket.messages.at(-1), { type: "frame", sessionId: local.sessionId, frame: frame(local.sessionId) });
  assert.equal(remoteSocket.messages.length, 0);
  assert.deepEqual(broker.sessionDetails(local.sessionId).remotePublicKey, remotePublicKey);
});

test("relay snapshot restores bounded sessions and replay frames", () => {
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-snapshot" });
  broker.pairRemote({ owner, origin, pairingId: "pair-snapshot" });
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  const restored = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 1, initialState: broker.snapshot() });
  assert.deepEqual(restored.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), [frame(local.sessionId)]);
});

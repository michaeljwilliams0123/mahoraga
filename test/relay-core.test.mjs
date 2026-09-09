import test from "node:test";
import assert from "node:assert/strict";
import { createRelayBroker } from "../relay/core.mjs";

const owner = "owner@example.com";
const origin = "https://mahoraga-cloud-workspace.vercel.app";
const pagesOrigin = "https://michaeljwilliams0123.github.io";
const frame = (sessionId, counter = 1) => ({ schemaVersion: 1, sessionId, direction: "ui-to-runtime", counter, iv: "a".repeat(16), ciphertext: "b".repeat(32) });

test("relay binds pairing and ciphertext forwarding to the exact owner and approved workspace origins", async () => {
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: [origin, pagesOrigin], now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-123456" });
  await assert.rejects(() => broker.pairRemote({ owner: "other@example.com", origin, pairingId: "pair-123456" }), /relay-owner-required/);
  await assert.rejects(() => broker.pairRemote({ owner, origin: "https://evil.example", pairingId: "pair-123456" }), /relay-origin-required/);
  await broker.pairRemote({ owner, origin, pairingId: "pair-123456" });
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.deepEqual(broker.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), [frame(local.sessionId)]);
  await assert.rejects(() => broker.pairRemote({ owner, origin: pagesOrigin, pairingId: "missing-pair" }), /relay-pairing-missing/);
});

test("relay rejects generic proxy metadata and enforces frame, rate, and reconnect limits", async () => {
  let current = 0;
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { maximumFrameBytes: 512, maximumFramesPerMinute: 1, reconnectTtlMs: 300_000 } });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-limits" });
  await broker.pairRemote({ owner, origin, pairingId: "pair-limits" });
  assert.throws(() => broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: { ...frame(local.sessionId), url: "http://127.0.0.1:4782" } }), /relay-frame-invalid/);
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.throws(() => broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId, 2) }), /relay-rate-limit/);
  current = 300_001;
  assert.deepEqual(broker.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), []);
});

test("relay pairing binds the proof and routes ciphertext to the opposite socket", async () => {
  const localSocket = { messages: [], send(value) { this.messages.push(JSON.parse(value)); } };
  const remoteSocket = { messages: [], send(value) { this.messages.push(JSON.parse(value)); } };
  const localPublicKey = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
  const remotePublicKey = { kty: "EC", crv: "P-256", x: "c".repeat(43), y: "d".repeat(43) };
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-proof", code: "ABCD2345", devicePublicKey: localPublicKey, socket: localSocket });
  await assert.rejects(() => broker.pairRemote({ owner, origin, pairingId: "pair-proof", code: "WRONG234", devicePublicKey: remotePublicKey }), /relay-pairing-proof-invalid/);
  const paired = await broker.pairRemote({ owner, origin, pairingId: "pair-proof", code: "ABCD2345", devicePublicKey: remotePublicKey, socket: remoteSocket });
  assert.equal(paired.sessionId, local.sessionId);
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  assert.deepEqual(localSocket.messages.at(-1), { type: "frame", sessionId: local.sessionId, frame: frame(local.sessionId) });
  assert.equal(remoteSocket.messages.length, 0);
  assert.deepEqual(broker.sessionDetails(local.sessionId).remotePublicKey, remotePublicKey);
});

test("relay snapshot restores bounded sessions and replay frames", async () => {
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 0 });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-snapshot" });
  await broker.pairRemote({ owner, origin, pairingId: "pair-snapshot" });
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId) });
  const restored = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => 1, initialState: broker.snapshot() });
  assert.deepEqual(restored.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), [frame(local.sessionId)]);
});

test("relay preserves the full reconnect window and reattaches the same local device", async () => {
  let current = 0;
  const firstSocket = { closed: false, send() {}, close() { this.closed = true; } };
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { maximumFramesPerMinute: 1, reconnectTtlMs: 300_000 } });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-reconnect", socket: firstSocket });
  await broker.pairRemote({ owner, origin, pairingId: "pair-reconnect" });
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId, 1) });
  current = 60_000;
  broker.forward({ owner, origin, sessionId: local.sessionId, from: "remote", frame: frame(local.sessionId, 2) });
  const restored = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current + 1, limits: { maximumFramesPerMinute: 1, reconnectTtlMs: 300_000 }, initialState: broker.snapshot() });
  assert.deepEqual(restored.replay({ owner, origin, sessionId: local.sessionId, to: "local", afterCounter: 0 }), [frame(local.sessionId, 1), frame(local.sessionId, 2)]);
  const replacement = { send() {}, close() {} };
  assert.equal(restored.reattachLocal({ owner, deviceId: "primary-windows", sessionId: local.sessionId, socket: replacement }).sessionId, local.sessionId);
  assert.throws(() => restored.reattachLocal({ owner, deviceId: "other-device", sessionId: local.sessionId, socket: replacement }), /relay-session-reattach-invalid/);
});


test("relay remote reattach requires the original owner, origin, device, and resume credential", async () => {
  let current = 0;
  const localKey = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
  const remoteKey = { kty: "EC", crv: "P-256", x: "c".repeat(43), y: "d".repeat(43) };
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { sessionTtlMs: 60_000 } });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-remote-resume", code: "ABCD2345", devicePublicKey: localKey });
  const paired = await broker.pairRemote({ owner, origin, pairingId: "pair-remote-resume", code: "ABCD2345", devicePublicKey: remoteKey });
  assert.match(paired.resumeCredential, /^[A-Za-z0-9_-]{43}$/);
  const snapshot = broker.snapshot();
  assert.equal(snapshot.sessions[0].resumeCredential, undefined);
  assert.match(snapshot.sessions[0].remoteResumeDigest, /^[A-Za-z0-9_-]{43}$/);
  const restored = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { sessionTtlMs: 60_000 }, initialState: snapshot });
  const replacement = { send() {}, close() {} };
  assert.equal((await restored.reattachRemote({ owner, origin, deviceId: "primary-windows", sessionId: local.sessionId, resumeCredential: paired.resumeCredential, socket: replacement })).sessionId, local.sessionId);
  await assert.rejects(() => restored.reattachRemote({ owner: "other@example.com", origin, deviceId: "primary-windows", sessionId: local.sessionId, resumeCredential: paired.resumeCredential, socket: replacement }), /relay-owner-required/);
  await assert.rejects(() => restored.reattachRemote({ owner, origin: "https://evil.example", deviceId: "primary-windows", sessionId: local.sessionId, resumeCredential: paired.resumeCredential, socket: replacement }), /relay-origin-required/);
  await assert.rejects(() => restored.reattachRemote({ owner, origin, deviceId: "other-device", sessionId: local.sessionId, resumeCredential: paired.resumeCredential, socket: replacement }), /relay-session-reattach-invalid/);
  await assert.rejects(() => restored.reattachRemote({ owner, origin, deviceId: "primary-windows", sessionId: local.sessionId, resumeCredential: "A".repeat(43), socket: replacement }), /relay-session-reattach-invalid/);
  current = 60_001;
  await assert.rejects(() => restored.reattachRemote({ owner, origin, deviceId: "primary-windows", sessionId: local.sessionId, resumeCredential: paired.resumeCredential, socket: replacement }), /relay-session-missing/);
});
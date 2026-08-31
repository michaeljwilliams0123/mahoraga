import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflareRelayHandler, RelayDurableObject } from "../relay/cloudflare-worker.mjs";

const env = {
  MAHORAGA_OWNER_IDENTITY: "owner@example.com",
  MAHORAGA_PAGES_ORIGIN: "https://michaeljwilliams0123.github.io",
};

test("Cloudflare relay adapter rejects unauthenticated, cross-origin, and non-WebSocket requests", async () => {
  const handler = createCloudflareRelayHandler();
  assert.equal((await handler.fetch(new Request("https://relay.example/pair"), env)).status, 403);
  const wrongOrigin = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: "https://evil.example", upgrade: "websocket" } });
  assert.equal((await handler.fetch(wrongOrigin, env)).status, 403);
  const ordinaryHttp = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_PAGES_ORIGIN } });
  assert.equal((await handler.fetch(ordinaryHttp, env)).status, 426);
});

test("Cloudflare relay adapter exposes no generic proxy route", async () => {
  const handler = createCloudflareRelayHandler();
  const request = new Request("https://relay.example/proxy?url=http://127.0.0.1:4782", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_PAGES_ORIGIN, upgrade: "websocket" } });
  assert.equal((await handler.fetch(request, env)).status, 404);
});

test("Durable Object speaks one authenticated envelope and forwards only ciphertext", async () => {
  const OriginalPair = globalThis.WebSocketPair;
  const OriginalResponse = globalThis.Response;
  let latestPair;
  class Socket {
    constructor() { this.listeners = new Map(); this.messages = []; this.readyState = 1; }
    accept() {}
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    send(value) { this.messages.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.listeners.get("close")?.({}); }
    emit(type, data) { this.listeners.get(type)?.({ data: JSON.stringify(data) }); }
  }
  globalThis.WebSocketPair = class {
    constructor() { this[0] = new Socket(); this[1] = new Socket(); latestPair = this; }
  };
  globalThis.Response = class {
    constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; }
  };
  const storage = new Map();
  const state = { storage: { async get(key) { return storage.get(key) ?? null; }, async put(key, value) { storage.set(key, value); } } };
  const object = new RelayDurableObject(state, env);
  const request = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_PAGES_ORIGIN, upgrade: "websocket" } });
  try {
    const localResponse = await object.fetch(request);
    assert.equal(localResponse.status, 101);
    const local = latestPair[1];
    const localKey = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
    local.emit("message", { action: "pair-local", deviceId: "primary-windows", pairingId: "pair-worker", code: "ABCD2345", devicePublicKey: localKey });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(local.messages.at(-1).type, "paired");

    await object.fetch(request);
    const remote = latestPair[1];
    const remoteKey = { kty: "EC", crv: "P-256", x: "c".repeat(43), y: "d".repeat(43) };
    remote.emit("message", { action: "pair-remote", pairingId: "pair-worker", code: "ABCD2345", devicePublicKey: remoteKey });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const paired = remote.messages.at(-1);
    assert.equal(paired.type, "paired");
    assert.equal(paired.result.paired, true);
    assert.equal(local.messages.at(-1).result.peerPublicKey.x, remoteKey.x);
    const frame = { schemaVersion: 1, sessionId: paired.result.sessionId, direction: "ui-to-runtime", counter: 1, iv: "a".repeat(16), ciphertext: "b".repeat(32) };
    remote.emit("message", { action: "forward", sessionId: paired.result.sessionId, from: "remote", frame });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(local.messages.at(-1), { type: "frame", sessionId: paired.result.sessionId, frame });
    assert.ok(storage.has("relay-broker-v1"));
  } finally {
    globalThis.WebSocketPair = OriginalPair;
    globalThis.Response = OriginalResponse;
  }
});

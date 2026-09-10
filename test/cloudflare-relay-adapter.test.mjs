import test from "node:test";
import assert from "node:assert/strict";
import { createCloudflareRelayHandler, RelayDurableObject } from "../relay/cloudflare-worker.mjs";

const env = {
  MAHORAGA_OWNER_IDENTITY: "owner@example.com",
  MAHORAGA_WORKSPACE_ORIGIN: "https://mahoraga-cloud-workspace.vercel.app",
  MAHORAGA_LOCAL_RELAY_TOKEN: "l".repeat(48),
};
const pagesOrigin = "https://michaeljwilliams0123.github.io";

async function waitForSocketMessage(socket, predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = socket.messages.find(predicate);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("relay-test-message-timeout");
}

test("Cloudflare relay adapter rejects unauthenticated, cross-origin, and non-WebSocket requests", async () => {
  const handler = createCloudflareRelayHandler();
  assert.equal((await handler.fetch(new Request("https://relay.example/pair"), env)).status, 403);
  const wrongOrigin = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: "https://evil.example", upgrade: "websocket" } });
  assert.equal((await handler.fetch(wrongOrigin, env)).status, 403);
  const ordinaryHttp = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_WORKSPACE_ORIGIN } });
  assert.equal((await handler.fetch(ordinaryHttp, env)).status, 426);
  const pagesHttp = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: pagesOrigin } });
  assert.equal((await handler.fetch(pagesHttp, env)).status, 426);
  const localWithoutToken = new Request("https://relay.example/pair/local", { headers: { upgrade: "websocket" } });
  assert.equal((await handler.fetch(localWithoutToken, env)).status, 403);
  const twinWithoutToken = new Request("https://relay.example/pair/twin", { headers: { upgrade: "websocket" } });
  assert.equal((await handler.fetch(twinWithoutToken, env)).status, 403);
});

test("Cloudflare relay exposes a dedicated owner-token twin path without browser-origin authority", async () => {
  let forwardedRequest = null;
  const handler = createCloudflareRelayHandler();
  const twinEnv = {
    ...env,
    RELAY_SESSIONS: {
      idFromName(value) { assert.equal(value, env.MAHORAGA_OWNER_IDENTITY); return "owner-do"; },
      get(value) {
        assert.equal(value, "owner-do");
        return { async fetch(request) { forwardedRequest = request; return new Response("ok", { status: 200 }); } };
      },
    },
  };
  const request = new Request("https://relay.example/pair/twin", {
    headers: {
      upgrade: "websocket",
      "sec-websocket-protocol": `mahoraga-twin-v1, mahoraga-auth-${env.MAHORAGA_LOCAL_RELAY_TOKEN}`,
    },
  });
  const response = await handler.fetch(request, twinEnv);
  assert.equal(response.status, 200);
  assert.equal(forwardedRequest.headers.get("x-mahoraga-relay-role"), "remote");
  assert.equal(forwardedRequest.headers.get("x-mahoraga-relay-trusted-peer"), "true");
  assert.equal(forwardedRequest.headers.get("cf-access-authenticated-user-email"), env.MAHORAGA_OWNER_IDENTITY);
  assert.equal(forwardedRequest.headers.get("origin"), null);
});

test("Cloudflare relay adapter exposes no generic proxy route", async () => {
  const handler = createCloudflareRelayHandler();
  const request = new Request("https://relay.example/proxy?url=http://127.0.0.1:4782", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, origin: env.MAHORAGA_WORKSPACE_ORIGIN, upgrade: "websocket" } });
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
  const localRequest = new Request("https://relay.example/pair/local", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, "x-mahoraga-relay-role": "local", upgrade: "websocket", "sec-websocket-protocol": `mahoraga-local-v1, mahoraga-auth-${env.MAHORAGA_LOCAL_RELAY_TOKEN}` } });
  const remoteRequest = new Request("https://relay.example/pair", { headers: { "cf-access-authenticated-user-email": env.MAHORAGA_OWNER_IDENTITY, "x-mahoraga-relay-role": "remote", origin: env.MAHORAGA_WORKSPACE_ORIGIN, upgrade: "websocket" } });
  try {
    const localResponse = await object.fetch(localRequest);
    assert.equal(localResponse.status, 101);
    const local = latestPair[1];
    const localKey = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
    local.emit("message", { action: "pair-local", deviceId: "primary-windows", pairingId: "pair-worker", code: "ABCD2345", devicePublicKey: localKey });
    await waitForSocketMessage(local, (message) => message.type === "paired");
    assert.equal(local.messages.at(-1).type, "paired");

    await object.fetch(remoteRequest);
    const remote = latestPair[1];
    const remoteKey = { kty: "EC", crv: "P-256", x: "c".repeat(43), y: "d".repeat(43) };
    remote.emit("message", { action: "pair-remote", pairingId: "pair-worker", code: "ABCD2345", devicePublicKey: remoteKey });
    const paired = await waitForSocketMessage(remote, (message) => message.type === "paired");
    assert.equal(paired.type, "paired");
    assert.equal(paired.result.paired, true);
    assert.equal(local.messages.at(-1).result.peerPublicKey.x, remoteKey.x);
    assert.equal(local.messages.at(-1).result.resumeCredential, undefined);
    assert.match(paired.result.resumeCredential, /^[A-Za-z0-9_-]{43}$/);
    await object.fetch(remoteRequest);
    const resumedRemote = latestPair[1];
    resumedRemote.emit("message", { action: "reattach-remote", deviceId: "primary-windows", sessionId: paired.result.sessionId, resumeCredential: paired.result.resumeCredential });
    await waitForSocketMessage(resumedRemote, (message) => message.type === "paired");
    assert.equal(resumedRemote.messages.at(-1).type, "paired");
    assert.equal(resumedRemote.messages.at(-1).result.sessionId, paired.result.sessionId);
    const frame = { schemaVersion: 1, sessionId: paired.result.sessionId, direction: "ui-to-runtime", counter: 1, iv: "a".repeat(16), ciphertext: "b".repeat(32) };
    resumedRemote.emit("message", { action: "forward", sessionId: paired.result.sessionId, from: "remote", frame });
    await waitForSocketMessage(resumedRemote, (message) => message.type === "forward-accepted");
    assert.deepEqual(local.messages.at(-1), { type: "frame", sessionId: paired.result.sessionId, frame });
    assert.ok(storage.has("relay-broker-v1"));
  } finally {
    globalThis.WebSocketPair = OriginalPair;
    globalThis.Response = OriginalResponse;
  }
});

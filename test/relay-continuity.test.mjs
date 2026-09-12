import test from "node:test";
import assert from "node:assert/strict";
import { acceptPairingOffer, createPairingOffer, deriveRelaySession, sealFrame } from "../src/relay-client.mjs";
import { createRelayRuntimePeer } from "../src/relay-runtime.mjs";
import { createRelayBroker } from "../relay/core.mjs";

const owner = "owner@example.com";
const origin = "https://michaeljwilliams0123.github.io";

test("authenticated relay heartbeat renews the bounded inactivity window", async () => {
  let current = 0;
  const broker = createRelayBroker({ ownerIdentity: owner, allowedOrigin: origin, now: () => current, limits: { sessionTtlMs: 60_000 } });
  const local = broker.pairLocal({ owner, deviceId: "primary-windows", pairingId: "pair-heartbeat" });
  await broker.pairRemote({ owner, origin, pairingId: "pair-heartbeat" });
  current = 50_000;
  const renewed = broker.heartbeat({ owner, sessionId: local.sessionId, side: "local" });
  assert.equal(Date.parse(renewed.expiresAt), 110_000);
  current = 109_999;
  assert.equal(broker.sessionDetails(local.sessionId).sessionId, local.sessionId);
  current = 110_001;
  assert.throws(() => broker.heartbeat({ owner, sessionId: local.sessionId, side: "local" }), /relay-session-missing/);
});

test("replacement runtime restores relay crypto state and counters before reattaching", async () => {
  const firstPairing = await createPairingOffer({ now: () => 0 });
  const replacementPairing = await createPairingOffer({ now: () => 0 });
  const remotePairing = await acceptPairingOffer(firstPairing.publicOffer, { now: () => 1 });
  const sessionId = `rls-${"c".repeat(32)}`;
  let saved = null;
  const sessionStateStore = {
    async load() { return saved ? structuredClone(saved) : null; },
    async save(value) { saved = structuredClone(value); },
    async clear() { saved = null; },
  };
  const gateway = gatewayStub();
  const sockets = [];
  const WebSocketImpl = class {
    constructor() { const socket = new FakeSocket({ sessionId, pairing: firstPairing, remotePairing }); sockets.push(socket); return socket; }
  };
  const first = createRelayRuntimePeer({ pairing: firstPairing, gateway, localAccessToken: "t".repeat(48), WebSocketImpl, sessionStateStore, heartbeatIntervalMs: 0 });
  await first.connect();
  const remoteSession = await deriveRelaySession(remotePairing.privateKey, firstPairing.publicKey, remotePairing.context);
  remoteSession.sessionId = sessionId;
  const request = await sealFrame(remoteSession, { requestId: "persist-1", type: "capabilities", payload: {} });
  sockets[0].emit("message", { type: "frame", sessionId, frame: request });
  await waitFor(() => sockets[0].sent.some((message) => message.action === "forward"));
  first.close();
  assert.ok(saved, "paired runtime must persist resumable relay state");

  const second = createRelayRuntimePeer({ pairing: replacementPairing, gateway, localAccessToken: "t".repeat(48), WebSocketImpl, sessionStateStore, heartbeatIntervalMs: 0 });
  await second.connect();
  const secondSocket = sockets[1];
  assert.equal(secondSocket.sent.some((message) => message.action === "pair-local"), false);
  assert.equal(secondSocket.sent.some((message) => message.action === "reattach-local" && message.sessionId === sessionId), true);
  assert.equal(secondSocket.sent.find((message) => message.action === "replay")?.afterCounter, 1);
  second.close();
});

class FakeSocket {
  static OPEN = 1;
  constructor({ sessionId, pairing, remotePairing }) {
    this.sessionId = sessionId; this.pairing = pairing; this.remotePairing = remotePairing;
    this.readyState = 0; this.listeners = new Map(); this.sent = [];
    queueMicrotask(() => { this.readyState = 1; this.emit("open"); });
  }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
  send(value) {
    const message = JSON.parse(value); this.sent.push(message);
    if (new Set(["pair-local", "reattach-local"]).has(message.action)) queueMicrotask(() => this.emit("message", { type: "paired", accepted: true, result: { sessionId: this.sessionId, deviceId: "primary-windows", pairingId: this.pairing.publicOffer.pairingId, paired: true, peerPublicKey: this.remotePairing.publicKey } }));
  }
  close() { this.readyState = 3; this.emit("close"); }
  emit(type, value) { for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) }); }
}

function gatewayStub() {
  return {
    capabilities: () => [], createRun: () => ({}), replay: () => [], cancelRun() {}, chat: () => ({}),
    tasks: () => [], messages: () => [], messageContent: () => ({}), taskAction: () => ({}),
    operationsSnapshot: () => ({}), operationsAction: () => ({}),
  };
}

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error("Timed out waiting for relay response.");
}

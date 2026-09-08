import test from "node:test";
import assert from "node:assert/strict";
import { createPairingOffer, deriveRelaySession, openFrame, sealFrame } from "../src/relay-client.mjs";
import { createTwinEvent } from "../src/twin-federation.mjs";
import { createTwinRelayRemotePeer } from "../src/twin-relay-runtime.mjs";

const createdAt = "2026-09-08T02:00:00.000Z";
const baseCommit = "f8c0cb1d98061ffe129bfb1727089602e5559c2b";
const headCommit = "1111111111111111111111111111111111111111";

function event(overrides = {}) {
  return createTwinEvent({
    federationId: "mahoraga-federation",
    originPeerId: "mahoraga-primary",
    targetPeerId: "mahoraga-twin-1",
    sequence: 1,
    kind: "update",
    repository: "michaeljwilliams0123/mahoraga",
    baseCommit,
    headCommit,
    capability: null,
    payloadDigest: "a".repeat(64),
    createdAt,
    ...overrides,
  });
}

test("twin remote peer pairs through the dedicated runtime relay path and sends encrypted events", async () => {
  const primaryPairing = await createPairingOffer({ now: () => 0 });
  const assignedSessionId = `rls-${"t".repeat(32)}`;
  let socket;

  class FakeSocket {
    static OPEN = 1;
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.listeners = new Map();
      this.sent = [];
      queueMicrotask(() => { this.readyState = 1; this.emit("open"); });
    }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    send(value) {
      const message = JSON.parse(value);
      this.sent.push(message);
      if (message.action === "pair-remote") {
        queueMicrotask(() => this.emit("message", {
          type: "paired",
          accepted: true,
          result: {
            sessionId: assignedSessionId,
            deviceId: "mahoraga-primary",
            pairingId: primaryPairing.publicOffer.pairingId,
            paired: true,
            peerPublicKey: primaryPairing.publicKey,
          },
        }));
      }
    }
    close() { this.readyState = 3; this.emit("close"); }
    emit(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) });
    }
  }

  const peer = createTwinRelayRemotePeer({
    pairingOffer: primaryPairing.publicOffer,
    peerId: "mahoraga-twin-1",
    localAccessToken: "t".repeat(48),
    WebSocketImpl: class { constructor(url, protocols) { socket = new FakeSocket(url, protocols); return socket; } },
  });
  await peer.connect();

  assert.equal(socket.url, "wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair/twin");
  assert.deepEqual(socket.protocols, ["mahoraga-twin-v1", `mahoraga-auth-${"t".repeat(48)}`]);
  const pairMessage = socket.sent.find((message) => message.action === "pair-remote");
  assert.equal(pairMessage.pairingId, primaryPairing.publicOffer.pairingId);
  assert.equal(pairMessage.code, primaryPairing.publicOffer.code);

  await peer.send(event());
  const envelope = socket.sent.find((message) => message.action === "forward");
  assert.equal(envelope.from, "remote");

  const primarySession = await deriveRelaySession(primaryPairing.privateKey, pairMessage.devicePublicKey, primaryPairing.context);
  primarySession.sessionId = assignedSessionId;
  assert.deepEqual(await openFrame(primarySession, envelope.frame), { type: "twin-event", event: event() });
  peer.close();
});

test("twin remote peer accepts a primary event once and suppresses relay replay echo", async () => {
  const primaryPairing = await createPairingOffer({ now: () => 0 });
  const assignedSessionId = `rls-${"u".repeat(32)}`;
  let socket;
  let pairMessage;
  const applied = [];

  class FakeSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.listeners = new Map();
      this.sent = [];
      queueMicrotask(() => { this.readyState = 1; this.emit("open"); });
    }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    send(value) {
      const message = JSON.parse(value);
      this.sent.push(message);
      if (message.action === "pair-remote") {
        pairMessage = message;
        queueMicrotask(() => this.emit("message", {
          type: "paired",
          accepted: true,
          result: {
            sessionId: assignedSessionId,
            deviceId: "mahoraga-primary",
            pairingId: primaryPairing.publicOffer.pairingId,
            paired: true,
            peerPublicKey: primaryPairing.publicKey,
          },
        }));
      }
    }
    close() { this.readyState = 3; this.emit("close"); }
    emit(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) });
    }
  }

  const peer = createTwinRelayRemotePeer({
    pairingOffer: primaryPairing.publicOffer,
    peerId: "mahoraga-twin-1",
    localAccessToken: "t".repeat(48),
    onEvent: (value, acceptance) => applied.push([value.eventId, acceptance.reason]),
    WebSocketImpl: class { constructor() { socket = new FakeSocket(); return socket; } },
  });
  await peer.connect();

  const primarySession = await deriveRelaySession(primaryPairing.privateKey, pairMessage.devicePublicKey, primaryPairing.context);
  primarySession.sessionId = assignedSessionId;
  const incoming = event();
  const firstFrame = await sealFrame(primarySession, { type: "twin-event", event: incoming }, { direction: "runtime-to-ui" });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: firstFrame });
  await waitFor(() => applied.length === 1);
  assert.deepEqual(applied, [[incoming.eventId, "accepted"]]);

  const replayFrame = await sealFrame(primarySession, { type: "twin-event", event: incoming }, { direction: "runtime-to-ui" });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: replayFrame });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(applied.length, 1);
  assert.equal(peer.status().connected, true);
  peer.close();
});

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for twin relay event.");
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptPairingOffer, createPairingOffer, deriveRelaySession, openFrame, sealFrame } from "../src/relay-client.mjs";
import { createRelayRuntimePeer } from "../src/relay-runtime.mjs";
import { TwinEventJournal } from "../src/twin-event-journal.mjs";
import { createTwinEvent } from "../src/twin-federation.mjs";
import { createTwinRelayRemotePeer } from "../src/twin-relay-runtime.mjs";

const createdAt = "2026-09-08T02:00:00.000Z";
const baseCommit = "f8c0cb1d98061ffe129bfb1727089602e5559c2b";
const headCommit = "1111111111111111111111111111111111111111";
const federationId = "mahoraga-federation";

function event(overrides = {}) {
  return createTwinEvent({
    federationId,
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

function gateway() {
  return {
    capabilities: () => [],
    createRun: () => ({ run: { id: "run-twin" } }),
    replay: () => [],
    cancelRun: () => ({}),
    chat: () => ({}),
    tasks: () => [],
    messages: () => [],
    messageContent: () => ({ content: "" }),
    taskAction: () => ({ task: null }),
    operationsSnapshot: () => ({ generatedAt: createdAt }),
    operationsAction: () => ({ ok: true }),
  };
}

function durableJournal(t, localPeerId) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-twin-relay-journal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return new TwinEventJournal(path.join(root, "twin.sqlite"), {
    federationId,
    localPeerId,
    localCommit: baseCommit,
    now: () => "2026-09-08T02:01:00.000Z",
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
    federationId,
    peerId: "mahoraga-twin-1",
    localAccessToken: "t".repeat(48),
    now: () => 1,
    WebSocketImpl: class { constructor(url, protocols) { socket = new FakeSocket(url, protocols); return socket; } },
  });
  await peer.connect();

  assert.equal(socket.url, "wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair/twin");
  assert.deepEqual(socket.protocols, ["mahoraga-twin-v1", `mahoraga-auth-${"t".repeat(48)}`]);
  const pairMessage = socket.sent.find((message) => message.action === "pair-remote");
  assert.equal(pairMessage.pairingId, primaryPairing.publicOffer.pairingId);
  assert.equal(pairMessage.code, primaryPairing.publicOffer.code);

  const outgoing = event({ originPeerId: "mahoraga-twin-1", targetPeerId: "mahoraga-primary" });
  await peer.send(outgoing);
  const envelope = socket.sent.find((message) => message.action === "forward");
  assert.equal(envelope.from, "remote");

  const primarySession = await deriveRelaySession(primaryPairing.privateKey, pairMessage.devicePublicKey, primaryPairing.context);
  primarySession.sessionId = assignedSessionId;
  assert.deepEqual(await openFrame(primarySession, envelope.frame), { type: "twin-event", event: outgoing });
  peer.close();
});

test("twin remote peer accepts a primary event once and suppresses relay replay echo", async (t) => {
  const primaryPairing = await createPairingOffer({ now: () => 0 });
  const assignedSessionId = `rls-${"u".repeat(32)}`;
  let socket;
  let pairMessage;
  const applied = [];
  const journal = durableJournal(t, "mahoraga-twin-1");

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
    federationId,
    peerId: "mahoraga-twin-1",
    localAccessToken: "t".repeat(48),
    now: () => 1,
    journal,
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
  assert.deepEqual(journal.entries().map((entry) => entry.eventId), [incoming.eventId]);

  const replayFrame = await sealFrame(primarySession, { type: "twin-event", event: incoming }, { direction: "runtime-to-ui" });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: replayFrame });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(applied.length, 1);
  assert.equal(peer.status().connected, true);
  peer.close();
  journal.close();
});

test("primary runtime can send and receive reciprocal twin events on its existing relay session", async (t) => {
  const primaryPairing = await createPairingOffer({ now: () => 0 });
  const remotePairing = await acceptPairingOffer(primaryPairing.publicOffer, { now: () => 1 });
  const assignedSessionId = `rls-${"v".repeat(32)}`;
  const applied = [];
  const journal = durableJournal(t, "mahoraga-primary");
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
      if (message.action === "pair-local") {
        queueMicrotask(() => this.emit("message", {
          type: "paired",
          accepted: true,
          result: {
            sessionId: assignedSessionId,
            deviceId: "mahoraga-primary",
            pairingId: primaryPairing.publicOffer.pairingId,
            paired: true,
            peerPublicKey: remotePairing.publicKey,
          },
        }));
      }
    }
    close() { this.readyState = 3; this.emit("close"); }
    emit(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) });
    }
  }

  const peer = createRelayRuntimePeer({
    pairing: primaryPairing,
    deviceId: "mahoraga-primary",
    gateway: gateway(),
    localAccessToken: "t".repeat(48),
    twin: {
      federationId,
      peerId: "mahoraga-primary",
      journal,
      onEvent: (value, acceptance) => applied.push([value.eventId, acceptance.reason]),
    },
    WebSocketImpl: class { constructor(url, protocols) { socket = new FakeSocket(url, protocols); return socket; } },
  });
  await peer.connect();

  const outgoing = event();
  await peer.sendTwinEvent(outgoing);
  const localEnvelope = socket.sent.find((message) => message.action === "forward" && message.from === "local");
  const remoteSession = await deriveRelaySession(remotePairing.privateKey, primaryPairing.publicKey, remotePairing.context);
  remoteSession.sessionId = assignedSessionId;
  assert.deepEqual(await openFrame(remoteSession, localEnvelope.frame), { type: "twin-event", event: outgoing });

  const incoming = event({
    originPeerId: "mahoraga-twin-1",
    targetPeerId: "mahoraga-primary",
    sequence: 2,
    payloadDigest: "b".repeat(64),
  });
  const incomingFrame = await sealFrame(remoteSession, { type: "twin-event", event: incoming }, { direction: "ui-to-runtime" });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: incomingFrame });
  await waitFor(() => applied.length === 1);
  assert.deepEqual(applied, [[incoming.eventId, "accepted"]]);
  assert.deepEqual(journal.entries().map((entry) => entry.eventId), [incoming.eventId]);
  peer.close();
  journal.close();
});

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for twin relay event.");
}

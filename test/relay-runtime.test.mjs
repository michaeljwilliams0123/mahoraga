import test from "node:test";
import assert from "node:assert/strict";
import { createPairingOffer, deriveRelaySession, sealFrame, openFrame } from "../src/relay-client.mjs";
import { createRelayRuntimePeer } from "../src/relay-runtime.mjs";

test("runtime relay peer pairs, decrypts a request, and returns an encrypted gateway result", async () => {
  const localPairing = await createPairingOffer({ now: () => 0 });
  const remotePairing = await (await import("../src/relay-client.mjs")).acceptPairingOffer(localPairing.publicOffer, { now: () => 1 });
  const assignedSessionId = `rls-${"a".repeat(32)}`;
  const calls = [];
  const gateway = {
    capabilities: () => [{ capability: "system.health", routable: true, workerIds: ["local-core"] }],
    createRun(input) { calls.push(["run", input]); return { run: { id: "run-relay", conversationId: input.conversationId, state: "queued" } }; },
    replay(runId, afterEventId) { calls.push(["events", { runId, afterEventId }]); return [{ eventId: 2, type: "run-completed" }]; },
    cancelRun() {},
    chat: (payload, context) => { calls.push(["chat", payload]); return { decision: { mode: payload.mode }, contextSessionId: context.attendedSession.sessionId }; },
    tasks: () => [], messages: () => [],
    messageContent: () => ({ content: "bounded answer" }), taskAction: () => ({ task: null }),
  };
  class FakeSocket {
    static OPEN = 1;
    constructor(url, protocols) { this.url = url; this.protocols = protocols; this.readyState = 0; this.listeners = new Map(); this.sent = []; queueMicrotask(() => { this.readyState = 1; this.emit("open"); }); }
    addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
    send(value) {
      const message = JSON.parse(value); this.sent.push(message);
      if (new Set(["pair-local", "reattach-local"]).has(message.action)) queueMicrotask(() => this.emit("message", { type: "paired", accepted: true, result: { sessionId: assignedSessionId, deviceId: "primary-windows", pairingId: localPairing.publicOffer.pairingId, paired: true, peerPublicKey: remotePairing.publicKey } }));
    }
    close() { this.readyState = 3; this.emit("close"); }
    emit(type, value) { for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) }); }
  }
  let socket; const sockets = [];
  const peer = createRelayRuntimePeer({ pairing: localPairing, gateway, localAccessToken: "t".repeat(48), WebSocketImpl: class { constructor(url, protocols) { socket = new FakeSocket(url, protocols); sockets.push(socket); return socket; } } });
  await peer.connect();
  assert.equal(peer.status().sessionId, assignedSessionId);
  assert.equal(socket.url, "wss://relay.mahoraga.app/pair/local");
  assert.deepEqual(socket.protocols, ["mahoraga-local-v1", `mahoraga-auth-${"t".repeat(48)}`]);
  const remoteSession = await deriveRelaySession(remotePairing.privateKey, localPairing.publicKey, remotePairing.context);
  remoteSession.sessionId = assignedSessionId;
  const requestFrame = await sealFrame(remoteSession, { requestId: "req-1", type: "capabilities", payload: {} });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: requestFrame });
  await waitFor(() => socket.sent.some((message) => message.action === "forward" && message.from === "local"));
  const responseEnvelope = socket.sent.find((message) => message.action === "forward" && message.from === "local");
  assert.ok(responseEnvelope);
  assert.deepEqual(await openFrame(remoteSession, responseEnvelope.frame), { requestId: "req-1", result: { capabilities: gateway.capabilities() } });
  const chatFrame = await sealFrame(remoteSession, { requestId: "req-2", type: "chat", payload: { mode: "ask", content: "Why does it rain?" } });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: chatFrame });
  await waitFor(() => socket.sent.filter((message) => message.action === "forward" && message.from === "local").length === 2);
  const chatEnvelope = socket.sent.filter((message) => message.action === "forward" && message.from === "local").at(-1);
  assert.deepEqual(await openFrame(remoteSession, chatEnvelope.frame), {
    requestId: "req-2",
    result: { decision: { mode: "ask" }, contextSessionId: assignedSessionId },
  });
  assert.equal(calls.find(([kind]) => kind === "chat")[1].creditPolicy, "zero-codex");
  const attachmentFrame = await sealFrame(remoteSession, {
    requestId: "req-3", type: "chat",
    payload: { mode: "ask", content: "Inspect this", attachmentIds: ["art-00000000-0000-0000-0000-000000000000"] },
  });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: attachmentFrame });
  await waitFor(() => socket.sent.filter((message) => message.action === "forward" && message.from === "local").length === 3);
  const attachmentEnvelope = socket.sent.filter((message) => message.action === "forward" && message.from === "local").at(-1);
  assert.deepEqual(await openFrame(remoteSession, attachmentEnvelope.frame), {
    requestId: "req-3",
    error: "relay-attachments-local-only",
  });
  const runFrame = await sealFrame(remoteSession, { requestId: "req-4", type: "run", payload: { conversationId: "con-relay", content: "status" } });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: runFrame });
  await waitFor(() => socket.sent.filter((message) => message.action === "forward").length === 4);
  assert.match(calls.find(([kind]) => kind === "run")[1].sessionId, /^ses-relay-/);
  const eventsFrame = await sealFrame(remoteSession, { requestId: "req-5", type: "events", payload: { runId: "run-relay", afterEventId: 1 } });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: eventsFrame });
  await waitFor(() => socket.sent.filter((message) => message.action === "forward").length === 5);
  const eventsEnvelope = socket.sent.filter((message) => message.action === "forward").at(-1);
  assert.deepEqual(await openFrame(remoteSession, eventsEnvelope.frame), { requestId: "req-5", result: { events: [{ eventId: 2, type: "run-completed" }] } });

  socket.close(); await peer.connect();
  assert.equal(sockets.length, 2);
  assert.equal(socket.sent.some((message) => message.action === "pair-local"), false);
  assert.equal(socket.sent.some((message) => message.action === "reattach-local" && message.sessionId === assignedSessionId), true);
  assert.equal(socket.sent.find((message) => message.action === "replay").afterCounter, 5);
  peer.close();
});

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for relay response.");
}

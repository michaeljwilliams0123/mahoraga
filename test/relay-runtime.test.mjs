import test from "node:test";
import assert from "node:assert/strict";
import { createPairingOffer, deriveRelaySession, sealFrame, openFrame } from "../src/relay-client.mjs";
import { createRelayRuntimePeer } from "../src/relay-runtime.mjs";

test("runtime relay peer pairs, decrypts a request, and returns an encrypted gateway result", async () => {
  const localPairing = await createPairingOffer({ now: () => 0 });
  const remotePairing = await (await import("../src/relay-client.mjs")).acceptPairingOffer(localPairing.publicOffer, { now: () => 1 });
  const assignedSessionId = `rls-${"a".repeat(32)}`;
  const gateway = { capabilities: () => [{ capability: "system.health", routable: true, workerIds: ["local-core"] }], createRun() {}, replay() {}, cancelRun() {} };
  class FakeSocket {
    static OPEN = 1;
    constructor() { this.readyState = 0; this.listeners = new Map(); this.sent = []; queueMicrotask(() => { this.readyState = 1; this.emit("open"); }); }
    addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
    send(value) {
      const message = JSON.parse(value); this.sent.push(message);
      if (message.action === "pair-local") queueMicrotask(() => this.emit("message", { type: "paired", accepted: true, result: { sessionId: assignedSessionId, deviceId: "primary-windows", pairingId: message.pairingId, paired: true, peerPublicKey: remotePairing.publicKey } }));
    }
    close() { this.readyState = 3; this.emit("close"); }
    emit(type, value) { for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) }); }
  }
  let socket;
  const peer = createRelayRuntimePeer({ pairing: localPairing, gateway, WebSocketImpl: class { constructor() { socket = new FakeSocket(); return socket; } } });
  await peer.connect();
  assert.equal(peer.status().sessionId, assignedSessionId);
  const remoteSession = await deriveRelaySession(remotePairing.privateKey, localPairing.publicKey, remotePairing.context);
  remoteSession.sessionId = assignedSessionId;
  const requestFrame = await sealFrame(remoteSession, { requestId: "req-1", type: "capabilities", payload: {} });
  socket.emit("message", { type: "frame", sessionId: assignedSessionId, frame: requestFrame });
  await waitFor(() => socket.sent.some((message) => message.action === "forward" && message.from === "local"));
  const responseEnvelope = socket.sent.find((message) => message.action === "forward" && message.from === "local");
  assert.ok(responseEnvelope);
  assert.deepEqual(await openFrame(remoteSession, responseEnvelope.frame), { requestId: "req-1", result: { capabilities: gateway.capabilities() } });
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

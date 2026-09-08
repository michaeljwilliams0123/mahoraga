import { acceptPairingOffer, deriveRelaySession, openFrame, sealFrame } from "./relay-client.mjs";
import { createTwinInbox, validateTwinEvent } from "./twin-federation.mjs";

const DEFAULT_TWIN_RELAY_URL = "wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair/twin";
const TWIN_RELAY_PROTOCOL = "mahoraga-twin-v1";

export function createTwinRelayRemotePeer({
  relayUrl = DEFAULT_TWIN_RELAY_URL,
  pairingOffer,
  federationId,
  peerId,
  localAccessToken,
  maximumEventIds = 512,
  onEvent = null,
  now = () => Date.now(),
  WebSocketImpl = globalThis.WebSocket,
} = {}) {
  if (relayUrl !== DEFAULT_TWIN_RELAY_URL) fail("twin-relay-url-invalid");
  if (!pairingOffer || typeof pairingOffer !== "object" || Array.isArray(pairingOffer)) fail("twin-relay-pairing-invalid");
  slug(federationId, "twin-relay-federation-invalid");
  token(peerId, "twin-relay-peer-invalid");
  if (typeof localAccessToken !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(localAccessToken)) fail("twin-relay-access-token-invalid");
  if (!Number.isSafeInteger(maximumEventIds) || maximumEventIds < 1 || maximumEventIds > 4096) fail("twin-relay-inbox-limit-invalid");
  if (onEvent !== null && typeof onEvent !== "function") fail("twin-relay-handler-invalid");
  if (typeof now !== "function" || typeof WebSocketImpl !== "function") fail("twin-relay-runtime-invalid");

  const inbox = createTwinInbox({ peerId, maximumEventIds });
  let socket = null;
  let remotePairing = null;
  let session = null;
  let connectPromise = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let stopped = false;

  const api = {
    async connect() {
      stopped = false;
      if (socketReady(socket) && session) return connectedProjection();
      if (connectPromise) return connectPromise;
      connectPromise = connectInternal().finally(() => { connectPromise = null; });
      return connectPromise;
    },
    async send(rawEvent) {
      if (!socketReady(socket) || !session) fail("twin-relay-not-connected");
      const event = outboundEvent(rawEvent);
      const frame = await sealFrame(session, { type: "twin-event", event }, { direction: "ui-to-runtime" });
      socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "remote", frame }));
      return Object.freeze({ accepted: true, eventId: event.eventId, sessionId: session.sessionId });
    },
    close() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) socket.close?.(1000, "twin-runtime-shutdown");
      socket = null;
      session = null;
    },
    status() {
      return Object.freeze({
        connected: Boolean(socketReady(socket) && session),
        sessionId: session?.sessionId ?? null,
        federationId,
        peerId,
      });
    },
    inboxSnapshot() { return inbox.snapshot(); },
  };
  return Object.freeze(api);

  async function connectInternal() {
    remotePairing ??= await acceptPairingOffer(pairingOffer, { now });
    socket = new WebSocketImpl(relayUrl, [TWIN_RELAY_PROTOCOL, `mahoraga-auth-${localAccessToken}`]);
    const opened = await waitForOpen(socket);
    if (!opened) fail("twin-relay-connect-failed");
    const paired = await waitForPairing(socket);
    if (!paired?.sessionId || paired.paired !== true || !paired.peerPublicKey) fail("twin-relay-pairing-response-invalid");
    if (!/^rls-[A-Za-z0-9_-]{32}$/.test(paired.sessionId)) fail("twin-relay-session-invalid");
    session ??= await deriveRelaySession(remotePairing.privateKey, paired.peerPublicKey, remotePairing.context);
    session.sessionId = paired.sessionId;
    socket.addEventListener("message", (event) => { void receive(event); });
    socket.addEventListener("close", () => {
      if (!stopped && session) {
        socket = null;
        scheduleReconnect();
      }
    }, { once: true });
    reconnectAttempts = 0;
    socket.send(JSON.stringify({
      action: "replay",
      sessionId: session.sessionId,
      to: "remote",
      afterCounter: session.receivedCounters.get("runtime-to-ui") ?? 0,
    }));
    return connectedProjection();
  }

  function connectedProjection() {
    return Object.freeze({ sessionId: session.sessionId, federationId, peerId });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer || !session || reconnectAttempts >= 8) return;
    const delayMs = Math.min(10_000, 500 * (2 ** reconnectAttempts));
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void api.connect().catch(() => scheduleReconnect());
    }, delayMs);
  }

  async function waitForOpen(currentSocket) {
    if (currentSocket.readyState === 1 || currentSocket.readyState === currentSocket.OPEN) return true;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(error("twin-relay-connect-timeout")), 10_000);
      currentSocket.addEventListener("open", () => { clearTimeout(timer); resolve(true); }, { once: true });
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(error("twin-relay-connect-failed")); }, { once: true });
    });
  }

  function waitForPairing(currentSocket) {
    return new Promise((resolve, reject) => {
      const remaining = Date.parse(pairingOffer.expiresAt) - Number(now());
      const timer = setTimeout(() => reject(error("twin-relay-pairing-timeout")), Math.max(1_000, Math.min(300_000, remaining)));
      const onMessage = (event) => {
        let value;
        try { value = JSON.parse(String(event.data)); } catch { return; }
        if (value.type !== "paired") return;
        if (!value.accepted) {
          clearTimeout(timer);
          reject(error(value.error || "twin-relay-pairing-rejected"));
          return;
        }
        if (value.result?.paired !== true || !value.result.peerPublicKey) return;
        clearTimeout(timer);
        resolve(value.result);
      };
      currentSocket.addEventListener("message", onMessage);
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(error("twin-relay-pairing-failed")); }, { once: true });
      currentSocket.send(JSON.stringify({
        action: "pair-remote",
        pairingId: pairingOffer.pairingId,
        code: pairingOffer.code,
        devicePublicKey: remotePairing.publicKey,
      }));
    });
  }

  async function receive(rawMessage) {
    if (!session || !socket) return;
    let envelope;
    try { envelope = JSON.parse(String(rawMessage.data)); } catch { return; }
    if (envelope.type !== "frame" || !envelope.frame) return;
    let payload;
    try { payload = await openFrame(session, envelope.frame); } catch { return; }
    if (!payload || payload.type !== "twin-event" || !payload.event) return;
    let event;
    try { event = validateTwinEvent(payload.event); } catch { return; }
    if (event.federationId !== federationId || event.originPeerId === peerId) return;
    const acceptance = inbox.accept(event);
    if (acceptance.applied && onEvent) await onEvent(event, acceptance);
  }

  function outboundEvent(rawEvent) {
    const event = validateTwinEvent(rawEvent);
    if (event.federationId !== federationId) fail("twin-relay-federation-mismatch");
    if (event.originPeerId !== peerId) fail("twin-relay-origin-mismatch");
    return event;
  }
}

function socketReady(value) { return Boolean(value && (value.readyState === 1 || value.readyState === value.OPEN)); }
function slug(value, code) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); }
function token(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(value)) fail(code); }
function error(code) { const value = new TypeError(code); value.code = code; return value; }
function fail(code) { throw error(code); }

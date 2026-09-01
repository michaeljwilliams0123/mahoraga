import { deriveRelaySession, openFrame, sealFrame } from "./relay-client.mjs";

const DEFAULT_RELAY_URL = "wss://relay.mahoraga.app/pair";
const ACTIONS = new Set(["run", "chat", "tasks", "messages", "message-content", "task-action", "events", "cancel", "capabilities", "improvement"]);

export function createRelayRuntimePeer({
  relayUrl = DEFAULT_RELAY_URL,
  pairing,
  deviceId = "primary-windows",
  gateway,
  WebSocketImpl = globalThis.WebSocket,
  webSocketOptions = undefined,
} = {}) {
  if (relayUrl !== DEFAULT_RELAY_URL) fail("relay-runtime-url-invalid");
  if (!pairing || !pairing.privateKey || !pairing.publicKey || !pairing.publicOffer) fail("relay-runtime-pairing-invalid");
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(deviceId)) fail("relay-runtime-device-invalid");
  if (!gateway || ["createRun", "chat", "tasks", "messages", "messageContent", "taskAction", "replay", "cancelRun", "capabilities"].some((name) => typeof gateway[name] !== "function")) fail("relay-runtime-gateway-invalid");
  if (typeof WebSocketImpl !== "function") fail("relay-runtime-websocket-invalid");

  let socket = null;
  let session = null;
  let pairingResult = null;
  let connectPromise = null;

  const api = {
    async connect() {
      if (session) return Object.freeze({ sessionId: session.sessionId, deviceId });
      if (connectPromise) return connectPromise;
      connectPromise = connectInternal().finally(() => { connectPromise = null; });
      return connectPromise;
    },
    close() {
      if (socket) socket.close?.(1000, "runtime-shutdown");
      socket = null; session = null; pairingResult = null;
    },
    status() { return Object.freeze({ connected: Boolean(socket && session), sessionId: session?.sessionId ?? null, deviceId }); },
  };
  return Object.freeze(api);

  async function connectInternal() {
    socket = webSocketOptions === undefined ? new WebSocketImpl(relayUrl) : new WebSocketImpl(relayUrl, webSocketOptions);
    const opened = await waitForOpen(socket);
    if (!opened) fail("relay-runtime-connect-failed");
    const paired = await waitForPairing(socket);
    if (!paired?.sessionId || paired.paired !== true || !paired.peerPublicKey) fail("relay-runtime-pairing-response-invalid");
    pairingResult = paired;
    session = await deriveRelaySession(pairing.privateKey, paired.peerPublicKey, pairing.context);
    if (!/^rls-[A-Za-z0-9_-]{32}$/.test(paired.sessionId)) fail("relay-runtime-session-invalid");
    session.sessionId = paired.sessionId;
    socket.addEventListener("message", (event) => { void receive(event); });
    socket.addEventListener("close", () => { session = null; pairingResult = null; });
    socket.send(JSON.stringify({ action: "replay", sessionId: session.sessionId, to: "local", afterCounter: 0 }));
    return Object.freeze({ sessionId: session.sessionId, deviceId });
  }

  async function waitForOpen(currentSocket) {
    if (currentSocket.readyState === 1 || currentSocket.readyState === currentSocket.OPEN) return true;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay-runtime-connect-timeout")), 10_000);
      currentSocket.addEventListener("open", () => { clearTimeout(timer); resolve(true); }, { once: true });
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("relay-runtime-connect-failed")); }, { once: true });
    });
  }

  function waitForPairing(currentSocket) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay-runtime-pairing-timeout")), 10_000);
      const onMessage = (event) => {
        let value; try { value = JSON.parse(String(event.data)); } catch { return; }
        if (value.type !== "paired") return;
        if (!value.accepted) { clearTimeout(timer); reject(new Error(value.error || "relay-runtime-pairing-rejected")); return; }
        if (value.result?.paired !== true || !value.result.peerPublicKey) return;
        clearTimeout(timer); resolve(value.result);
      };
      currentSocket.addEventListener("message", onMessage);
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("relay-runtime-pairing-failed")); }, { once: true });
      const offer = pairing.publicOffer;
      currentSocket.send(JSON.stringify({ action: "pair-local", deviceId, pairingId: offer.pairingId, code: offer.code, devicePublicKey: pairing.publicKey }));
    });
  }

  async function receive(event) {
    if (!session || !socket) return;
    let envelope; try { envelope = JSON.parse(String(event.data)); } catch { return; }
    if (envelope.type !== "frame" || !envelope.frame) return;
    let request;
    try {
      request = await openFrame(session, envelope.frame);
      if (!request || typeof request !== "object" || !ACTIONS.has(request.type) || typeof request.requestId !== "string") throw error("relay-runtime-request-invalid");
    } catch { return; }
    try {
      const result = await dispatch(request.type, request.payload);
      const frame = await sealFrame(session, { requestId: request.requestId, result }, { direction: "runtime-to-ui" });
      socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "local", frame }));
    } catch (cause) {
      try {
        const frame = await sealFrame(session, { requestId: request.requestId, error: publicCode(cause) }, { direction: "runtime-to-ui" });
        socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "local", frame }));
      } catch { /* a closed peer ends this request */ }
    }
  }

  async function dispatch(type, payload) {
    if (type === "run") return gateway.createRun(payload);
    const context = { attendedSession: { active: true, sessionId: session.sessionId }, mechanism: "owner-paired-relay" };
    if (type === "chat") {
      if (Array.isArray(payload?.attachmentIds) && payload.attachmentIds.length > 0) throw error("relay-attachments-local-only");
      return gateway.chat({ ...payload, attachmentIds: [] }, context);
    }
    if (type === "tasks") return { tasks: gateway.tasks(payload?.conversationId, context) };
    if (type === "messages") return { messages: gateway.messages(payload?.conversationId, context) };
    if (type === "message-content") return gateway.messageContent(payload, context);
    if (type === "task-action") return gateway.taskAction(payload, context);
    if (type === "events") return gateway.replay(payload?.runId, payload?.afterEventId ?? 0);
    if (type === "cancel") return gateway.cancelRun(payload?.runId);
    if (type === "capabilities") return { capabilities: gateway.capabilities() };
    if (type === "improvement") return { improvement: gateway.getImprovement?.(payload?.id) ?? null };
    throw error("relay-runtime-request-invalid");
  }
}

function error(code) { const value = new TypeError(code); value.code = code; return value; }
function publicCode(value) { const code = String(value?.code ?? value?.message ?? "relay-runtime-failed").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 64); return /^[a-z]/.test(code) ? code : "relay-runtime-failed"; }
function fail(code) { throw error(code); }

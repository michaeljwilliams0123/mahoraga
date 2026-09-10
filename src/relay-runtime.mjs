import { deriveRelaySession, openFrame, sealFrame } from "./relay-client.mjs";
import { createTwinInbox, validateTwinEvent } from "./twin-federation.mjs";

const DEFAULT_RELAY_URL = "wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair/local";
const LOCAL_RELAY_PROTOCOL = "mahoraga-local-v1";
const ACTIONS = new Set(["run", "chat", "tasks", "messages", "message-content", "task-action", "events", "cancel", "capabilities", "improvement", "operations-snapshot", "operations-action"]);

export function createRelayRuntimePeer({
  relayUrl = DEFAULT_RELAY_URL,
  pairing,
  deviceId = "primary-windows",
  gateway,
  localAccessToken,
  twin = null,
  WebSocketImpl = globalThis.WebSocket,
  retryBudget = 8,
  random = Math.random,
  onReceipt = () => {},
  killSwitch = () => false,
  allowedDestinations = [DEFAULT_RELAY_URL],
} = {}) {
  if (!Array.isArray(allowedDestinations) || !allowedDestinations.includes(relayUrl) || new URL(relayUrl).protocol !== "wss:") fail("relay-runtime-url-invalid");
  if (!pairing || !pairing.privateKey || !pairing.publicKey || !pairing.publicOffer) fail("relay-runtime-pairing-invalid");
  if (typeof deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(deviceId)) fail("relay-runtime-device-invalid");
  if (!gateway || ["createRun", "chat", "tasks", "messages", "messageContent", "taskAction", "operationsSnapshot", "operationsAction", "replay", "cancelRun", "capabilities"].some((name) => typeof gateway[name] !== "function")) fail("relay-runtime-gateway-invalid");
  if (typeof localAccessToken !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(localAccessToken)) fail("relay-runtime-access-token-invalid");
  if (typeof WebSocketImpl !== "function") fail("relay-runtime-websocket-invalid");
  if (!Number.isSafeInteger(retryBudget) || retryBudget < 0 || retryBudget > 32 || typeof random !== "function" || typeof onReceipt !== "function" || typeof killSwitch !== "function") fail("relay-runtime-retry-policy-invalid");

  const twinState = normalizeTwin(twin);
  let socket = null;
  let session = null;
  let pairingResult = null;
  let connectPromise = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let stopped = false;
  let circuit = "closed";

  const api = {
    async connect() {
      if (killSwitch()) { circuit = "open"; receipt("kill-switch", { attempt: reconnectAttempts }); fail("relay-runtime-kill-switch-active"); }
      stopped = false;
      if (socketReady(socket) && session) return Object.freeze({ sessionId: session.sessionId, deviceId });
      if (connectPromise) return connectPromise;
      connectPromise = connectInternal().finally(() => { connectPromise = null; });
      return connectPromise;
    },
    async sendTwinEvent(rawEvent) {
      if (!twinState) fail("relay-runtime-twin-unconfigured");
      if (!socketReady(socket) || !session) fail("relay-runtime-not-connected");
      const event = validateTwinEvent(rawEvent);
      if (event.federationId !== twinState.federationId) fail("relay-runtime-twin-federation-mismatch");
      if (event.originPeerId !== twinState.peerId) fail("relay-runtime-twin-origin-mismatch");
      const frame = await sealFrame(session, { type: "twin-event", event }, { direction: "runtime-to-ui" });
      socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "local", frame }));
      return Object.freeze({ accepted: true, eventId: event.eventId, sessionId: session.sessionId });
    },
    close() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) socket.close?.(1000, "runtime-shutdown");
      socket = null; session = null; pairingResult = null;
    },
    status() {
      return Object.freeze({
        connected: Boolean(socketReady(socket) && session),
        sessionId: session?.sessionId ?? null,
        deviceId,
        twinPeerId: twinState?.peerId ?? null,
        reconnectAttempts,
        retryBudget,
        circuit,
      });
    },
    twinInboxSnapshot() { return twinState?.inbox.snapshot() ?? null; },
  };
  return Object.freeze(api);

  async function connectInternal() {
    socket = new WebSocketImpl(relayUrl, [LOCAL_RELAY_PROTOCOL, `mahoraga-auth-${localAccessToken}`]);
    const opened = await waitForOpen(socket);
    if (!opened) fail("relay-runtime-connect-failed");
    const paired = await waitForPairing(socket, Boolean(session && pairingResult));
    if (!paired?.sessionId || paired.paired !== true || !paired.peerPublicKey) fail("relay-runtime-pairing-response-invalid");
    pairingResult = paired;
    session ??= await deriveRelaySession(pairing.privateKey, paired.peerPublicKey, pairing.context);
    if (!/^rls-[A-Za-z0-9_-]{32}$/.test(paired.sessionId)) fail("relay-runtime-session-invalid");
    session.sessionId = paired.sessionId;
    socket.addEventListener("message", (event) => { void receive(event); });
    socket.addEventListener("close", () => { if (!stopped && session) { socket = null; scheduleReconnect(); } }, { once: true });
    reconnectAttempts = 0;
    circuit = "closed";
    receipt("connected", { sessionId: session.sessionId });
    socket.send(JSON.stringify({ action: "replay", sessionId: session.sessionId, to: "local", afterCounter: session.receivedCounters.get("ui-to-runtime") ?? 0 }));
    return Object.freeze({ sessionId: session.sessionId, deviceId });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer || !session) return;
    if (reconnectAttempts >= retryBudget) { circuit = "open"; receipt("circuit-open", { attempt: reconnectAttempts }); return; }
    const cap = Math.min(30_000, 500 * (2 ** reconnectAttempts));
    const delayMs = Math.floor(Math.max(0, Math.min(1, Number(random()))) * (cap + 1)); reconnectAttempts += 1;
    circuit = "half-open";
    receipt("reconnect-scheduled", { attempt: reconnectAttempts, delayMs });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void api.connect().catch(() => scheduleReconnect());
    }, delayMs);
  }

  async function waitForOpen(currentSocket) {
    if (currentSocket.readyState === 1 || currentSocket.readyState === currentSocket.OPEN) return true;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay-runtime-connect-timeout")), 10_000);
      currentSocket.addEventListener("open", () => { clearTimeout(timer); resolve(true); }, { once: true });
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("relay-runtime-connect-failed")); }, { once: true });
    });
  }

  function waitForPairing(currentSocket, reattach) {
    return new Promise((resolve, reject) => {
      const remaining = Date.parse(pairing.publicOffer.expiresAt) - Date.now();
      const timer = setTimeout(() => reject(new Error("relay-runtime-pairing-timeout")), Math.max(1_000, Math.min(300_000, remaining)));
      const onMessage = (event) => {
        let value; try { value = JSON.parse(String(event.data)); } catch { return; }
        if (value.type !== "paired") return;
        if (!value.accepted) { clearTimeout(timer); reject(new Error(value.error || "relay-runtime-pairing-rejected")); return; }
        if (value.result?.paired !== true || !value.result.peerPublicKey) return;
        clearTimeout(timer); resolve(value.result);
      };
      currentSocket.addEventListener("message", onMessage);
      currentSocket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("relay-runtime-pairing-failed")); }, { once: true });
      if (reattach) currentSocket.send(JSON.stringify({ action: "reattach-local", deviceId, sessionId: session.sessionId }));
      else {
        const offer = pairing.publicOffer;
        currentSocket.send(JSON.stringify({ action: "pair-local", deviceId, pairingId: offer.pairingId, code: offer.code, devicePublicKey: pairing.publicKey }));
      }
    });
  }

  async function receive(event) {
    if (!session || !socket) return;
    let envelope; try { envelope = JSON.parse(String(event.data)); } catch { return; }
    if (envelope.type !== "frame" || !envelope.frame) return;
    let request;
    try { request = await openFrame(session, envelope.frame); } catch { return; }
    if (request?.type === "twin-event") {
      await receiveTwinEvent(request.event);
      return;
    }
    try {
      if (!request || typeof request !== "object" || !ACTIONS.has(request.type) || typeof request.requestId !== "string") throw error("relay-runtime-request-invalid");
      const result = await dispatch(request.type, request.payload);
      const frame = await sealFrame(session, { requestId: request.requestId, result }, { direction: "runtime-to-ui" });
      socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "local", frame }));
    } catch (cause) {
      try {
        const frame = await sealFrame(session, { requestId: request?.requestId ?? "invalid", error: publicCode(cause) }, { direction: "runtime-to-ui" });
        socket.send(JSON.stringify({ action: "forward", sessionId: session.sessionId, from: "local", frame }));
      } catch { /* a closed peer ends this request */ }
    }
  }

  async function receiveTwinEvent(rawEvent) {
    if (!twinState) return;
    let event;
    try { event = validateTwinEvent(rawEvent); } catch { return; }
    if (event.federationId !== twinState.federationId || event.originPeerId === twinState.peerId) return;
    const acceptance = twinState.inbox.accept(event);
    if (acceptance.applied && twinState.onEvent) await twinState.onEvent(event, acceptance);
  }

  async function dispatch(type, payload) {
    if (type === "run") return gateway.createRun({ ...payload, sessionId: `ses-relay-${session.sessionId.slice(4)}` });
    const context = { attendedSession: { active: true, sessionId: session.sessionId }, mechanism: "owner-paired-relay" };
    if (type === "chat") {
      if (Array.isArray(payload?.attachmentIds) && payload.attachmentIds.length > 0) throw error("relay-attachments-local-only");
      return gateway.chat({ ...payload, creditPolicy: "zero-codex", attachmentIds: [] }, context);
    }
    if (type === "tasks") return { tasks: gateway.tasks(payload?.conversationId, context) };
    if (type === "messages") return { messages: gateway.messages(payload?.conversationId, context) };
    if (type === "message-content") return gateway.messageContent(payload, context);
    if (type === "task-action") return gateway.taskAction(payload, context);
    if (type === "events") return { events: gateway.replay(payload?.runId, payload?.afterEventId ?? 0) };
    if (type === "cancel") return gateway.cancelRun(payload?.runId);
    if (type === "capabilities") return { capabilities: gateway.capabilities() };
    if (type === "improvement") return { improvement: gateway.getImprovement?.(payload?.id) ?? null };
    if (type === "operations-snapshot") return gateway.operationsSnapshot(context);
    if (type === "operations-action") return gateway.operationsAction(payload, context);
    throw error("relay-runtime-request-invalid");
  }

  function receipt(state, detail) {
    onReceipt(Object.freeze({ schemaVersion: 1, type: "relay-egress", state, destination: relayUrl, capabilityAllowlist: [...ACTIONS].sort(), observedAt: new Date().toISOString(), ...detail }));
  }
}

function normalizeTwin(value) {
  if (value === null) return null;
  const allowed = new Set(["federationId", "peerId", "maximumEventIds", "onEvent", "journal"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) fail("relay-runtime-twin-invalid");
  if (typeof value.federationId !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value.federationId)) fail("relay-runtime-twin-invalid");
  if (typeof value.peerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(value.peerId)) fail("relay-runtime-twin-invalid");
  const maximumEventIds = value.maximumEventIds ?? 512;
  if (!Number.isSafeInteger(maximumEventIds) || maximumEventIds < 1 || maximumEventIds > 4096) fail("relay-runtime-twin-invalid");
  if (value.onEvent !== undefined && typeof value.onEvent !== "function") fail("relay-runtime-twin-invalid");
  if (value.journal !== undefined && !isTwinJournal(value.journal)) fail("relay-runtime-twin-invalid");
  return Object.freeze({
    federationId: value.federationId,
    peerId: value.peerId,
    onEvent: value.onEvent ?? null,
    inbox: value.journal ?? createTwinInbox({ peerId: value.peerId, maximumEventIds }),
  });
}

function socketReady(value) { return Boolean(value && (value.readyState === 1 || value.readyState === value.OPEN)); }
function isTwinJournal(value) { return Boolean(value && typeof value.accept === "function" && typeof value.snapshot === "function"); }
function error(code) { const value = new TypeError(code); value.code = code; return value; }
function publicCode(value) { const code = String(value?.code ?? value?.message ?? "relay-runtime-failed").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 64); return /^[a-z]/.test(code) ? code : "relay-runtime-failed"; }
function fail(code) { throw error(code); }

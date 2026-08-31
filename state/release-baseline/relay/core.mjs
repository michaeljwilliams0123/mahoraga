const FRAME_KEYS = new Set(["schemaVersion", "sessionId", "direction", "counter", "iv", "ciphertext"]);
const DEFAULT_LIMITS = Object.freeze({ maximumDevices: 3, maximumFrameBytes: 65_536, maximumFramesPerMinute: 120, sessionTtlMs: 30 * 60_000, reconnectTtlMs: 300_000 });

export function createRelayBroker({ ownerIdentity, allowedOrigin, limits = {}, now = () => Date.now(), initialState = null } = {}) {
  identity(ownerIdentity, "relay-owner-invalid"); originValue(allowedOrigin, "relay-origin-invalid");
  const bounded = validateLimits({ ...DEFAULT_LIMITS, ...limits });
  const sessions = new Map();
  const pairingIndex = new Map();
  const sockets = new Map();
  restore(initialState);

  const prune = () => {
    const current = timestamp(now());
    for (const [id, session] of sessions) {
      session.frames = session.frames.filter((item) => item.expiresAt > current);
      if (session.expiresAt <= current) {
        sessions.delete(id); pairingIndex.delete(session.pairingId); closeSockets(id, 1000, "relay-expired");
      }
    }
    return current;
  };
  const authorize = ({ owner, origin = null }, remote = false) => {
    if (owner !== ownerIdentity) fail("relay-owner-required");
    if (remote && origin !== allowedOrigin) fail("relay-origin-required");
  };
  const sessionFor = (sessionId) => { const session = sessions.get(sessionId); if (!session) fail("relay-session-missing"); return session; };

  return Object.freeze({
    pairLocal(input) {
      authorize(input); const current = prune();
      token(input.deviceId, "relay-device-invalid"); token(input.pairingId, "relay-pairing-invalid");
      if (pairingIndex.has(input.pairingId)) fail("relay-pairing-duplicate");
      if (new Set([...sessions.values()].map((item) => item.deviceId)).size >= bounded.maximumDevices) fail("relay-device-limit");
      const code = input.code === undefined ? null : pairingCode(input.code);
      const localPublicKey = input.devicePublicKey === undefined ? null : publicKey(input.devicePublicKey, "relay-device-key-invalid");
      const sessionId = `rls-${randomSessionSuffix()}`;
      const session = {
        sessionId, deviceId: input.deviceId, pairingId: input.pairingId, code, localPublicKey, remotePublicKey: null,
        localPaired: true, remotePaired: false, frames: [], rate: { windowStart: current, count: 0 },
        createdAt: current, expiresAt: current + bounded.sessionTtlMs,
      };
      sessions.set(sessionId, session); pairingIndex.set(input.pairingId, sessionId);
      if (input.socket) registerSocket({ owner: input.owner, origin: input.origin, sessionId, side: "local", socket: input.socket });
      return projection(session);
    },

    pairRemote(input) {
      authorize(input, true); prune(); token(input.pairingId, "relay-pairing-invalid");
      const sessionId = pairingIndex.get(input.pairingId); if (!sessionId) fail("relay-pairing-missing");
      const session = sessionFor(sessionId);
      if (session.code !== null) {
        if (pairingCode(input.code) !== session.code) fail("relay-pairing-proof-invalid");
        if (input.devicePublicKey === undefined) fail("relay-device-key-required");
      }
      if (input.devicePublicKey !== undefined) {
        const remotePublicKey = publicKey(input.devicePublicKey, "relay-device-key-invalid");
        if (session.remotePublicKey && JSON.stringify(session.remotePublicKey) !== JSON.stringify(remotePublicKey)) fail("relay-pairing-proof-invalid");
        session.remotePublicKey = remotePublicKey;
      }
      session.remotePaired = true;
      if (input.socket) registerSocket({ owner: input.owner, origin: input.origin, sessionId, side: "remote", socket: input.socket });
      return projection(session);
    },

    registerSocket(input) {
      authorize(input, input.side === "remote");
      const session = sessionFor(input.sessionId); side(input.side);
      if (!input.socket || typeof input.socket.send !== "function") fail("relay-socket-invalid");
      const current = sockets.get(session.sessionId) ?? {};
      if (current[input.side] && current[input.side] !== input.socket) closeSocket(current[input.side], 1000, "relay-replaced");
      current[input.side] = input.socket; sockets.set(session.sessionId, current);
      return projection(session);
    },

    unregisterSocket({ owner, origin, sessionId, side: socketSide, socket = null }) {
      authorize({ owner, origin }, socketSide === "remote"); side(socketSide);
      const current = sockets.get(sessionId); if (!current) return false;
      if (socket === null || current[socketSide] === socket) delete current[socketSide];
      if (!current.local && !current.remote) sockets.delete(sessionId);
      return true;
    },

    forward(input) {
      authorize(input, input.from === "remote"); const current = prune(); side(input.from);
      const session = sessionFor(input.sessionId); if (!session.localPaired || !session.remotePaired) fail("relay-session-unpaired");
      validateFrame(input.frame, session.sessionId, bounded.maximumFrameBytes);
      if ((input.from === "remote" && input.frame.direction !== "ui-to-runtime") || (input.from === "local" && input.frame.direction !== "runtime-to-ui")) fail("relay-frame-direction-invalid");
      if (current - session.rate.windowStart >= 60_000) session.rate = { windowStart: current, count: 0 };
      if (session.rate.count >= bounded.maximumFramesPerMinute) fail("relay-rate-limit");
      session.rate.count += 1;
      const stored = { from: input.from, frame: Object.freeze(structuredClone(input.frame)), expiresAt: current + bounded.reconnectTtlMs };
      session.frames.push(stored);
      const target = sockets.get(session.sessionId)?.[opposite(input.from)];
      if (target) send(target, { type: "frame", sessionId: session.sessionId, frame: stored.frame });
      return { accepted: true, counter: input.frame.counter, delivered: Boolean(target) };
    },

    replay(input) {
      authorize(input, input.to === "remote"); prune(); side(input.to);
      if (!Number.isSafeInteger(input.afterCounter) || input.afterCounter < 0) fail("relay-counter-invalid");
      const session = sessionFor(input.sessionId); const source = opposite(input.to);
      return session.frames.filter((item) => item.from === source && item.frame.counter > input.afterCounter).map((item) => item.frame);
    },

    revokeDevice(input) {
      authorize(input); prune(); token(input.deviceId, "relay-device-invalid");
      let revoked = 0;
      for (const [id, session] of sessions) if (session.deviceId === input.deviceId) {
        sendToSession(id, { type: "revoked", reason: "owner-revoked" });
        closeSockets(id, 1000, "owner-revoked"); sessions.delete(id); pairingIndex.delete(session.pairingId); revoked += 1;
      }
      return { revoked };
    },

    sessionDetails(sessionId) {
      const session = sessionFor(sessionId);
      return Object.freeze({ ...projection(session), localPublicKey: session.localPublicKey, remotePublicKey: session.remotePublicKey });
    },

    snapshot() {
      prune();
      return structuredClone({ schemaVersion: 1, limits: bounded, sessions: [...sessions.values()].map((session) => ({ ...session })) });
    },
  });

  function registerSocket(input) {
    const session = sessionFor(input.sessionId); side(input.side);
    if (!input.socket || typeof input.socket.send !== "function") fail("relay-socket-invalid");
    const current = sockets.get(session.sessionId) ?? {};
    current[input.side] = input.socket; sockets.set(session.sessionId, current);
  }
  function restore(value) {
    if (!value) return;
    if (value.schemaVersion !== 1 || !Array.isArray(value.sessions) || value.sessions.length > bounded.maximumDevices) fail("relay-state-invalid");
    for (const raw of value.sessions) {
      if (!raw || raw.sessionId === undefined || raw.deviceId === undefined || raw.pairingId === undefined) fail("relay-state-invalid");
      token(raw.deviceId, "relay-device-invalid"); token(raw.pairingId, "relay-pairing-invalid");
      const session = {
        sessionId: raw.sessionId, deviceId: raw.deviceId, pairingId: raw.pairingId, code: raw.code ?? null,
        localPublicKey: raw.localPublicKey ?? null, remotePublicKey: raw.remotePublicKey ?? null,
        localPaired: raw.localPaired === true, remotePaired: raw.remotePaired === true,
        frames: Array.isArray(raw.frames) ? raw.frames : [], rate: raw.rate ?? { windowStart: 0, count: 0 },
        createdAt: Number(raw.createdAt), expiresAt: Number(raw.expiresAt),
      };
      if (!/^rls-[A-Za-z0-9_-]{32}$/.test(session.sessionId) || !Number.isFinite(session.createdAt) || !Number.isFinite(session.expiresAt)) fail("relay-state-invalid");
      if (session.code !== null) pairingCode(session.code);
      if (session.localPublicKey !== null) session.localPublicKey = publicKey(session.localPublicKey, "relay-state-invalid");
      if (session.remotePublicKey !== null) session.remotePublicKey = publicKey(session.remotePublicKey, "relay-state-invalid");
      if (!Array.isArray(session.frames) || session.frames.length > bounded.maximumFramesPerMinute) fail("relay-state-invalid");
      for (const item of session.frames) {
        if (!item || !new Set(["local", "remote"]).has(item.from) || !Number.isFinite(Number(item.expiresAt))) fail("relay-state-invalid");
        validateFrame(item.frame, session.sessionId, bounded.maximumFrameBytes);
      }
      sessions.set(session.sessionId, session); pairingIndex.set(session.pairingId, session.sessionId);
    }
  }

  function sendToSession(sessionId, value) {
    const current = sockets.get(sessionId); if (!current) return;
    for (const socket of Object.values(current)) send(socket, value);
  }
  function closeSockets(sessionId, code, reason) {
    const current = sockets.get(sessionId); if (!current) return;
    for (const socket of Object.values(current)) closeSocket(socket, code, reason);
    sockets.delete(sessionId);
  }
}

function validateFrame(value, sessionId, maximumBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== FRAME_KEYS.size || Object.keys(value).some((key) => !FRAME_KEYS.has(key))) fail("relay-frame-invalid");
  if (value.schemaVersion !== 1 || value.sessionId !== sessionId || !new Set(["ui-to-runtime", "runtime-to-ui"]).has(value.direction) || !Number.isSafeInteger(value.counter) || value.counter < 1) fail("relay-frame-invalid");
  if (typeof value.iv !== "string" || typeof value.ciphertext !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.iv) || !/^[A-Za-z0-9_-]+$/.test(value.ciphertext)) fail("relay-frame-invalid");
  if (utf8Bytes(JSON.stringify(value)) > maximumBytes) fail("relay-frame-too-large");
}
function validateLimits(value) {
  for (const [key, minimum, maximum] of [["maximumDevices", 1, 16], ["maximumFrameBytes", 256, 131_072], ["maximumFramesPerMinute", 1, 10_000], ["sessionTtlMs", 60_000, 86_400_000], ["reconnectTtlMs", 1_000, 300_000]]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < minimum || value[key] > maximum) fail(`relay-limit-${key}`);
  }
  return Object.freeze(value);
}
function projection(value) { return Object.freeze({ sessionId: value.sessionId, deviceId: value.deviceId, pairingId: value.pairingId, paired: value.localPaired && value.remotePaired, expiresAt: new Date(value.expiresAt).toISOString() }); }
function identity(value, code) { if (typeof value !== "string" || value.length < 3 || value.length > 160 || /[\0\r\n]/.test(value)) fail(code); }
function originValue(value, code) { try { const url = new URL(value); if (url.protocol !== "https:" || url.origin !== value) fail(code); } catch { fail(code); } }
function token(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(value)) fail(code); }
function pairingCode(value) { if (typeof value !== "string" || !/^[A-Z2-9]{8}$/.test(value)) fail("relay-pairing-proof-invalid"); return value; }
function publicKey(value, code) { if (!value || typeof value !== "object" || Array.isArray(value) || value.kty !== "EC" || value.crv !== "P-256" || typeof value.x !== "string" || typeof value.y !== "string" || !/^[A-Za-z0-9_-]{20,80}$/.test(value.x) || !/^[A-Za-z0-9_-]{20,80}$/.test(value.y)) fail(code); return structuredClone(value); }
function side(value) { if (!new Set(["local", "remote"]).has(value)) fail("relay-side-invalid"); }
function opposite(value) { side(value); return value === "local" ? "remote" : "local"; }
function timestamp(now) { const value = now instanceof Date ? now.getTime() : Number(now); if (!Number.isFinite(value)) fail("relay-time-invalid"); return value; }
function randomSessionSuffix() { const bytes = new Uint8Array(24); crypto.getRandomValues(bytes); return base64Url(bytes).slice(0, 32); }
function base64Url(value) { return typeof Buffer === "function" ? Buffer.from(value).toString("base64url") : btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function utf8Bytes(value) { return typeof TextEncoder === "function" ? new TextEncoder().encode(value).byteLength : value.length; }
function send(socket, value) { try { socket.send(JSON.stringify(value)); } catch { /* a disconnected peer is pruned by the DO */ } }
function closeSocket(socket, code, reason) { try { socket.close?.(code, reason); } catch { /* close is best effort */ } }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

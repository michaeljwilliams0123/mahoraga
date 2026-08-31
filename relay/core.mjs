const FRAME_KEYS = new Set(["schemaVersion", "sessionId", "direction", "counter", "iv", "ciphertext"]);
const DEFAULT_LIMITS = Object.freeze({ maximumDevices: 3, maximumFrameBytes: 65_536, maximumFramesPerMinute: 120, sessionTtlMs: 30 * 60_000, reconnectTtlMs: 300_000 });

export function createRelayBroker({ ownerIdentity, allowedOrigin, limits = {}, now = () => Date.now() } = {}) {
  identity(ownerIdentity, "relay-owner-invalid"); originValue(allowedOrigin, "relay-origin-invalid");
  const bounded = validateLimits({ ...DEFAULT_LIMITS, ...limits });
  const sessions = new Map();
  const pairingIndex = new Map();

  const prune = () => {
    const current = timestamp(now());
    for (const [id, session] of sessions) {
      session.frames = session.frames.filter((item) => item.expiresAt > current);
      if (session.expiresAt <= current) { sessions.delete(id); pairingIndex.delete(session.pairingId); }
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
      const sessionId = `rls-${crypto.randomUUID()}`;
      const session = { sessionId, deviceId: input.deviceId, pairingId: input.pairingId, localPaired: true, remotePaired: false, frames: [], rate: { windowStart: current, count: 0 }, createdAt: current, expiresAt: current + bounded.sessionTtlMs };
      sessions.set(sessionId, session); pairingIndex.set(input.pairingId, sessionId);
      return projection(session);
    },

    pairRemote(input) {
      authorize(input, true); prune(); token(input.pairingId, "relay-pairing-invalid");
      const sessionId = pairingIndex.get(input.pairingId); if (!sessionId) fail("relay-pairing-missing");
      const session = sessionFor(sessionId); session.remotePaired = true;
      return projection(session);
    },

    forward(input) {
      authorize(input, input.from === "remote"); const current = prune(); side(input.from);
      const session = sessionFor(input.sessionId); if (!session.localPaired || !session.remotePaired) fail("relay-session-unpaired");
      validateFrame(input.frame, session.sessionId, bounded.maximumFrameBytes);
      if (current - session.rate.windowStart >= 60_000) session.rate = { windowStart: current, count: 0 };
      if (session.rate.count >= bounded.maximumFramesPerMinute) fail("relay-rate-limit");
      session.rate.count += 1;
      session.frames.push({ from: input.from, frame: Object.freeze(structuredClone(input.frame)), expiresAt: current + bounded.reconnectTtlMs });
      return { accepted: true, counter: input.frame.counter };
    },

    replay(input) {
      authorize(input, input.to === "remote"); prune(); side(input.to);
      if (!Number.isSafeInteger(input.afterCounter) || input.afterCounter < 0) fail("relay-counter-invalid");
      const session = sessionFor(input.sessionId); const source = input.to === "local" ? "remote" : "local";
      return session.frames.filter((item) => item.from === source && item.frame.counter > input.afterCounter).map((item) => item.frame);
    },

    revokeDevice(input) {
      authorize(input); prune(); token(input.deviceId, "relay-device-invalid");
      let revoked = 0;
      for (const [id, session] of sessions) if (session.deviceId === input.deviceId) { sessions.delete(id); pairingIndex.delete(session.pairingId); revoked += 1; }
      return { revoked };
    },
  });
}

function validateFrame(value, sessionId, maximumBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== FRAME_KEYS.size || Object.keys(value).some((key) => !FRAME_KEYS.has(key))) fail("relay-frame-invalid");
  if (value.schemaVersion !== 1 || value.sessionId !== sessionId || !new Set(["ui-to-runtime", "runtime-to-ui"]).has(value.direction) || !Number.isSafeInteger(value.counter) || value.counter < 1) fail("relay-frame-invalid");
  if (typeof value.iv !== "string" || typeof value.ciphertext !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.iv) || !/^[A-Za-z0-9_-]+$/.test(value.ciphertext)) fail("relay-frame-invalid");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) fail("relay-frame-too-large");
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
function side(value) { if (!new Set(["local", "remote"]).has(value)) fail("relay-side-invalid"); }
function timestamp(now) { const value = now instanceof Date ? now.getTime() : Number(now); if (!Number.isFinite(value)) fail("relay-time-invalid"); return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

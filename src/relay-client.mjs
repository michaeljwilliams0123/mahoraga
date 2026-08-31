const PROTOCOL_VERSION = "1.0.0";
const DIRECTIONS = new Set(["ui-to-runtime", "runtime-to-ui"]);
const FRAME_KEYS = new Set(["schemaVersion", "sessionId", "direction", "counter", "iv", "ciphertext"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createPairingOffer({ now = () => Date.now(), ttlMs = 300_000 } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 30_000 || ttlMs > 300_000) fail("relay-pairing-ttl-invalid");
  const createdAtMs = normalizeNow(now());
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const context = Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    pairingId: `pair-${crypto.randomUUID()}`,
    code: randomCode(),
    expiresAt: new Date(createdAtMs + ttlMs).toISOString(),
  });
  const publicOffer = Object.freeze({ schemaVersion: 1, ...context, devicePublicKey: Object.freeze(publicKey) });
  return Object.freeze({ privateKey: keys.privateKey, publicKey: Object.freeze(publicKey), publicOffer, context });
}

export async function acceptPairingOffer(offer, { now = () => Date.now() } = {}) {
  const context = validateOffer(offer, normalizeNow(now()));
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return Object.freeze({ privateKey: keys.privateKey, publicKey: Object.freeze(publicKey), peerPublicKey: offer.devicePublicKey, context });
}

export async function deriveRelaySession(privateKey, peerPublicKey, context) {
  if (!(privateKey instanceof CryptoKey) || privateKey.type !== "private") fail("relay-private-key-invalid");
  validateContext(context);
  let peer;
  try { peer = await crypto.subtle.importKey("jwk", peerPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []); }
  catch { fail("relay-public-key-invalid"); }
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const contextBytes = encoder.encode(canonicalContext(context));
  const salt = await crypto.subtle.digest("SHA-256", contextBytes);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("mahoraga-relay-frame-v1") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const sessionHash = toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", contextBytes))).slice(0, 32);
  return { sessionId: `rls-${sessionHash}`, key, sendCounter: 0, receivedCounters: new Map() };
}

export async function sealFrame(session, payload, { direction = "ui-to-runtime" } = {}) {
  validateSession(session); directionValue(direction);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength < 2 || plaintext.byteLength > 65_536) fail("relay-frame-payload-invalid");
  const counter = ++session.sendCounter;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = frameAad(session.sessionId, direction, counter);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, session.key, plaintext);
  return Object.freeze({ schemaVersion: 1, sessionId: session.sessionId, direction, counter, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) });
}

export async function openFrame(session, frame) {
  validateSession(session); validateFrame(frame);
  if (frame.sessionId !== session.sessionId) fail("relay-frame-session-mismatch");
  const last = session.receivedCounters.get(frame.direction) ?? 0;
  if (frame.counter <= last) fail("relay-counter-replay");
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(frame.iv), additionalData: frameAad(frame.sessionId, frame.direction, frame.counter), tagLength: 128 }, session.key, fromBase64Url(frame.ciphertext));
  } catch { fail("relay-frame-authentication-failed"); }
  let value;
  try { value = JSON.parse(decoder.decode(plaintext)); } catch { fail("relay-frame-payload-invalid"); }
  session.receivedCounters.set(frame.direction, frame.counter);
  return value;
}

function validateOffer(value, currentMs) {
  const keys = Object.keys(value ?? {}).sort().join(",");
  if (keys !== "code,devicePublicKey,expiresAt,pairingId,protocolVersion,schemaVersion" || value.schemaVersion !== 1) fail("relay-pairing-offer-invalid");
  const context = { protocolVersion: value.protocolVersion, pairingId: value.pairingId, code: value.code, expiresAt: value.expiresAt };
  validateContext(context);
  if (Date.parse(value.expiresAt) < currentMs) fail("relay-pairing-expired");
  if (!value.devicePublicKey || value.devicePublicKey.kty !== "EC" || value.devicePublicKey.crv !== "P-256") fail("relay-public-key-invalid");
  return Object.freeze(context);
}
function validateContext(value) {
  if (!value || value.protocolVersion !== PROTOCOL_VERSION || !/^pair-[a-f0-9-]{36}$/.test(value.pairingId) || !/^[A-Z2-9]{8}$/.test(value.code) || !Number.isFinite(Date.parse(value.expiresAt))) fail("relay-pairing-context-invalid");
}
function validateSession(value) { if (!value || !(value.key instanceof CryptoKey) || !/^rls-[A-Za-z0-9_-]{32}$/.test(value.sessionId) || !Number.isSafeInteger(value.sendCounter) || !(value.receivedCounters instanceof Map)) fail("relay-session-invalid"); }
function validateFrame(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== FRAME_KEYS.size || Object.keys(value).some((key) => !FRAME_KEYS.has(key))) fail("relay-frame-invalid");
  if (value.schemaVersion !== 1 || !/^rls-[A-Za-z0-9_-]{32}$/.test(value.sessionId)) fail("relay-frame-invalid");
  directionValue(value.direction);
  if (!Number.isSafeInteger(value.counter) || value.counter < 1 || !validBase64Url(value.iv, 12) || !validBase64Url(value.ciphertext, null, 16, 70_000)) fail("relay-frame-invalid");
}
function frameAad(sessionId, direction, counter) { return encoder.encode(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, sessionId, direction, counter })); }
function canonicalContext(value) { return JSON.stringify({ code: value.code, expiresAt: value.expiresAt, pairingId: value.pairingId, protocolVersion: value.protocolVersion }); }
function randomCode() { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = crypto.getRandomValues(new Uint8Array(8)); return [...bytes].map((value) => alphabet[value % alphabet.length]).join(""); }
function normalizeNow(value) { const result = value instanceof Date ? value.getTime() : Number(value); if (!Number.isFinite(result)) fail("relay-time-invalid"); return result; }
function directionValue(value) { if (!DIRECTIONS.has(value)) fail("relay-direction-invalid"); return value; }
function toBase64Url(value) { return Buffer.from(value).toString("base64url"); }
function fromBase64Url(value) { return Buffer.from(value, "base64url"); }
function validBase64Url(value, exact = null, minimum = 1, maximum = 100_000) { if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false; const size = fromBase64Url(value).byteLength; return exact === null ? size >= minimum && size <= maximum : size === exact; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }

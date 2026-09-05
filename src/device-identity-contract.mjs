import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

export const DEVICE_IDENTITY_ALGORITHM = "Ed25519";
export const DEVICE_TOKEN_AUDIENCE = "mahoraga-runner-task";
export const DEVICE_CHALLENGE_AUDIENCE = "mahoraga-device-challenge";

const IDENTITY_KEYS = new Set(["schemaVersion", "deviceId", "algorithm", "publicKeySpki", "createdAt", "rotatedAt", "revokedAt"]);
const CHALLENGE_KEYS = new Set(["audience", "deviceId", "nonce", "issuedAt", "expiresAt"]);
const GRANT_KEYS = new Set(["algorithm", "audience", "deviceId", "runnerId", "taskAreas", "issuedAt", "expiresAt", "replayId", "signature"]);
const REVOCATION_KEYS = new Set(["deviceId", "revokedAt", "reasonCode"]);
const DEVICE_ID = /^dev-[A-Za-z0-9][A-Za-z0-9._:/-]{7,63}$/;
const RUNNER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,63}$/;
const AREA = /^[a-z][a-z0-9.-]{0,63}$/;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const SPKI = /^-----BEGIN PUBLIC KEY-----\n(?:[A-Za-z0-9+/=\n]+)\n-----END PUBLIC KEY-----\n$/;

export class DeviceIdentityContractError extends TypeError {
  constructor(code) {
    super(code);
    this.name = "DeviceIdentityContractError";
    this.code = code;
  }
}

export function generateDeviceKeyPair() {
  const pair = generateKeyPairSync("ed25519");
  return Object.freeze({
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    publicKeySpki: pair.publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPkcs8: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
  });
}

export function createDeviceIdentity({ deviceId, publicKeySpki, now = new Date().toISOString() }) {
  return validateIdentity({
    schemaVersion: 1,
    deviceId: bounded(deviceId, 68, "device-id-invalid", DEVICE_ID),
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    publicKeySpki: publicKeyPem(publicKeySpki),
    createdAt: timestamp(now, "device-time-invalid"),
    rotatedAt: null,
    revokedAt: null,
  });
}

export function createChallenge({ deviceId, now = new Date().toISOString(), ttlSeconds = 120 }) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) fail("device-challenge-ttl-invalid");
  const issuedAt = timestamp(now, "device-time-invalid");
  return Object.freeze({
    audience: DEVICE_CHALLENGE_AUDIENCE,
    deviceId: bounded(deviceId, 68, "device-id-invalid", DEVICE_ID),
    nonce: randomBytes(32).toString("base64url"),
    issuedAt,
    expiresAt: addSeconds(issuedAt, ttlSeconds),
  });
}

export function verifyChallengeSignature({ identity, challenge, signature, now = new Date().toISOString() }) {
  const device = requireActive(identity);
  exact(challenge, CHALLENGE_KEYS, "device-challenge");
  if (challenge.audience !== DEVICE_CHALLENGE_AUDIENCE) fail("device-audience-invalid");
  if (challenge.deviceId !== device.deviceId) fail("device-challenge-device-mismatch");
  if (Date.parse(challenge.expiresAt) <= Date.parse(timestamp(now, "device-time-invalid"))) fail("device-challenge-expired");
  if (Date.parse(challenge.issuedAt) > Date.parse(now)) fail("device-challenge-not-yet-valid");
  if (!verifyEd25519(device.publicKeySpki, canonical(challenge), signature)) fail("device-challenge-signature-invalid");
  return Object.freeze({ deviceId: device.deviceId, nonce: challenge.nonce });
}

export function issueTaskGrant({ identity, signer, runnerId, taskAreas, now = new Date().toISOString(), ttlSeconds = 900 }) {
  const device = requireActive(identity);
  if (typeof signer !== "function") fail("device-signer-unbound");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) fail("device-grant-ttl-invalid");
  const issuedAt = timestamp(now, "device-time-invalid");
  const body = {
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    audience: DEVICE_TOKEN_AUDIENCE,
    deviceId: device.deviceId,
    runnerId: bounded(runnerId, 64, "device-runner-id-invalid", RUNNER_ID),
    taskAreas: normalizeAreas(taskAreas),
    issuedAt,
    expiresAt: addSeconds(issuedAt, ttlSeconds),
    replayId: randomBytes(16).toString("hex"),
  };
  return validateGrant({ ...body, signature: signer(canonical(body)) });
}

export function verifyTaskGrant({
  grant,
  identity,
  runnerId,
  taskArea,
  audience = DEVICE_TOKEN_AUDIENCE,
  now = new Date().toISOString(),
  seenReplayIds = [],
  revocation = null,
}) {
  const device = requireActive(identity);
  const token = validateGrant(grant);
  if (token.algorithm !== DEVICE_IDENTITY_ALGORITHM) fail("device-algorithm-confusion");
  if (token.audience !== audience || audience !== DEVICE_TOKEN_AUDIENCE) fail("device-audience-invalid");
  if (token.deviceId !== device.deviceId) fail("device-grant-device-mismatch");
  if (token.runnerId !== runnerId) fail("device-grant-runner-mismatch");
  if (!token.taskAreas.includes(taskArea)) fail("device-grant-scope-widened");
  if (Date.parse(token.expiresAt) <= Date.parse(timestamp(now, "device-time-invalid"))) fail("device-grant-expired");
  if (seenReplayIds.includes(token.replayId)) fail("device-grant-replay");
  if (revocation) {
    const record = validateRevocation(revocation);
    if (record.deviceId === device.deviceId) fail("device-revoked");
  }
  const body = { ...token };
  delete body.signature;
  if (!verifyEd25519(device.publicKeySpki, canonical(body), token.signature)) fail("device-grant-signature-invalid");
  return Object.freeze({ deviceId: token.deviceId, runnerId: token.runnerId, taskArea, replayId: token.replayId });
}

export function rotateDevice({ identity, nextPublicKeySpki, signer, now = new Date().toISOString() }) {
  const device = requireActive(identity);
  if (typeof signer !== "function") fail("device-signer-unbound");
  const nextKey = publicKeyPem(nextPublicKeySpki);
  if (nextKey === device.publicKeySpki) fail("device-rotation-unchanged");
  const proof = {
    audience: "mahoraga-device-rotate",
    deviceId: device.deviceId,
    previousKeyDigest: digest(device.publicKeySpki),
    nextPublicKeySpki: nextKey,
    issuedAt: timestamp(now, "device-time-invalid"),
  };
  if (!verifyEd25519(device.publicKeySpki, canonical(proof), signer(canonical(proof)))) fail("device-rotation-signature-invalid");
  return validateIdentity({ ...device, publicKeySpki: nextKey, rotatedAt: proof.issuedAt });
}

export function revokeDevice({ identity, now = new Date().toISOString(), reasonCode = "owner.revoked" }) {
  const device = validateIdentity(identity);
  return Object.freeze({
    identity: validateIdentity({ ...device, revokedAt: timestamp(now, "device-time-invalid") }),
    revocation: validateRevocation({
      deviceId: device.deviceId,
      revokedAt: timestamp(now, "device-time-invalid"),
      reasonCode: bounded(reasonCode, 64, "device-revocation-reason-invalid", /^[a-z][a-z0-9.-]*$/),
    }),
  });
}

export function createMemorySigner(privateKeyPkcs8) {
  const key = createPrivateKey(privateKeyPkcs8);
  if (key.asymmetricKeyType !== "ed25519") fail("device-algorithm-confusion");
  return (payload) => sign(null, Buffer.from(payload), key).toString("base64url");
}

export function windowsKeyStorageAdapter() {
  return Object.freeze({
    platform: "windows",
    bound: false,
    sign() {
      fail("device-windows-adapter-unbound");
    },
    load() {
      fail("device-windows-adapter-unbound");
    },
  });
}

export function validateIdentity(record) {
  exact(record, IDENTITY_KEYS, "device-identity");
  if (record.schemaVersion !== 1) fail("device-schema-invalid");
  if (record.algorithm !== DEVICE_IDENTITY_ALGORITHM) fail("device-algorithm-confusion");
  return Object.freeze({
    schemaVersion: 1,
    deviceId: bounded(record.deviceId, 68, "device-id-invalid", DEVICE_ID),
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    publicKeySpki: publicKeyPem(record.publicKeySpki),
    createdAt: timestamp(record.createdAt, "device-time-invalid"),
    rotatedAt: record.rotatedAt === null ? null : timestamp(record.rotatedAt, "device-time-invalid"),
    revokedAt: record.revokedAt === null ? null : timestamp(record.revokedAt, "device-time-invalid"),
  });
}

function requireActive(record) {
  const identity = validateIdentity(record);
  if (identity.revokedAt) fail("device-revoked");
  return identity;
}

function validateGrant(record) {
  exact(record, GRANT_KEYS, "device-grant");
  if (record.algorithm !== DEVICE_IDENTITY_ALGORITHM) fail("device-algorithm-confusion");
  if (record.audience !== DEVICE_TOKEN_AUDIENCE) fail("device-audience-invalid");
  return Object.freeze({
    algorithm: DEVICE_IDENTITY_ALGORITHM,
    audience: DEVICE_TOKEN_AUDIENCE,
    deviceId: bounded(record.deviceId, 68, "device-id-invalid", DEVICE_ID),
    runnerId: bounded(record.runnerId, 64, "device-runner-id-invalid", RUNNER_ID),
    taskAreas: normalizeAreas(record.taskAreas),
    issuedAt: timestamp(record.issuedAt, "device-time-invalid"),
    expiresAt: timestamp(record.expiresAt, "device-grant-expiry-invalid"),
    replayId: bounded(record.replayId, 64, "device-replay-id-invalid", /^[a-f0-9]{32}$/),
    signature: bounded(record.signature, 128, "device-signature-invalid", TOKEN),
  });
}

function validateRevocation(record) {
  exact(record, REVOCATION_KEYS, "device-revocation");
  return Object.freeze({
    deviceId: bounded(record.deviceId, 68, "device-id-invalid", DEVICE_ID),
    revokedAt: timestamp(record.revokedAt, "device-time-invalid"),
    reasonCode: bounded(record.reasonCode, 64, "device-revocation-reason-invalid", /^[a-z][a-z0-9.-]*$/),
  });
}

function normalizeAreas(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) fail("device-task-areas-invalid");
  const areas = [...new Set(value.map((item) => bounded(item, 64, "device-task-area-invalid", AREA)))].sort();
  if (areas.length !== value.length) fail("device-task-areas-invalid");
  return Object.freeze(areas);
}

function publicKeyPem(value) {
  if (typeof value !== "string" || !SPKI.test(value)) fail("device-public-key-invalid");
  const key = createPublicKey(value);
  if (key.asymmetricKeyType !== "ed25519") fail("device-algorithm-confusion");
  return key.export({ type: "spki", format: "pem" });
}

function verifyEd25519(publicKeySpki, payload, signature) {
  if (typeof signature !== "string" || !TOKEN.test(signature)) return false;
  try {
    return verify(null, Buffer.from(payload), createPublicKey(publicKeySpki), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

function canonical(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

function bounded(value, max, code, pattern) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !pattern.test(value)) fail(code);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function addSeconds(value, seconds) {
  return new Date(Date.parse(value) + seconds * 1000).toISOString();
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}-invalid`);
  const actual = Object.keys(value);
  if (actual.length !== keys.size || actual.some((key) => !keys.has(key))) fail(`${label}-field-not-allowed`);
}

function fail(code) {
  throw new DeviceIdentityContractError(code);
}

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  DEVICE_IDENTITY_ALGORITHM,
  DEVICE_TOKEN_AUDIENCE,
  createChallenge,
  createDeviceIdentity,
  createMemorySigner,
  generateDeviceKeyPair,
  issueTaskGrant,
  revokeDevice,
  rotateDevice,
  verifyChallengeSignature,
  verifyTaskGrant,
  windowsKeyStorageAdapter,
} from "../src/device-identity-contract.mjs";

const T0 = "2026-09-05T05:00:00.000Z";
const T1 = "2026-09-05T05:10:00.000Z";
const T2 = "2026-09-05T06:00:00.000Z";

function device(now = T0) {
  const keys = generateDeviceKeyPair();
  const identity = createDeviceIdentity({ deviceId: "dev-runner-alpha-01", publicKeySpki: keys.publicKeySpki, now });
  return { keys, identity, signer: createMemorySigner(keys.privateKeyPkcs8) };
}

test("device identity is Ed25519 and never stores a shared secret", () => {
  const { identity, keys } = device();
  assert.equal(identity.algorithm, DEVICE_IDENTITY_ALGORITHM);
  assert.match(identity.publicKeySpki, /BEGIN PUBLIC KEY/);
  assert.equal(Object.hasOwn(identity, "privateKeyPkcs8"), false);
  assert.equal(Object.hasOwn(identity, "sharedSecret"), false);
  assert.match(keys.privateKeyPkcs8, /BEGIN PRIVATE KEY/);
});

test("challenge signatures bind device, audience, nonce, and expiry", () => {
  const { identity, signer } = device();
  const challenge = createChallenge({ deviceId: identity.deviceId, now: T0, ttlSeconds: 120 });
  const ok = verifyChallengeSignature({ identity, challenge, signature: signer(JSON.stringify(sort(challenge))), now: T0 });
  assert.equal(ok.deviceId, identity.deviceId);
  assert.throws(() => verifyChallengeSignature({ identity, challenge, signature: signer(JSON.stringify(sort(challenge))), now: T1 }), /device-challenge-expired/);
});

test("task grants bind runner, task area, audience, expiry, and unique replay ids", () => {
  const { identity, signer } = device();
  const grant = issueTaskGrant({ identity, signer: (payload) => signer(payload), runnerId: "runner-a", taskAreas: ["repository.verify"], now: T0, ttlSeconds: 900 });
  const accepted = verifyTaskGrant({ grant, identity, runnerId: "runner-a", taskArea: "repository.verify", now: T0, seenReplayIds: [] });
  assert.equal(accepted.runnerId, "runner-a");
  assert.throws(() => verifyTaskGrant({ grant, identity, runnerId: "runner-a", taskArea: "repository.verify", now: T0, seenReplayIds: [grant.replayId] }), /device-grant-replay/);
  assert.throws(() => verifyTaskGrant({ grant, identity, runnerId: "runner-a", taskArea: "desktop.control", now: T0 }), /device-grant-scope-widened/);
  assert.throws(() => verifyTaskGrant({ grant, identity, runnerId: "runner-b", taskArea: "repository.verify", now: T0 }), /device-grant-runner-mismatch/);
  assert.throws(() => verifyTaskGrant({ grant: { ...grant, audience: "other-audience", signature: grant.signature }, identity, runnerId: "runner-a", taskArea: "repository.verify", now: T0 }), /device-audience-invalid|device-grant-field-not-allowed/);
  assert.throws(() => verifyTaskGrant({ grant, identity, runnerId: "runner-a", taskArea: "repository.verify", now: T2 }), /device-grant-expired/);
});

test("algorithm confusion, rotation, and revocation fail closed", () => {
  const { identity, signer } = device();
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(() => createDeviceIdentity({ deviceId: "dev-runner-alpha-01", publicKeySpki: rsa.publicKey.export({ type: "spki", format: "pem" }), now: T0 }), /device-algorithm-confusion|device-public-key-invalid/);

  const next = generateDeviceKeyPair();
  const rotated = rotateDevice({
    identity,
    nextPublicKeySpki: next.publicKeySpki,
    signer: (payload) => signer(payload),
    now: T0,
  });
  assert.equal(rotated.publicKeySpki, next.publicKeySpki);
  const nextSigner = createMemorySigner(next.privateKeyPkcs8);
  const grant = issueTaskGrant({ identity: rotated, signer: (payload) => nextSigner(payload), runnerId: "runner-a", taskAreas: ["repository.verify"], now: T0 });
  assert.equal(verifyTaskGrant({ grant, identity: rotated, runnerId: "runner-a", taskArea: "repository.verify", now: T0 }).deviceId, identity.deviceId);

  const revoked = revokeDevice({ identity: rotated, now: T1, reasonCode: "owner.revoked" });
  assert.throws(() => issueTaskGrant({ identity: revoked.identity, signer: (payload) => nextSigner(payload), runnerId: "runner-a", taskAreas: ["repository.verify"], now: T1 }), /device-revoked/);
  assert.throws(() => verifyTaskGrant({ grant, identity: rotated, runnerId: "runner-a", taskArea: "repository.verify", now: T0, revocation: revoked.revocation }), /device-revoked/);
});

test("Windows key storage stays an unbound abstract adapter", () => {
  const adapter = windowsKeyStorageAdapter();
  assert.equal(adapter.bound, false);
  assert.equal(adapter.platform, "windows");
  assert.throws(() => adapter.sign("payload"), /device-windows-adapter-unbound/);
  assert.throws(() => adapter.load(), /device-windows-adapter-unbound/);
});

test("issued grants declare the runner-task audience", () => {
  const { identity, signer } = device();
  const grant = issueTaskGrant({ identity, signer: (payload) => signer(payload), runnerId: "runner-a", taskAreas: ["repository.verify"], now: T0 });
  assert.equal(grant.audience, DEVICE_TOKEN_AUDIENCE);
});

function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  return value;
}

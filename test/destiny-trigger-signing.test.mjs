import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  evaluateDestinyTriggerReadiness,
  fingerprintPublicKeySpki,
  validateDestinyTriggerReceipt,
  validateDestinyTriggerTrustManifest,
} from "../src/destiny-trigger-trust.mjs";
import { signDestinyTriggerEvidence } from "../src/destiny-trigger-signing.mjs";

const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const keyId = "destiny-event-dispatch-v1";

function setup() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeySpki = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPkcs8 = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyFingerprint = fingerprintPublicKeySpki(publicKeySpki);
  const manifest = validateDestinyTriggerTrustManifest({
    schemaVersion: 1,
    triggerId: keyId,
    repository,
    owner,
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust: { mode: "signed-receipt", algorithm: "ed25519", publicKeyFingerprint, keyId },
  });
  return { manifest, publicKeySpki, privateKeyPkcs8, publicKeyFingerprint };
}

test("signed readiness produced by the Destiny key passes the existing trust verifier", () => {
  const { manifest, publicKeySpki, privateKeyPkcs8, publicKeyFingerprint } = setup();
  const signed = signDestinyTriggerEvidence({
    schemaVersion: 1,
    triggerId: keyId,
    repository,
    status: "ready",
    observedAt: "2026-09-07T04:40:00.000Z",
    zeroCreditEligible: true,
    codexTaskReference: "cd_6a95f5f4bc5481918ad74b3f028609d2",
  }, { privateKeyPkcs8, publicKeySpki, keyId });

  assert.equal(signed.actorLogin, keyId);
  assert.equal(signed.publicKeyFingerprint, publicKeyFingerprint);
  assert.match(signed.signature, /^[A-Za-z0-9_-]{80,128}$/);
  const readiness = evaluateDestinyTriggerReadiness(manifest, signed, { now: "2026-09-07T04:42:00.000Z" });
  assert.equal(readiness.ready, true);
});

test("signed ACK produced by the Destiny key passes receipt validation", () => {
  const { manifest, publicKeySpki, privateKeyPkcs8 } = setup();
  const signed = signDestinyTriggerEvidence({
    schemaVersion: 1,
    kind: "acked",
    repository,
    pullRequest: 181,
    dispatchId: "dcx-0123456789abcdef01234567",
    requestSha256: "b".repeat(64),
    headSha: "a".repeat(40),
    deliveryId: "cd_6a95f5f4bc5481918ad74b3f028609d2",
    status: "acked",
    observedAt: "2026-09-07T04:40:10.000Z",
  }, { privateKeyPkcs8, publicKeySpki, keyId });

  assert.equal(validateDestinyTriggerReceipt(manifest, signed).kind, "acked");
});

test("signing fails closed for a mismatched keypair or preclaimed signing identity", () => {
  const first = setup();
  const second = setup();
  assert.throws(() => signDestinyTriggerEvidence({ schemaVersion: 1 }, {
    privateKeyPkcs8: first.privateKeyPkcs8,
    publicKeySpki: second.publicKeySpki,
    keyId,
  }), /destiny-trigger-signing-key-mismatch/);
  assert.throws(() => signDestinyTriggerEvidence({ schemaVersion: 1, actorLogin: "spoof" }, {
    privateKeyPkcs8: first.privateKeyPkcs8,
    publicKeySpki: first.publicKeySpki,
    keyId,
  }), /destiny-trigger-signing-identity-conflict/);
});

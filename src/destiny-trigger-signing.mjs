import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { fingerprintPublicKeySpki } from "./destiny-trigger-trust.mjs";

const KEY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

function canonicalWithoutSignature(value) {
  const { signature: _signature, ...rest } = value;
  void _signature;
  return JSON.stringify(sortValue(rest));
}

function requireEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("destiny-trigger-signing-evidence-invalid");
  return value;
}

function assertNoIdentityConflict(evidence, keyId, publicKeySpki, publicKeyFingerprint) {
  if (evidence.signature != null) throw new TypeError("destiny-trigger-signing-signature-present");
  if (evidence.actorLogin != null && evidence.actorLogin !== keyId) throw new TypeError("destiny-trigger-signing-identity-conflict");
  if (evidence.publicKeyFingerprint != null && evidence.publicKeyFingerprint !== publicKeyFingerprint) {
    throw new TypeError("destiny-trigger-signing-identity-conflict");
  }
  if (evidence.publicKeySpki != null && evidence.publicKeySpki !== publicKeySpki) {
    throw new TypeError("destiny-trigger-signing-identity-conflict");
  }
}

export function signDestinyTriggerEvidence(evidenceInput, {
  privateKeyPkcs8,
  publicKeySpki,
  keyId = "destiny-event-dispatch-v1",
} = {}) {
  const evidence = requireEvidence(evidenceInput);
  if (typeof keyId !== "string" || !KEY_ID.test(keyId)) throw new TypeError("destiny-trigger-signing-key-id-invalid");
  if (typeof privateKeyPkcs8 !== "string" || privateKeyPkcs8.length < 1) throw new TypeError("destiny-trigger-signing-private-key-invalid");
  if (typeof publicKeySpki !== "string" || publicKeySpki.length < 1) throw new TypeError("destiny-trigger-signing-public-key-invalid");

  let privateKey;
  let suppliedPublicKey;
  try {
    privateKey = createPrivateKey(privateKeyPkcs8);
    suppliedPublicKey = createPublicKey(publicKeySpki);
  } catch {
    throw new TypeError("destiny-trigger-signing-key-invalid");
  }
  if (privateKey.asymmetricKeyType !== "ed25519" || suppliedPublicKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("destiny-trigger-signing-algorithm-confusion");
  }

  const derivedPublicKeySpki = createPublicKey(privateKey).export({ type: "spki", format: "pem" });
  const suppliedFingerprint = fingerprintPublicKeySpki(publicKeySpki);
  if (fingerprintPublicKeySpki(derivedPublicKeySpki) !== suppliedFingerprint) {
    throw new TypeError("destiny-trigger-signing-key-mismatch");
  }

  assertNoIdentityConflict(evidence, keyId, publicKeySpki, suppliedFingerprint);
  const unsigned = {
    ...evidence,
    actorLogin: keyId,
    publicKeyFingerprint: suppliedFingerprint,
    publicKeySpki,
  };
  const signature = sign(null, Buffer.from(canonicalWithoutSignature(unsigned)), privateKey).toString("base64url");
  return Object.freeze({ ...unsigned, signature });
}

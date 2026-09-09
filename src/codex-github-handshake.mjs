import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

const INSTANCE_ID = /^codex-[a-f0-9]{20}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9 _.:-]{2,79}$/;
const GITHUB_ACTOR = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const AUTHORITY_PROFILE = "equal-primary-controller-v1";
const REGISTRATION_KEYS = ["authorityProfile", "createdAt", "githubActor", "instanceId", "kind", "label", "proof", "publicKey", "publicKeyFingerprint", "repository", "schemaVersion"];
const HANDSHAKE_KEYS = ["authorityProfile", "baseCommit", "createdAt", "instanceId", "kind", "nonce", "proof", "registrationSha256", "repository", "schemaVersion"];
const PROOF_KEYS = ["algorithm", "signature"];
const RECORD_KEYS = ["handshake", "registration"];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExactObject(value, expectedKeys, reason) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(reason);
  const actual = Object.keys(value).sort();
  if (actual.length !== expectedKeys.length || actual.some((key, index) => key !== expectedKeys[index])) throw new TypeError(reason);
}

function signatureBytes(proof, reason) {
  assertExactObject(proof, PROOF_KEYS, reason);
  if (proof.algorithm !== "ed25519" || typeof proof.signature !== "string") throw new TypeError(reason);
  const bytes = Buffer.from(proof.signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== proof.signature) throw new TypeError(reason);
  return bytes;
}

function unsignedRegistration(value) {
  const { proof, ...registration } = value;
  return registration;
}

export function createCodexIdentity({ label, repository, githubActor, createdAt = new Date().toISOString() }) {
  if (typeof label !== "string" || !LABEL.test(label)) throw new TypeError("codex-identity-label-invalid");
  if (!REPOSITORY.test(repository ?? "")) throw new TypeError("codex-identity-repository-invalid");
  if (typeof githubActor !== "string" || !GITHUB_ACTOR.test(githubActor)) throw new TypeError("codex-identity-github-actor-invalid");
  if (!Number.isFinite(Date.parse(createdAt))) throw new TypeError("codex-identity-time-invalid");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicKeyFingerprint = digest(publicKey.export({ type: "spki", format: "der" }));
  const registration = {
    schemaVersion: 1,
    kind: "codex-github-identity",
    instanceId: `codex-${publicKeyFingerprint.slice(0, 20)}`,
    label,
    repository,
    githubActor,
    authorityProfile: AUTHORITY_PROFILE,
    publicKeyFingerprint,
    publicKey: publicKeyPem,
    createdAt,
  };
  const signature = sign(null, Buffer.from(canonical(registration)), privateKey).toString("base64");
  return {
    registration: Object.freeze({ ...registration, proof: { algorithm: "ed25519", signature } }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

export function createRepositoryHandshake({ registration, privateKey, baseCommit, nonce = randomBytes(16).toString("hex"), createdAt = new Date().toISOString() }) {
  verifyCodexIdentity(registration);
  if (!SHA.test(baseCommit ?? "")) throw new TypeError("codex-handshake-base-commit-invalid");
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new TypeError("codex-handshake-nonce-invalid");
  if (!Number.isFinite(Date.parse(createdAt))) throw new TypeError("codex-handshake-time-invalid");
  const payload = {
    schemaVersion: 1,
    kind: "codex-github-handshake",
    instanceId: registration.instanceId,
    repository: registration.repository,
    authorityProfile: AUTHORITY_PROFILE,
    registrationSha256: digest(canonical(registration)),
    baseCommit,
    nonce,
    createdAt,
  };
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") throw new TypeError("codex-handshake-key-type-invalid");
  const derivedPublic = createPublicKey(key).export({ type: "spki", format: "der" });
  if (digest(derivedPublic) !== registration.publicKeyFingerprint) throw new TypeError("codex-handshake-key-mismatch");
  return Object.freeze({ ...payload, proof: { algorithm: "ed25519", signature: sign(null, Buffer.from(canonical(payload)), key).toString("base64") } });
}

export function verifyCodexIdentity(registration) {
  assertExactObject(registration, REGISTRATION_KEYS, "codex-identity-schema-invalid");
  if (registration.schemaVersion !== 1 || registration.kind !== "codex-github-identity") throw new TypeError("codex-identity-invalid");
  if (!INSTANCE_ID.test(registration.instanceId ?? "") || registration.authorityProfile !== AUTHORITY_PROFILE || !REPOSITORY.test(registration.repository ?? "")) throw new TypeError("codex-identity-invalid");
  if (typeof registration.label !== "string" || !LABEL.test(registration.label) || typeof registration.githubActor !== "string" || !GITHUB_ACTOR.test(registration.githubActor)) throw new TypeError("codex-identity-invalid");
  if (!Number.isFinite(Date.parse(registration.createdAt)) || !SHA256.test(registration.publicKeyFingerprint ?? "") || typeof registration.publicKey !== "string") throw new TypeError("codex-identity-invalid");
  const signature = signatureBytes(registration.proof, "codex-identity-proof-invalid");
  const key = createPublicKey(registration.publicKey);
  if (key.asymmetricKeyType !== "ed25519") throw new TypeError("codex-identity-key-type-invalid");
  const fingerprint = digest(key.export({ type: "spki", format: "der" }));
  if (fingerprint !== registration.publicKeyFingerprint || registration.instanceId !== `codex-${fingerprint.slice(0, 20)}`) throw new TypeError("codex-identity-fingerprint-invalid");
  if (!verify(null, Buffer.from(canonical(unsignedRegistration(registration))), key, signature)) throw new TypeError("codex-identity-signature-invalid");
  return true;
}

export function verifyRepositoryHandshake(registration, handshake) {
  verifyCodexIdentity(registration);
  assertExactObject(handshake, HANDSHAKE_KEYS, "codex-handshake-schema-invalid");
  const { proof, ...payload } = handshake;
  if (payload.schemaVersion !== 1 || payload.kind !== "codex-github-handshake" || payload.instanceId !== registration.instanceId || payload.repository !== registration.repository || payload.authorityProfile !== AUTHORITY_PROFILE || !SHA.test(payload.baseCommit ?? "") || !/^[a-f0-9]{32}$/.test(payload.nonce ?? "")) throw new TypeError("codex-handshake-invalid");
  if (!SHA256.test(payload.registrationSha256 ?? "") || !Number.isFinite(Date.parse(payload.createdAt)) || payload.registrationSha256 !== digest(canonical(registration))) throw new TypeError("codex-handshake-invalid");
  const signature = signatureBytes(proof, "codex-handshake-proof-invalid");
  if (!verify(null, Buffer.from(canonical(payload)), createPublicKey(registration.publicKey), signature)) throw new TypeError("codex-handshake-signature-invalid");
  return true;
}

export function verifyCodexHandshakeRecord(record, { expectedRepository } = {}) {
  assertExactObject(record, RECORD_KEYS, "codex-handshake-record-schema-invalid");
  verifyCodexIdentity(record.registration);
  verifyRepositoryHandshake(record.registration, record.handshake);
  if (expectedRepository != null && record.registration.repository !== expectedRepository) throw new TypeError("codex-handshake-repository-mismatch");
  return true;
}

export function assertDistinctCodexIdentities(left, right) {
  verifyCodexIdentity(left);
  verifyCodexIdentity(right);
  if (left.instanceId === right.instanceId || left.publicKeyFingerprint === right.publicKeyFingerprint) throw new TypeError("codex-identities-not-distinct");
  return true;
}

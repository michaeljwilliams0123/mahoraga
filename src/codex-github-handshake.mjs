import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";

const INSTANCE_ID = /^codex-[a-f0-9]{20}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const AUTHORITY_PROFILE = "equal-primary-controller-v1";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unsignedRegistration(value) {
  const { proof, ...registration } = value;
  return registration;
}

export function createCodexIdentity({ label, repository, githubActor, createdAt = new Date().toISOString() }) {
  if (typeof label !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 _.:-]{2,79}$/.test(label)) throw new TypeError("codex-identity-label-invalid");
  if (!REPOSITORY.test(repository ?? "")) throw new TypeError("codex-identity-repository-invalid");
  if (typeof githubActor !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(githubActor)) throw new TypeError("codex-identity-github-actor-invalid");
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
  const derivedPublic = createPublicKey(key).export({ type: "spki", format: "der" });
  if (digest(derivedPublic) !== registration.publicKeyFingerprint) throw new TypeError("codex-handshake-key-mismatch");
  return Object.freeze({ ...payload, proof: { algorithm: "ed25519", signature: sign(null, Buffer.from(canonical(payload)), key).toString("base64") } });
}

export function verifyCodexIdentity(registration) {
  if (!registration || registration.schemaVersion !== 1 || registration.kind !== "codex-github-identity") throw new TypeError("codex-identity-invalid");
  if (!INSTANCE_ID.test(registration.instanceId ?? "") || registration.authorityProfile !== AUTHORITY_PROFILE || !REPOSITORY.test(registration.repository ?? "")) throw new TypeError("codex-identity-invalid");
  const key = createPublicKey(registration.publicKey);
  const fingerprint = digest(key.export({ type: "spki", format: "der" }));
  if (fingerprint !== registration.publicKeyFingerprint || registration.instanceId !== `codex-${fingerprint.slice(0, 20)}`) throw new TypeError("codex-identity-fingerprint-invalid");
  if (registration.proof?.algorithm !== "ed25519" || !verify(null, Buffer.from(canonical(unsignedRegistration(registration))), key, Buffer.from(registration.proof.signature ?? "", "base64"))) throw new TypeError("codex-identity-signature-invalid");
  return true;
}

export function verifyRepositoryHandshake(registration, handshake) {
  verifyCodexIdentity(registration);
  const { proof, ...payload } = handshake ?? {};
  if (payload.schemaVersion !== 1 || payload.kind !== "codex-github-handshake" || payload.instanceId !== registration.instanceId || payload.repository !== registration.repository || payload.authorityProfile !== AUTHORITY_PROFILE || !SHA.test(payload.baseCommit ?? "") || !/^[a-f0-9]{32}$/.test(payload.nonce ?? "")) throw new TypeError("codex-handshake-invalid");
  if (payload.registrationSha256 !== digest(canonical(registration)) || proof?.algorithm !== "ed25519") throw new TypeError("codex-handshake-invalid");
  if (!verify(null, Buffer.from(canonical(payload)), createPublicKey(registration.publicKey), Buffer.from(proof.signature ?? "", "base64"))) throw new TypeError("codex-handshake-signature-invalid");
  return true;
}

export function assertDistinctCodexIdentities(left, right) {
  verifyCodexIdentity(left);
  verifyCodexIdentity(right);
  if (left.instanceId === right.instanceId || left.publicKeyFingerprint === right.publicKeyFingerprint) throw new TypeError("codex-identities-not-distinct");
  return true;
}

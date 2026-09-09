import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createCodexIdentity, createRepositoryHandshake, verifyCodexIdentity, verifyRepositoryHandshake, verifyCodexHandshakeRecord, assertDistinctCodexIdentities } from "../src/codex-github-handshake.mjs";

const input = { label: "Workspace Codex Primary", repository: "michaeljwilliams0123/mahoraga", githubActor: "michaeljwilliams0123", createdAt: "2026-09-09T00:00:00.000Z" };

function record() {
  const identity = createCodexIdentity(input);
  const handshake = createRepositoryHandshake({ registration: identity.registration, privateKey: identity.privateKey, baseCommit: "a".repeat(40), nonce: "b".repeat(32), createdAt: input.createdAt });
  return { registration: identity.registration, handshake };
}

test("self-signed identity and repository handshake bind a unique equal-primary controller", () => {
  const value = record();
  assert.equal(verifyCodexIdentity(value.registration), true);
  assert.equal(verifyRepositoryHandshake(value.registration, value.handshake), true);
  assert.equal(verifyCodexHandshakeRecord(value, { expectedRepository: input.repository }), true);
  assert.equal(value.registration.authorityProfile, "equal-primary-controller-v1");
});

test("separate Codex keys remain identifiable despite a shared GitHub actor", () => {
  const first = createCodexIdentity(input).registration;
  const second = createCodexIdentity({ ...input, label: "Michael Codex Primary" }).registration;
  assert.equal(first.githubActor, second.githubActor);
  assert.equal(assertDistinctCodexIdentities(first, second), true);
});

test("tampering with the repository binding is rejected", () => {
  const value = record();
  assert.throws(() => verifyRepositoryHandshake(value.registration, { ...value.handshake, repository: "other/repo" }), /handshake-invalid/);
  assert.throws(() => verifyCodexHandshakeRecord(value, { expectedRepository: "other/repo" }), /repository-mismatch/);
});

test("unknown fields cannot smuggle private identity material", () => {
  const value = record();
  assert.throws(() => verifyCodexIdentity({ ...value.registration, proof: { ...value.registration.proof, privateKey: "secret" } }), /proof-invalid/);
  assert.throws(() => verifyRepositoryHandshake(value.registration, { ...value.handshake, proof: { ...value.handshake.proof, privateKey: "secret" } }), /proof-invalid/);
  assert.throws(() => verifyCodexHandshakeRecord({ ...value, privateKey: "secret" }), /record-schema-invalid/);
});

test("proofs must use an actual Ed25519 key", () => {
  const value = record();
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(() => verifyCodexIdentity({ ...value.registration, publicKey: publicKey.export({ type: "spki", format: "pem" }) }), /key-type-invalid/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createCodexIdentity, createRepositoryHandshake, verifyCodexIdentity, verifyRepositoryHandshake, assertDistinctCodexIdentities } from "../src/codex-github-handshake.mjs";

const input = { label: "Workspace Codex Primary", repository: "michaeljwilliams0123/mahoraga", githubActor: "michaeljwilliams0123", createdAt: "2026-09-09T00:00:00.000Z" };

test("self-signed identity and repository handshake bind a unique equal-primary controller", () => {
  const identity = createCodexIdentity(input);
  const handshake = createRepositoryHandshake({ registration: identity.registration, privateKey: identity.privateKey, baseCommit: "a".repeat(40), nonce: "b".repeat(32), createdAt: input.createdAt });
  assert.equal(verifyCodexIdentity(identity.registration), true);
  assert.equal(verifyRepositoryHandshake(identity.registration, handshake), true);
  assert.equal(identity.registration.authorityProfile, "equal-primary-controller-v1");
});

test("separate Codex keys remain identifiable despite a shared GitHub actor", () => {
  const first = createCodexIdentity(input).registration;
  const second = createCodexIdentity({ ...input, label: "Michael Codex Primary" }).registration;
  assert.equal(first.githubActor, second.githubActor);
  assert.equal(assertDistinctCodexIdentities(first, second), true);
});

test("tampering with the repository binding is rejected", () => {
  const identity = createCodexIdentity(input);
  const handshake = createRepositoryHandshake({ registration: identity.registration, privateKey: identity.privateKey, baseCommit: "a".repeat(40), nonce: "b".repeat(32), createdAt: input.createdAt });
  assert.throws(() => verifyRepositoryHandshake(identity.registration, { ...handshake, repository: "other/repo" }), /handshake-invalid/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { observeGithubTransportIdentity, transportMatchesGithubApp, validateGithubTransportIdentity } from "../src/github-transport-observation.mjs";

function sample(overrides = {}) {
  return {
    eventName: "pull_request",
    action: "opened",
    repository: "michaeljwilliams0123/mahoraga",
    repositoryId: 101,
    senderLogin: "michaeljwilliams0123",
    senderId: 7,
    githubAppSlug: "chatgpt-codex-connector",
    githubAppId: 1144995,
    installationId: 8080,
    pullRequest: 244,
    issueNumber: null,
    deliveryId: "delivery-1",
    ...overrides,
  };
}

test("transport observation fingerprints bounded GitHub metadata deterministically", () => {
  const first = observeGithubTransportIdentity(sample());
  const second = observeGithubTransportIdentity(sample());
  assert.deepEqual(second, first);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(validateGithubTransportIdentity(first).fingerprint, first.fingerprint);
});

test("transport observation stays supplemental and never accepts malformed payloads", () => {
  const observed = observeGithubTransportIdentity(sample({ deliveryId: "delivery-2" }));
  assert.equal(transportMatchesGithubApp(observed, { githubAppSlug: "chatgpt-codex-connector", githubAppId: 1144995 }), true);
  assert.equal(transportMatchesGithubApp(observed, { githubAppSlug: "different", githubAppId: 1144995 }), false);
  assert.throws(() => observeGithubTransportIdentity(sample({ senderLogin: "bad\nname" })), /github-transport-observation-invalid/);
  assert.throws(() => validateGithubTransportIdentity({ ...observed, fingerprint: "0".repeat(64) }), /github-transport-observation-fingerprint-invalid/);
});

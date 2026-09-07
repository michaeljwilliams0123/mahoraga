import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDestinyCodexBinding,
  createSignedReceiptTrustFromBinding,
  extractCodexTaskReference,
  findCodexCloudTaskByTitle,
  fingerprintCodexAccountId,
  fingerprintCodexEnvironmentId,
  fingerprintCodexInstallationId,
} from "../src/codex-connection-identity.mjs";
import { validateDestinyTriggerTrustManifest } from "../src/destiny-trigger-trust.mjs";

const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const accountId = "account-destiny-123";
const installationId = "installation-destiny-456";
const environmentId = "michaeljwilliams0123/mahoraga";
const accountFingerprint = "2a392e9d979edc2b519468590814f07c377b7555e9b856aeeab6f50be2d95aa8";
const installationFingerprint = "99ab23c06302fb954680f45345c4f99cb348ba1ec2f4cf2f8f5aa78e34158ad7";
const receiptKeyFingerprint = "e".repeat(64);
const codexTaskReference = "cd_6a95f5f4bc5481918ad74b3f028609d2";
const expectedTaskTitle = "[CODEX] Destiny binding probe dcx-0123456789abcdef01234567";

function trustManifest(receiptTrust) {
  return {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    owner,
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust,
  };
}

test("Codex connection identity hashes stable account, installation, and environment IDs without retaining raw values", () => {
  assert.equal(fingerprintCodexAccountId(` ${accountId} `), accountFingerprint);
  assert.equal(fingerprintCodexInstallationId(` ${installationId} `), installationFingerprint);
  assert.match(fingerprintCodexEnvironmentId(environmentId), /^[a-f0-9]{64}$/);
  assert.throws(() => fingerprintCodexAccountId("   "), /codex-account-id-invalid/);
  assert.throws(() => fingerprintCodexInstallationId("\0bad"), /codex-installation-id-invalid/);
});

test("Codex task references are extracted only from native cd_* IDs or chatgpt.com task links", () => {
  assert.equal(extractCodexTaskReference(codexTaskReference), codexTaskReference);
  assert.equal(extractCodexTaskReference(`https://chatgpt.com/s/${codexTaskReference}`), codexTaskReference);
  assert.equal(extractCodexTaskReference(`View task: https://chatgpt.com/s/${codexTaskReference}`), codexTaskReference);
  assert.throws(() => extractCodexTaskReference("https://example.com/s/cd_6a95f5f4bc5481918ad74b3f028609d2"), /codex-task-reference-invalid/);
  assert.throws(() => extractCodexTaskReference("cd_short"), /codex-task-reference-invalid/);
});

test("account-side cloud task visibility is exact-title and ambiguity fail-closed", () => {
  const payload = {
    tasks: [
      { id: "task-primary", title: "[CODEX] unrelated", url: "https://chatgpt.com/codex/tasks/task-primary", environment_id: environmentId },
      { id: "task-destiny", title: expectedTaskTitle, url: `https://chatgpt.com/s/${codexTaskReference}`, environment_id: environmentId },
    ],
  };
  const found = findCodexCloudTaskByTitle(payload, expectedTaskTitle);
  assert.equal(found.id, "task-destiny");
  assert.equal(found.environmentId, environmentId);
  assert.equal(found.codexTaskReference, codexTaskReference);
  assert.throws(() => findCodexCloudTaskByTitle({ tasks: [] }, expectedTaskTitle), /codex-cloud-task-not-visible/);
  assert.throws(() => findCodexCloudTaskByTitle({ tasks: [found, found] }, expectedTaskTitle), /codex-cloud-task-ambiguous/);
});

test("route-verified binding contains only fingerprints and can promote the existing signed-receipt trust mode", () => {
  const task = findCodexCloudTaskByTitle({ tasks: [{
    id: "task-destiny",
    title: expectedTaskTitle,
    url: `https://chatgpt.com/s/${codexTaskReference}`,
    environment_id: environmentId,
  }] }, expectedTaskTitle);
  const binding = buildDestinyCodexBinding({
    accountId,
    installationId,
    task,
    receiptKeyFingerprint,
    observedAt: "2026-09-07T04:00:00.000Z",
  });

  assert.equal(binding.routeVerified, true);
  assert.equal(binding.codexAccountFingerprint, accountFingerprint);
  assert.equal(binding.codexInstallationFingerprint, installationFingerprint);
  assert.equal(binding.codexTaskReference, codexTaskReference);
  assert.equal(binding.receiptKeyFingerprint, receiptKeyFingerprint);
  const serialized = JSON.stringify(binding);
  assert.equal(serialized.includes(accountId), false);
  assert.equal(serialized.includes(installationId), false);
  assert.equal(serialized.includes(environmentId), false);

  const receiptTrust = createSignedReceiptTrustFromBinding(binding);
  assert.deepEqual(receiptTrust, {
    mode: "signed-receipt",
    algorithm: "ed25519",
    publicKeyFingerprint: receiptKeyFingerprint,
    keyId: "destiny-event-dispatch-v1",
  });
  assert.equal(validateDestinyTriggerTrustManifest(trustManifest(receiptTrust)).receiptTrust.mode, "signed-receipt");
});

test("unverified bindings cannot be promoted to trusted Destiny receipts", () => {
  const unverified = {
    schemaVersion: 1,
    kind: "destiny-codex-binding",
    routeVerified: false,
    codexAccountFingerprint: accountFingerprint,
    codexInstallationFingerprint: installationFingerprint,
    codexEnvironmentFingerprint: fingerprintCodexEnvironmentId(environmentId),
    codexCloudTaskId: null,
    codexTaskReference: null,
    receiptKeyFingerprint,
    observedAt: "2026-09-07T04:00:00.000Z",
  };
  assert.throws(() => createSignedReceiptTrustFromBinding(unverified), /destiny-codex-route-unverified/);
});

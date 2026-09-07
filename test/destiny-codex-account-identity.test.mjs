import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCodexTaskReference,
  fingerprintCodexAccountId,
  fingerprintCodexInstallationId,
} from "../src/codex-connection-identity.mjs";
import {
  evaluateDestinyTriggerReadiness,
  validateDestinyTriggerReceipt,
  validateDestinyTriggerTrustManifest,
} from "../src/destiny-trigger-trust.mjs";

const repository = "michaeljwilliams0123/mahoraga";
const owner = "michaeljwilliams0123";
const actorLogin = "chatgpt-codex-connector[bot]";
const accountFingerprint = "2a392e9d979edc2b519468590814f07c377b7555e9b856aeeab6f50be2d95aa8";
const installationFingerprint = "99ab23c06302fb954680f45345c4f99cb348ba1ec2f4cf2f8f5aa78e34158ad7";
const codexTaskId = "cd_6a95f5f4bc5481918ad74b3f028609d2";

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    owner,
    readinessMaxAgeMs: 300000,
    zeroCreditRequired: true,
    receiptTrust: {
      mode: "codex-account-fingerprint",
      actorLogin,
      accountFingerprint,
    },
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    triggerId: "destiny-event-dispatch-v1",
    repository,
    status: "ready",
    observedAt: "2026-09-07T04:00:00.000Z",
    zeroCreditEligible: true,
    actorLogin,
    codexAccountFingerprint: accountFingerprint,
    codexInstallationFingerprint: installationFingerprint,
    codexTaskId,
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "acked",
    repository,
    pullRequest: 101,
    dispatchId: "dcx-0123456789abcdef01234567",
    requestSha256: "b".repeat(64),
    headSha: "a".repeat(40),
    deliveryId: codexTaskId,
    status: "acked",
    observedAt: "2026-09-07T04:00:10.000Z",
    actorLogin,
    codexAccountFingerprint: accountFingerprint,
    codexInstallationFingerprint: installationFingerprint,
    codexTaskId,
    ...overrides,
  };
}

test("Codex connection identity hashes stable account and installation IDs without retaining raw values", () => {
  assert.equal(fingerprintCodexAccountId(" account-destiny-123 "), accountFingerprint);
  assert.equal(fingerprintCodexInstallationId(" installation-destiny-456 "), installationFingerprint);
  assert.throws(() => fingerprintCodexAccountId("   "), /codex-account-id-invalid/);
  assert.throws(() => fingerprintCodexInstallationId("\0bad"), /codex-installation-id-invalid/);
});

test("Codex task references are extracted only from native cd_* IDs or chatgpt.com task links", () => {
  assert.equal(extractCodexTaskReference(codexTaskId), codexTaskId);
  assert.equal(extractCodexTaskReference(`https://chatgpt.com/s/${codexTaskId}`), codexTaskId);
  assert.equal(extractCodexTaskReference(`View task: https://chatgpt.com/s/${codexTaskId}`), codexTaskId);
  assert.throws(() => extractCodexTaskReference("https://example.com/s/cd_6a95f5f4bc5481918ad74b3f028609d2"), /codex-task-reference-invalid/);
  assert.throws(() => extractCodexTaskReference("cd_short"), /codex-task-reference-invalid/);
});

test("Codex account fingerprint trust is fail-closed and preserves owner-spoof protection", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest());
  const ready = evaluateDestinyTriggerReadiness(configured, observation(), { now: "2026-09-07T04:03:00.000Z" });
  assert.equal(ready.ready, true);
  assert.equal(ready.accountFingerprint, accountFingerprint);
  assert.equal(ready.codexTaskId, codexTaskId);

  const mismatch = evaluateDestinyTriggerReadiness(
    configured,
    observation({ codexAccountFingerprint: "c".repeat(64) }),
    { now: "2026-09-07T04:03:00.000Z" },
  );
  assert.equal(mismatch.ready, false);
  assert.equal(mismatch.reason, "destiny-trigger-codex-account-mismatch");

  const ownerSpoof = evaluateDestinyTriggerReadiness(
    configured,
    observation({ actorLogin: owner }),
    { now: "2026-09-07T04:03:00.000Z" },
  );
  assert.equal(ownerSpoof.ready, false);
  assert.equal(ownerSpoof.reason, "destiny-trigger-receipt-owner-spoof");
});

test("Codex account fingerprint receipts require the pinned account and connector actor", () => {
  const configured = validateDestinyTriggerTrustManifest(manifest());
  assert.equal(validateDestinyTriggerReceipt(configured, receipt()).codexTaskId, codexTaskId);
  assert.throws(
    () => validateDestinyTriggerReceipt(configured, receipt({ codexAccountFingerprint: "d".repeat(64) })),
    /destiny-trigger-codex-account-mismatch/,
  );
  assert.throws(
    () => validateDestinyTriggerReceipt(configured, receipt({ actorLogin: "other-bot[bot]" })),
    /destiny-trigger-receipt-actor-mismatch/,
  );
});

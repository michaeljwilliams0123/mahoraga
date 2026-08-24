import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTIFACT_MIME_POLICY,
  artifactStatus,
  createMalwareScanReceipt,
  deleteArtifact,
  initiateArtifact,
  issueArtifactGrant,
  makeArtifactAvailable,
  markArtifactUploaded,
  quarantineArtifact,
  redeemArtifactGrant,
  revokeArtifact,
  validateArtifactRecord,
} from "../src/artifact-contract.mjs";

const T0 = "2026-08-24T12:00:00.000Z";
const T1 = "2026-08-24T12:00:10.000Z";
const T2 = "2026-08-24T12:00:20.000Z";
const T3 = "2026-08-24T12:00:30.000Z";
const T4 = "2026-08-24T12:00:40.000Z";
const T5 = "2026-08-24T12:00:50.000Z";
const T6 = "2026-08-24T12:01:00.000Z";
const SHA = "a".repeat(64);
const taskId = "task_repo-42-artifacts";
const initiation = Object.freeze({
  idempotencyKey: "issue-42-attachment-1",
  taskId,
  fileName: "Quarterly evidence.pdf",
  mimeType: "application/pdf",
  sizeBytes: 12_345,
  sha256: SHA,
  retentionSeconds: 3600,
});
const upload = Object.freeze({
  observedName: initiation.fileName,
  observedMimeType: initiation.mimeType,
  observedSizeBytes: initiation.sizeBytes,
  observedSha256: initiation.sha256,
});

function scan(overrides = {}) {
  return createMalwareScanReceipt({
    scanId: "scan-42-1",
    scanner: "clamav",
    engineVersion: "1.4.3",
    signatureVersion: "20260824.1200",
    scannedAt: T3,
    sha256: SHA,
    verdict: "clean",
    ...overrides,
  });
}

function quarantinedArtifact() {
  let artifact = initiateArtifact([], initiation, { now: T0 }).artifact;
  artifact = markArtifactUploaded(artifact, upload, { now: T1 });
  return quarantineArtifact(artifact, { reasonCode: "awaiting-malware-scan" }, { now: T2 });
}

function availableArtifact() {
  return makeArtifactAvailable(quarantinedArtifact(), scan(), { now: T3 });
}

test("clean artifacts follow the strict initiated/uploaded/quarantined/available/revoked/deleted lifecycle", () => {
  const initiated = initiateArtifact([], initiation, { now: T0 }).artifact;
  assert.equal(initiated.status, "initiated");
  assert.equal(initiated.revision, 0);
  assert.equal(Object.isFrozen(initiated.file), true);

  const uploaded = markArtifactUploaded(initiated, upload, { now: T1 });
  const quarantined = quarantineArtifact(uploaded, { reasonCode: "awaiting-malware-scan" }, { now: T2 });
  const available = makeArtifactAvailable(quarantined, scan(), { now: T3 });
  const revoked = revokeArtifact(available, { reasonCode: "owner-revoked" }, { now: T5 });
  const deleted = deleteArtifact(revoked, { reasonCode: "retention-cleanup" }, { now: T6 });

  assert.deepEqual(
    [uploaded.status, quarantined.status, available.status, revoked.status, deleted.status],
    ["uploaded", "quarantined", "available", "revoked", "deleted"],
  );
  assert.equal(deleted.revision, 5);
  assert.equal(validateArtifactRecord(deleted).status, "deleted");
  assert.throws(() => deleteArtifact(available, { reasonCode: "retention-cleanup" }, { now: T6 }), /artifact-transition-invalid/);
});

test("initiation and lifecycle transition retries are idempotent but conflicting retries fail", () => {
  const first = initiateArtifact([], initiation, { now: T0 });
  const duplicate = initiateArtifact([first.artifact], initiation, { now: T1 });
  assert.equal(duplicate.created, false);
  assert.deepEqual(duplicate.artifact, first.artifact);
  assert.throws(() => initiateArtifact([first.artifact], { ...initiation, sizeBytes: 12_346 }, { now: T1 }), /artifact-idempotency-conflict/);

  const uploaded = markArtifactUploaded(first.artifact, upload, { now: T1 });
  assert.deepEqual(markArtifactUploaded(uploaded, upload, { now: T2 }), uploaded);
  assert.throws(() => markArtifactUploaded(uploaded, { ...upload, observedSha256: "b".repeat(64) }, { now: T2 }), /artifact-upload-hash-mismatch/);

  const quarantined = quarantineArtifact(uploaded, { reasonCode: "awaiting-malware-scan" }, { now: T2 });
  assert.deepEqual(quarantineArtifact(quarantined, { reasonCode: "awaiting-malware-scan" }, { now: T3 }), quarantined);
  const available = makeArtifactAvailable(quarantined, scan(), { now: T3 });
  assert.deepEqual(makeArtifactAvailable(available, scan(), { now: T4 }), available);
  const revoked = revokeArtifact(available, { reasonCode: "owner-revoked" }, { now: T5 });
  assert.deepEqual(revokeArtifact(revoked, { reasonCode: "owner-revoked" }, { now: T6 }), revoked);
  const deleted = deleteArtifact(revoked, { reasonCode: "retention-cleanup" }, { now: T6 });
  assert.deepEqual(deleteArtifact(deleted, { reasonCode: "retention-cleanup" }, { now: "2026-08-24T12:01:10.000Z" }), deleted);
});

test("filenames reject path traversal, ambiguous paths, reserved device names, and unsafe tokens", () => {
  for (const fileName of ["../evidence.pdf", "folder/evidence.pdf", "folder\\evidence.pdf", ".hidden.pdf", "evidence..pdf", "CON.pdf", "evidence.pdf "]) {
    assert.throws(() => initiateArtifact([], { ...initiation, idempotencyKey: `bad-${fileName.length}`, fileName }, { now: T0 }), /artifact-filename-invalid/);
  }
  assert.throws(() => initiateArtifact([], { ...initiation, fileName: `sk-${"x".repeat(20)}.pdf` }, { now: T0 }), /artifact-filename-invalid/);
});

test("declared and observed MIME types must be allowlisted and agree with the safe extension", () => {
  assert.throws(() => initiateArtifact([], { ...initiation, mimeType: "application/x-msdownload", fileName: "evidence.exe" }, { now: T0 }), /artifact-mime-not-allowed/);
  assert.throws(() => initiateArtifact([], { ...initiation, mimeType: "image/png" }, { now: T0 }), /artifact-extension-mime-mismatch/);
  assert.throws(() => markArtifactUploaded(initiateArtifact([], initiation, { now: T0 }).artifact, {
    ...upload,
    observedMimeType: "image/png",
  }, { now: T1 }), /artifact-upload-mime-mismatch/);
  assert.throws(() => markArtifactUploaded(initiateArtifact([], initiation, { now: T0 }).artifact, {
    ...upload,
    observedName: "Quarterly evidence.png",
    observedMimeType: "image/png",
  }, { now: T1 }), /artifact-upload-name-mismatch/);
});

test("per-MIME maximum sizes are enforced at initiation and upload observation", () => {
  const tooLargeText = ARTIFACT_MIME_POLICY["text/plain"].maxBytes + 1;
  assert.throws(() => initiateArtifact([], {
    ...initiation,
    fileName: "evidence.txt",
    mimeType: "text/plain",
    sizeBytes: tooLargeText,
  }, { now: T0 }), /artifact-size-invalid/);
  const initiated = initiateArtifact([], initiation, { now: T0 }).artifact;
  assert.throws(() => markArtifactUploaded(initiated, { ...upload, observedSizeBytes: initiation.sizeBytes + 1 }, { now: T1 }), /artifact-upload-size-mismatch/);
});

test("content identity is SHA-256 bound through initiation, upload, and scanning", () => {
  const initiated = initiateArtifact([], initiation, { now: T0 }).artifact;
  assert.match(initiated.artifactId, /^art_[a-f0-9]{40}$/);
  assert.throws(() => markArtifactUploaded(initiated, { ...upload, observedSha256: "b".repeat(64) }, { now: T1 }), /artifact-upload-hash-mismatch/);
  const quarantined = quarantinedArtifact();
  assert.throws(() => makeArtifactAvailable(quarantined, scan({ sha256: "b".repeat(64) }), { now: T3 }), /artifact-scan-hash-mismatch/);
  const tamperedScan = { ...scan(), scanner: "different-scanner" };
  assert.throws(() => makeArtifactAvailable(quarantined, tamperedScan, { now: T3 }), /artifact-scan-receipt-hash-mismatch/);
});

test("availability cannot skip quarantine or a complete clean malware scan receipt", () => {
  const initiated = initiateArtifact([], initiation, { now: T0 }).artifact;
  const uploaded = markArtifactUploaded(initiated, upload, { now: T1 });
  assert.throws(() => makeArtifactAvailable(uploaded, scan(), { now: T3 }), /artifact-transition-invalid/);
  const quarantined = quarantineArtifact(uploaded, { reasonCode: "awaiting-malware-scan" }, { now: T2 });
  assert.throws(() => makeArtifactAvailable(quarantined, { ...scan(), receiptSha256: undefined }, { now: T3 }), /artifact-scan-receipt-hash-invalid/);
  assert.throws(() => makeArtifactAvailable(quarantined, scan({ verdict: "malicious" }), { now: T3 }), /artifact-scan-not-clean/);
  const revoked = revokeArtifact(quarantined, { reasonCode: "malware-detected" }, { now: T4 });
  assert.equal(revoked.status, "revoked");
});

test("grants are task-scoped, short-lived, one-use, and reject cross-task or replay access", () => {
  const available = availableArtifact();
  assert.throws(() => issueArtifactGrant(available, {
    grantId: "grant-cross-task",
    taskId: "task-other",
    expiresAt: "2026-08-24T12:05:00.000Z",
  }, { now: T4 }), /artifact-cross-task-access/);

  const granted = issueArtifactGrant(available, {
    grantId: "grant-42-1",
    taskId,
    expiresAt: "2026-08-24T12:05:00.000Z",
  }, { now: T4 });
  assert.equal(artifactStatus(granted, { now: T4 }).activeGrantCount, 1);
  assert.deepEqual(issueArtifactGrant(granted, {
    grantId: "grant-42-1",
    taskId,
    expiresAt: "2026-08-24T12:05:00.000Z",
  }, { now: T5 }), granted);
  assert.throws(() => redeemArtifactGrant(granted, { grantId: "grant-42-1", taskId: "task-other" }, { now: T5 }), /artifact-cross-task-access/);

  const consumed = redeemArtifactGrant(granted, { grantId: "grant-42-1", taskId }, { now: T5 });
  assert.equal(consumed.grants[0].consumedAt, T5);
  assert.equal(artifactStatus(consumed, { now: T5 }).activeGrantCount, 0);
  assert.throws(() => redeemArtifactGrant(consumed, { grantId: "grant-42-1", taskId }, { now: T6 }), /artifact-grant-replayed/);
});

test("expired grants, retention expiry, and grants beyond retention are rejected", () => {
  const available = availableArtifact();
  const granted = issueArtifactGrant(available, {
    grantId: "grant-expiring",
    taskId,
    expiresAt: "2026-08-24T12:00:50.000Z",
  }, { now: T4 });
  assert.throws(() => redeemArtifactGrant(granted, { grantId: "grant-expiring", taskId }, { now: T5 }), /artifact-grant-expired/);
  assert.throws(() => issueArtifactGrant(available, {
    grantId: "grant-too-long",
    taskId,
    expiresAt: "2026-08-24T12:20:00.000Z",
  }, { now: T4 }), /artifact-grant-expiry-invalid/);

  const short = { ...initiation, idempotencyKey: "short-retention", retentionSeconds: 60 };
  let artifact = initiateArtifact([], short, { now: T0 }).artifact;
  artifact = markArtifactUploaded(artifact, upload, { now: T1 });
  artifact = quarantineArtifact(artifact, { reasonCode: "awaiting-malware-scan" }, { now: T2 });
  artifact = makeArtifactAvailable(artifact, scan(), { now: T3 });
  assert.equal(artifactStatus(artifact, { now: T6 }).retentionExpired, true);
  assert.throws(() => issueArtifactGrant(artifact, {
    grantId: "grant-after-retention",
    taskId,
    expiresAt: "2026-08-24T12:02:00.000Z",
  }, { now: T6 }), /artifact-retention-expired/);
});

test("revocation invalidates active grants and deletion leaves no accessible grant", () => {
  let artifact = issueArtifactGrant(availableArtifact(), {
    grantId: "grant-to-revoke",
    taskId,
    expiresAt: "2026-08-24T12:05:00.000Z",
  }, { now: T4 });
  artifact = revokeArtifact(artifact, { reasonCode: "owner-revoked" }, { now: T5 });
  assert.equal(artifact.grants[0].revokedAt, T5);
  assert.equal(artifactStatus(artifact, { now: T5 }).activeGrantCount, 0);
  assert.throws(() => redeemArtifactGrant(artifact, { grantId: "grant-to-revoke", taskId }, { now: T6 }), /artifact-transition-invalid/);
  artifact = deleteArtifact(artifact, { reasonCode: "owner-deleted" }, { now: T6 });
  assert.equal(artifact.status, "deleted");
  assert.equal(artifactStatus(artifact, { now: T6 }).activeGrantCount, 0);
});

test("strict schemas persist metadata only and reject file contents, URLs, and credentials", () => {
  assert.throws(() => initiateArtifact([], { ...initiation, content: "private document" }, { now: T0 }), /field-not-allowed:content/);
  const artifact = initiateArtifact([], initiation, { now: T0 }).artifact;
  assert.throws(() => markArtifactUploaded(artifact, { ...upload, uploadUrl: "https://storage.example/private" }, { now: T1 }), /field-not-allowed:uploadUrl/);
  assert.throws(() => markArtifactUploaded(artifact, { ...upload, credential: "Bearer not-persisted" }, { now: T1 }), /field-not-allowed:credential/);
  assert.throws(() => createMalwareScanReceipt({
    scanId: "scan-credential",
    scanner: "clamav",
    engineVersion: "1.4.3",
    signatureVersion: "20260824.1200",
    scannedAt: T3,
    sha256: SHA,
    verdict: "clean",
    token: "not-allowed",
  }), /field-not-allowed:token/);
  const serialized = JSON.stringify(artifact);
  for (const forbidden of ["content", "credential", "uploadUrl", "downloadUrl", "bearerToken"]) assert.equal(serialized.includes(forbidden), false);
});

test("record validation detects injected access grants and lifecycle tampering", () => {
  const available = availableArtifact();
  assert.throws(() => validateArtifactRecord({
    ...available,
    grants: [{
      grantId: "injected",
      taskId: "task-other",
      issuedAt: T4,
      expiresAt: "2026-08-24T12:05:00.000Z",
      consumedAt: null,
      revokedAt: null,
    }],
  }), /artifact-cross-task-access/);
  assert.throws(() => validateArtifactRecord({ ...available, scan: null }), /artifact-state-invalid/);
  assert.throws(() => validateArtifactRecord({ ...available, status: "available", quarantine: null }), /artifact-state-invalid/);
  assert.throws(() => validateArtifactRecord({ ...available, revision: 999 }), /artifact-revision-invalid/);
  assert.throws(() => validateArtifactRecord({
    ...available,
    scan: createMalwareScanReceipt({
      scanId: "scan-for-other-content",
      scanner: "clamav",
      engineVersion: "1.4.3",
      signatureVersion: "20260824.1200",
      scannedAt: T3,
      sha256: "b".repeat(64),
      verdict: "clean",
    }),
  }), /artifact-scan-hash-mismatch/);
});

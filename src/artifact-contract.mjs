import { createHash } from "node:crypto";

export const ARTIFACT_SCHEMA_VERSION = 1;
export const ARTIFACT_GLOBAL_MAX_BYTES = 50 * 1024 * 1024;
export const ARTIFACT_MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60;
export const ARTIFACT_MAX_GRANT_SECONDS = 15 * 60;

export const ARTIFACT_MIME_POLICY = deepFreeze({
  "application/json": { extensions: [".json"], maxBytes: 2 * 1024 * 1024 },
  "application/pdf": { extensions: [".pdf"], maxBytes: 25 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { extensions: [".pptx"], maxBytes: 50 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extensions: [".xlsx"], maxBytes: 25 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: [".docx"], maxBytes: 25 * 1024 * 1024 },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], maxBytes: 20 * 1024 * 1024 },
  "image/png": { extensions: [".png"], maxBytes: 20 * 1024 * 1024 },
  "image/webp": { extensions: [".webp"], maxBytes: 20 * 1024 * 1024 },
  "text/csv": { extensions: [".csv"], maxBytes: 10 * 1024 * 1024 },
  "text/markdown": { extensions: [".md", ".markdown"], maxBytes: 2 * 1024 * 1024 },
  "text/plain": { extensions: [".txt", ".log"], maxBytes: 2 * 1024 * 1024 },
});

const STATUS_VALUES = new Set(["initiated", "uploaded", "quarantined", "available", "revoked", "deleted"]);
const RECORD_KEYS = new Set([
  "schemaVersion", "artifactId", "idempotencyKey", "taskId", "status", "revision", "file",
  "createdAt", "updatedAt", "retentionExpiresAt", "upload", "quarantine", "scan", "grants",
  "revocation", "deletion",
]);
const INITIATION_KEYS = new Set(["idempotencyKey", "taskId", "fileName", "mimeType", "sizeBytes", "sha256", "retentionSeconds"]);
const FILE_KEYS = new Set(["name", "mimeType", "sizeBytes", "sha256"]);
const UPLOAD_INPUT_KEYS = new Set(["observedName", "observedMimeType", "observedSizeBytes", "observedSha256"]);
const UPLOAD_KEYS = new Set(["uploadedAt", ...UPLOAD_INPUT_KEYS]);
const QUARANTINE_INPUT_KEYS = new Set(["reasonCode"]);
const QUARANTINE_KEYS = new Set(["quarantinedAt", "reasonCode"]);
const SCAN_INPUT_KEYS = new Set(["scanId", "scanner", "engineVersion", "signatureVersion", "scannedAt", "sha256", "verdict"]);
const SCAN_KEYS = new Set([...SCAN_INPUT_KEYS, "receiptSha256"]);
const GRANT_INPUT_KEYS = new Set(["grantId", "taskId", "expiresAt"]);
const REDEEM_INPUT_KEYS = new Set(["grantId", "taskId"]);
const GRANT_KEYS = new Set(["grantId", "taskId", "issuedAt", "expiresAt", "consumedAt", "revokedAt"]);
const REVOCATION_INPUT_KEYS = new Set(["reasonCode"]);
const REVOCATION_KEYS = new Set(["revokedAt", "reasonCode"]);
const DELETION_INPUT_KEYS = new Set(["reasonCode"]);
const DELETION_KEYS = new Set(["deletedAt", "reasonCode"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const CODE = /^[a-z][a-z0-9.-]*$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._ ()+-]*$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const FORBIDDEN_SECRET = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\b(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=])/i;

export class ArtifactContractError extends TypeError {
  constructor(code) {
    super(code);
    this.name = "ArtifactContractError";
    this.code = code;
  }
}

/**
 * Create or idempotently recover an artifact metadata record. This contract never
 * accepts file bytes, upload URLs, bearer grants, or provider credentials.
 */
export function initiateArtifact(existingRecords, input, { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(existingRecords) || existingRecords.length > 10_000) fail("artifact-registry-invalid");
  const records = existingRecords.map(validateArtifactRecord);
  const request = normalizeInitiation(input);
  const matches = records.filter((record) => record.idempotencyKey === request.idempotencyKey);
  if (matches.length > 1) fail("artifact-registry-invalid");
  if (matches.length === 1) {
    const match = matches[0];
    if (match.taskId !== request.taskId || canonicalJson(match.file) !== canonicalJson(request.file)
      || retentionSeconds(match) !== request.retentionSeconds) fail("artifact-idempotency-conflict");
    return deepFreeze({ created: false, artifact: match });
  }

  const timestamp = normalizedTime(now, "artifact-time-invalid");
  const artifact = validateArtifactRecord({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: artifactId(request),
    idempotencyKey: request.idempotencyKey,
    taskId: request.taskId,
    status: "initiated",
    revision: 0,
    file: request.file,
    createdAt: timestamp,
    updatedAt: timestamp,
    retentionExpiresAt: addSeconds(timestamp, request.retentionSeconds),
    upload: null,
    quarantine: null,
    scan: null,
    grants: [],
    revocation: null,
    deletion: null,
  });
  return deepFreeze({ created: true, artifact });
}

export function markArtifactUploaded(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  const receipt = normalizeUploadInput(input, artifact.file, now);
  if (artifact.upload) {
    if (!sameReceipt(artifact.upload, receipt)) fail("artifact-upload-replay-conflict");
    return artifact;
  }
  expectStatus(artifact, "initiated");
  const timestamp = transitionTime(artifact, now);
  if (Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt)) fail("artifact-retention-expired");
  return next(artifact, {
    status: "uploaded",
    upload: { ...receipt, uploadedAt: timestamp },
  }, timestamp);
}

export function quarantineArtifact(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  exact(input, QUARANTINE_INPUT_KEYS, "artifact-quarantine-request");
  const reasonCode = code(input.reasonCode, "artifact-quarantine-reason-invalid");
  if (artifact.quarantine) {
    if (artifact.quarantine.reasonCode !== reasonCode) fail("artifact-quarantine-replay-conflict");
    return artifact;
  }
  expectStatus(artifact, "uploaded");
  const timestamp = transitionTime(artifact, now);
  if (Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt)) fail("artifact-retention-expired");
  return next(artifact, {
    status: "quarantined",
    quarantine: { quarantinedAt: timestamp, reasonCode },
  }, timestamp);
}

export function createMalwareScanReceipt(input) {
  exact(input, SCAN_INPUT_KEYS, "artifact-scan-receipt-input");
  const body = normalizeScanBody(input);
  return deepFreeze({ ...body, receiptSha256: digest(canonicalJson(body)) });
}

export function makeArtifactAvailable(record, scanReceipt, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  const scan = normalizeScanReceipt(scanReceipt);
  if (artifact.scan) {
    if (canonicalJson(artifact.scan) !== canonicalJson(scan)) fail("artifact-scan-replay-conflict");
    return artifact;
  }
  expectStatus(artifact, "quarantined");
  const timestamp = transitionTime(artifact, now);
  if (Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt)) fail("artifact-retention-expired");
  if (scan.sha256 !== artifact.file.sha256) fail("artifact-scan-hash-mismatch");
  if (scan.verdict !== "clean") fail("artifact-scan-not-clean");
  if (Date.parse(scan.scannedAt) < Date.parse(artifact.quarantine.quarantinedAt)
    || Date.parse(scan.scannedAt) > Date.parse(timestamp)) fail("artifact-scan-time-invalid");
  return next(artifact, { status: "available", scan }, timestamp);
}

/**
 * Record task-scoped authorization metadata. grantId is only an audit identifier;
 * authentication and any bearer capability remain outside this persistence model.
 */
export function issueArtifactGrant(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  exact(input, GRANT_INPUT_KEYS, "artifact-grant-request");
  const grantId = token(input.grantId, 128, "artifact-grant-id-invalid");
  const taskId = token(input.taskId, 128, "artifact-task-id-invalid");
  const expiresAt = normalizedTime(input.expiresAt, "artifact-grant-expiry-invalid");
  const existing = artifact.grants.find((grant) => grant.grantId === grantId);
  if (existing) {
    if (existing.taskId !== taskId || existing.expiresAt !== expiresAt) fail("artifact-grant-replay-conflict");
    return artifact;
  }
  expectStatus(artifact, "available");
  const timestamp = transitionTime(artifact, now);
  if (Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt)) fail("artifact-retention-expired");
  if (taskId !== artifact.taskId) fail("artifact-cross-task-access");
  if (artifact.grants.length >= 32) fail("artifact-grant-limit-reached");
  const lifetime = Date.parse(expiresAt) - Date.parse(timestamp);
  if (lifetime <= 0 || lifetime > ARTIFACT_MAX_GRANT_SECONDS * 1000
    || Date.parse(expiresAt) > Date.parse(artifact.retentionExpiresAt)) fail("artifact-grant-expiry-invalid");
  return next(artifact, {
    grants: [...artifact.grants, { grantId, taskId, issuedAt: timestamp, expiresAt, consumedAt: null, revokedAt: null }],
  }, timestamp);
}

/**
 * Consume a one-use grant. A second use is deliberately rejected rather than
 * treated as an idempotent request because access replay is a security event.
 */
export function redeemArtifactGrant(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  exact(input, REDEEM_INPUT_KEYS, "artifact-grant-redemption");
  const grantId = token(input.grantId, 128, "artifact-grant-id-invalid");
  const taskId = token(input.taskId, 128, "artifact-task-id-invalid");
  expectStatus(artifact, "available");
  const timestamp = transitionTime(artifact, now);
  if (taskId !== artifact.taskId) fail("artifact-cross-task-access");
  if (Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt)) fail("artifact-retention-expired");
  const index = artifact.grants.findIndex((grant) => grant.grantId === grantId);
  if (index < 0) fail("artifact-grant-not-found");
  const grant = artifact.grants[index];
  if (grant.taskId !== taskId) fail("artifact-cross-task-access");
  if (grant.revokedAt) fail("artifact-grant-revoked");
  if (grant.consumedAt) fail("artifact-grant-replayed");
  if (Date.parse(timestamp) >= Date.parse(grant.expiresAt)) fail("artifact-grant-expired");
  const grants = artifact.grants.map((entry, grantIndex) => grantIndex === index ? { ...entry, consumedAt: timestamp } : entry);
  return next(artifact, { grants }, timestamp);
}

export function revokeArtifact(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  exact(input, REVOCATION_INPUT_KEYS, "artifact-revocation-request");
  const reasonCode = code(input.reasonCode, "artifact-revocation-reason-invalid");
  if (artifact.revocation) {
    if (artifact.revocation.reasonCode !== reasonCode) fail("artifact-revocation-replay-conflict");
    return artifact;
  }
  if (!new Set(["quarantined", "available"]).has(artifact.status)) fail("artifact-transition-invalid");
  if (artifact.status === "quarantined" && reasonCode !== "malware-detected" && reasonCode !== "scan-failed") {
    fail("artifact-quarantine-revocation-reason-invalid");
  }
  const timestamp = transitionTime(artifact, now);
  const grants = artifact.grants.map((grant) => grant.consumedAt || grant.revokedAt ? grant : { ...grant, revokedAt: timestamp });
  return next(artifact, {
    status: "revoked",
    grants,
    revocation: { revokedAt: timestamp, reasonCode },
  }, timestamp);
}

export function deleteArtifact(record, input, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  exact(input, DELETION_INPUT_KEYS, "artifact-deletion-request");
  const reasonCode = code(input.reasonCode, "artifact-deletion-reason-invalid");
  if (artifact.deletion) {
    if (artifact.deletion.reasonCode !== reasonCode) fail("artifact-deletion-replay-conflict");
    return artifact;
  }
  expectStatus(artifact, "revoked");
  const timestamp = transitionTime(artifact, now);
  return next(artifact, {
    status: "deleted",
    deletion: { deletedAt: timestamp, reasonCode },
  }, timestamp);
}

export function artifactStatus(record, { now = new Date().toISOString() } = {}) {
  const artifact = validateArtifactRecord(record);
  const timestamp = normalizedTime(now, "artifact-time-invalid");
  return deepFreeze({
    artifactId: artifact.artifactId,
    taskId: artifact.taskId,
    status: artifact.status,
    revision: artifact.revision,
    sha256: artifact.file.sha256,
    retentionExpiresAt: artifact.retentionExpiresAt,
    retentionExpired: Date.parse(timestamp) >= Date.parse(artifact.retentionExpiresAt),
    activeGrantCount: artifact.grants.filter((grant) => !grant.consumedAt && !grant.revokedAt && Date.parse(timestamp) < Date.parse(grant.expiresAt)).length,
  });
}

export function validateArtifactRecord(record) {
  exact(record, RECORD_KEYS, "artifact-record");
  if (record.schemaVersion !== ARTIFACT_SCHEMA_VERSION) fail("artifact-schema-version-invalid");
  const idempotencyKey = token(record.idempotencyKey, 128, "artifact-idempotency-key-invalid");
  const taskId = token(record.taskId, 128, "artifact-task-id-invalid");
  const file = normalizeFile(record.file);
  const expectedId = artifactId({ idempotencyKey, taskId, file });
  if (record.artifactId !== expectedId) fail("artifact-id-invalid");
  if (!STATUS_VALUES.has(record.status)) fail("artifact-status-invalid");
  if (!Number.isSafeInteger(record.revision) || record.revision < 0 || record.revision > 10_000) fail("artifact-revision-invalid");
  const createdAt = normalizedTime(record.createdAt, "artifact-created-at-invalid");
  const updatedAt = normalizedTime(record.updatedAt, "artifact-updated-at-invalid");
  const retentionExpiresAt = normalizedTime(record.retentionExpiresAt, "artifact-retention-expiry-invalid");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) fail("artifact-timeline-invalid");
  const retainedFor = Date.parse(retentionExpiresAt) - Date.parse(createdAt);
  if (retainedFor < 60_000 || retainedFor > ARTIFACT_MAX_RETENTION_SECONDS * 1000) fail("artifact-retention-expiry-invalid");
  const upload = record.upload === null ? null : normalizeStoredUpload(record.upload, file);
  const quarantine = record.quarantine === null ? null : normalizeQuarantine(record.quarantine);
  const scan = record.scan === null ? null : normalizeScanReceipt(record.scan);
  const grants = normalizeGrants(record.grants, taskId, retentionExpiresAt);
  const revocation = record.revocation === null ? null : normalizeRevocation(record.revocation);
  const deletion = record.deletion === null ? null : normalizeDeletion(record.deletion);
  validateLifecycle(record.status, { upload, quarantine, scan, grants, revocation, deletion });
  validateTimeline({ createdAt, updatedAt, retentionExpiresAt, upload, quarantine, scan, grants, revocation, deletion });
  if (scan && scan.sha256 !== file.sha256) fail("artifact-scan-hash-mismatch");
  const expectedRevision = Number(Boolean(upload)) + Number(Boolean(quarantine)) + Number(Boolean(scan))
    + grants.length + grants.filter((grant) => grant.consumedAt).length
    + Number(Boolean(revocation)) + Number(Boolean(deletion));
  if (record.revision !== expectedRevision) fail("artifact-revision-invalid");
  return deepFreeze({
    ...structuredClone(record), idempotencyKey, taskId, file, createdAt, updatedAt, retentionExpiresAt,
    upload, quarantine, scan, grants, revocation, deletion,
  });
}

function normalizeInitiation(input) {
  exact(input, INITIATION_KEYS, "artifact-initiation");
  const retentionSeconds = input.retentionSeconds;
  if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 60 || retentionSeconds > ARTIFACT_MAX_RETENTION_SECONDS) {
    fail("artifact-retention-invalid");
  }
  const file = normalizeFile({ name: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, sha256: input.sha256 });
  return deepFreeze({
    idempotencyKey: token(input.idempotencyKey, 128, "artifact-idempotency-key-invalid"),
    taskId: token(input.taskId, 128, "artifact-task-id-invalid"),
    file,
    retentionSeconds,
  });
}

function normalizeFile(value) {
  exact(value, FILE_KEYS, "artifact-file");
  const name = safeFilename(value.name);
  const mimeType = normalizeMime(value.mimeType);
  const sizeBytes = size(value.sizeBytes, mimeType);
  const sha256 = hash(value.sha256, "artifact-sha256-invalid");
  requireExtension(name, mimeType);
  return deepFreeze({ name, mimeType, sizeBytes, sha256 });
}

function normalizeUploadInput(value, file, now) {
  exact(value, UPLOAD_INPUT_KEYS, "artifact-upload-receipt");
  const observedName = safeFilename(value.observedName);
  const observedMimeType = normalizeMime(value.observedMimeType);
  const observedSizeBytes = size(value.observedSizeBytes, observedMimeType);
  const observedSha256 = hash(value.observedSha256, "artifact-upload-sha256-invalid");
  if (observedName !== file.name) fail("artifact-upload-name-mismatch");
  if (observedMimeType !== file.mimeType) fail("artifact-upload-mime-mismatch");
  if (observedSizeBytes !== file.sizeBytes) fail("artifact-upload-size-mismatch");
  if (observedSha256 !== file.sha256) fail("artifact-upload-hash-mismatch");
  normalizedTime(now, "artifact-time-invalid");
  return deepFreeze({ observedName, observedMimeType, observedSizeBytes, observedSha256 });
}

function normalizeStoredUpload(value, file) {
  exact(value, UPLOAD_KEYS, "artifact-upload");
  const normalized = normalizeUploadInput({
    observedName: value.observedName,
    observedMimeType: value.observedMimeType,
    observedSizeBytes: value.observedSizeBytes,
    observedSha256: value.observedSha256,
  }, file, value.uploadedAt);
  return deepFreeze({ ...normalized, uploadedAt: normalizedTime(value.uploadedAt, "artifact-upload-time-invalid") });
}

function normalizeQuarantine(value) {
  exact(value, QUARANTINE_KEYS, "artifact-quarantine");
  return deepFreeze({ quarantinedAt: normalizedTime(value.quarantinedAt, "artifact-quarantine-time-invalid"), reasonCode: code(value.reasonCode, "artifact-quarantine-reason-invalid") });
}

function normalizeScanBody(value) {
  const body = {
    scanId: token(value.scanId, 128, "artifact-scan-id-invalid"),
    scanner: token(value.scanner, 64, "artifact-scanner-invalid"),
    engineVersion: token(value.engineVersion, 64, "artifact-scan-engine-invalid"),
    signatureVersion: token(value.signatureVersion, 64, "artifact-scan-signature-invalid"),
    scannedAt: normalizedTime(value.scannedAt, "artifact-scan-time-invalid"),
    sha256: hash(value.sha256, "artifact-scan-sha256-invalid"),
    verdict: value.verdict,
  };
  if (body.verdict !== "clean" && body.verdict !== "malicious") fail("artifact-scan-verdict-invalid");
  return deepFreeze(body);
}

function normalizeScanReceipt(value) {
  exact(value, SCAN_KEYS, "artifact-scan-receipt");
  const body = normalizeScanBody(value);
  const receiptSha256 = hash(value.receiptSha256, "artifact-scan-receipt-hash-invalid");
  if (receiptSha256 !== digest(canonicalJson(body))) fail("artifact-scan-receipt-hash-mismatch");
  return deepFreeze({ ...body, receiptSha256 });
}

function normalizeGrants(value, taskId, retentionExpiresAt) {
  if (!Array.isArray(value) || value.length > 32) fail("artifact-grants-invalid");
  const ids = new Set();
  return deepFreeze(value.map((grant) => {
    exact(grant, GRANT_KEYS, "artifact-grant");
    const normalized = {
      grantId: token(grant.grantId, 128, "artifact-grant-id-invalid"),
      taskId: token(grant.taskId, 128, "artifact-task-id-invalid"),
      issuedAt: normalizedTime(grant.issuedAt, "artifact-grant-time-invalid"),
      expiresAt: normalizedTime(grant.expiresAt, "artifact-grant-expiry-invalid"),
      consumedAt: grant.consumedAt === null ? null : normalizedTime(grant.consumedAt, "artifact-grant-consumed-time-invalid"),
      revokedAt: grant.revokedAt === null ? null : normalizedTime(grant.revokedAt, "artifact-grant-revoked-time-invalid"),
    };
    if (ids.has(normalized.grantId)) fail("artifact-grant-id-duplicate");
    ids.add(normalized.grantId);
    if (normalized.taskId !== taskId) fail("artifact-cross-task-access");
    const lifetime = Date.parse(normalized.expiresAt) - Date.parse(normalized.issuedAt);
    if (lifetime <= 0 || lifetime > ARTIFACT_MAX_GRANT_SECONDS * 1000
      || Date.parse(normalized.expiresAt) > Date.parse(retentionExpiresAt)) fail("artifact-grant-expiry-invalid");
    if (normalized.consumedAt && normalized.revokedAt) fail("artifact-grant-state-invalid");
    if (normalized.consumedAt && (Date.parse(normalized.consumedAt) >= Date.parse(normalized.expiresAt)
      || Date.parse(normalized.consumedAt) >= Date.parse(retentionExpiresAt))) fail("artifact-grant-state-invalid");
    return deepFreeze(normalized);
  }));
}

function normalizeRevocation(value) {
  exact(value, REVOCATION_KEYS, "artifact-revocation");
  return deepFreeze({ revokedAt: normalizedTime(value.revokedAt, "artifact-revocation-time-invalid"), reasonCode: code(value.reasonCode, "artifact-revocation-reason-invalid") });
}

function normalizeDeletion(value) {
  exact(value, DELETION_KEYS, "artifact-deletion");
  return deepFreeze({ deletedAt: normalizedTime(value.deletedAt, "artifact-deletion-time-invalid"), reasonCode: code(value.reasonCode, "artifact-deletion-reason-invalid") });
}

function validateLifecycle(status, value) {
  if (status === "initiated" && (value.upload || value.quarantine || value.scan || value.grants.length || value.revocation || value.deletion)) fail("artifact-state-invalid");
  if (status === "uploaded" && (!value.upload || value.quarantine || value.scan || value.grants.length || value.revocation || value.deletion)) fail("artifact-state-invalid");
  if (status === "quarantined" && (!value.upload || !value.quarantine || value.scan || value.grants.length || value.revocation || value.deletion)) fail("artifact-state-invalid");
  if (status === "available" && (!value.upload || !value.quarantine || !value.scan || value.scan.verdict !== "clean" || value.revocation || value.deletion)) fail("artifact-state-invalid");
  if (status === "revoked" && (!value.upload || !value.quarantine || !value.revocation || value.deletion)) fail("artifact-state-invalid");
  if (status === "revoked" && value.scan && value.scan.verdict !== "clean") fail("artifact-state-invalid");
  if (status === "deleted" && (!value.upload || !value.quarantine || !value.revocation || !value.deletion)) fail("artifact-state-invalid");
  if ((status === "revoked" || status === "deleted") && !value.scan
    && value.revocation.reasonCode !== "malware-detected" && value.revocation.reasonCode !== "scan-failed") fail("artifact-state-invalid");
  if (status === "deleted" && value.scan && value.scan.verdict !== "clean") fail("artifact-state-invalid");
  if ((status === "revoked" || status === "deleted") && value.grants.some((grant) => !grant.consumedAt && !grant.revokedAt)) fail("artifact-state-invalid");
}

function validateTimeline(value) {
  const start = Date.parse(value.createdAt);
  const end = Date.parse(value.updatedAt);
  const ordered = [
    value.upload?.uploadedAt,
    value.quarantine?.quarantinedAt,
    value.scan?.scannedAt,
    value.revocation?.revokedAt,
    value.deletion?.deletedAt,
  ].filter(Boolean).map(Date.parse);
  if (ordered.some((time) => time < start || time > end)) fail("artifact-timeline-invalid");
  for (let index = 1; index < ordered.length; index += 1) if (ordered[index] < ordered[index - 1]) fail("artifact-timeline-invalid");
  for (const grant of value.grants) {
    const issued = Date.parse(grant.issuedAt);
    if (issued < start || issued > end) fail("artifact-timeline-invalid");
    if (!value.scan || issued < Date.parse(value.scan.scannedAt)) fail("artifact-timeline-invalid");
    if (grant.consumedAt && (Date.parse(grant.consumedAt) < issued || Date.parse(grant.consumedAt) > end)) fail("artifact-timeline-invalid");
    if (grant.revokedAt && (Date.parse(grant.revokedAt) < issued || Date.parse(grant.revokedAt) > end)) fail("artifact-timeline-invalid");
  }
}

function next(artifact, changes, timestamp) {
  return validateArtifactRecord({ ...artifact, ...changes, revision: artifact.revision + 1, updatedAt: timestamp });
}

function sameReceipt(stored, input) {
  return stored.observedName === input.observedName
    && stored.observedMimeType === input.observedMimeType
    && stored.observedSizeBytes === input.observedSizeBytes
    && stored.observedSha256 === input.observedSha256;
}

function expectStatus(artifact, expected) {
  if (artifact.status !== expected) fail("artifact-transition-invalid");
}

function retentionSeconds(record) {
  return (Date.parse(record.retentionExpiresAt) - Date.parse(record.createdAt)) / 1000;
}

function artifactId(value) {
  return `art_${digest(`${value.taskId}\n${value.idempotencyKey}\n${value.file.sha256}`).slice(0, 40)}`;
}

function safeFilename(value) {
  if (typeof value !== "string" || value !== value.normalize("NFC") || value.length < 3 || value.length > 128
    || Buffer.byteLength(value, "utf8") > 160 || value !== value.trim() || !SAFE_FILE.test(value)
    || value.includes("..") || value.includes("/") || value.includes("\\") || /[. ]$/.test(value)
    || WINDOWS_RESERVED.test(value) || FORBIDDEN_SECRET.test(value)) fail("artifact-filename-invalid");
  return value;
}

function normalizeMime(value) {
  if (typeof value !== "string" || value !== value.toLowerCase() || !Object.hasOwn(ARTIFACT_MIME_POLICY, value)) fail("artifact-mime-not-allowed");
  return value;
}

function requireExtension(name, mimeType) {
  const lower = name.toLowerCase();
  if (!ARTIFACT_MIME_POLICY[mimeType].extensions.some((extension) => lower.endsWith(extension))) fail("artifact-extension-mime-mismatch");
}

function size(value, mimeType) {
  if (!Number.isSafeInteger(value) || value < 1 || value > ARTIFACT_GLOBAL_MAX_BYTES
    || value > ARTIFACT_MIME_POLICY[mimeType].maxBytes) fail("artifact-size-invalid");
  return value;
}

function token(value, maximum, error) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || !TOKEN.test(value)
    || FORBIDDEN_SECRET.test(value)) fail(error);
  return value;
}

function code(value, error) {
  if (typeof value !== "string" || value.length < 1 || value.length > 64 || !CODE.test(value)) fail(error);
  return value;
}

function hash(value, error) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function transitionTime(record, value) {
  const timestamp = normalizedTime(value, "artifact-time-invalid");
  if (Date.parse(timestamp) < Date.parse(record.updatedAt)) fail("artifact-timeline-invalid");
  return timestamp;
}

function normalizedTime(value, error) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(error);
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(error);
  return normalized;
}

function addSeconds(timestamp, seconds) {
  return new Date(Date.parse(timestamp) + seconds * 1000).toISOString();
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}-invalid`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label}-field-not-allowed:${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}-field-missing:${key}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code) {
  throw new ArtifactContractError(code);
}

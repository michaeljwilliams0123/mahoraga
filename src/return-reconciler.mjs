import { createHash } from "node:crypto";
import { validateCodexCloudReturn, validateCodexCloudTask } from "./codex-cloud-contract.mjs";
import { COORDINATION_PRIVACY, pathAllowed } from "./coordination-records.mjs";

const EVIDENCE_KEYS = new Set([
  "schemaVersion", "repository", "issueNumber", "pullRequestNumber", "baseCommit",
  "currentBaseCommit", "headCommit", "changedFiles", "pullRequestState", "mergeability",
  "verification", "observedAt",
]);
const CHECK_KEYS = new Set(["command", "status", "exitCode", "headCommit", "evidenceSha256"]);
const RECEIPT_KEYS = new Set([
  "schemaVersion", "receiptId", "taskId", "idempotencyKey", "repository", "taskFingerprint",
  "returnFingerprint", "evidenceFingerprint", "issueNumber", "pullRequestNumber", "baseCommit",
  "headCommit", "integrationMode", "readiness", "terminal", "changedFileCount",
  "changedFilesSha256", "verificationCount", "verificationSha256", "observedAt", "privacy",
]);
const PRIVACY_KEYS = new Set(["chatAccess", "conversationTranscriptIncluded", "credentialsIncluded", "contentBoundary"]);
const CHECK_STATES = new Set(["passed", "failed"]);
const PR_STATES = new Set(["open", "closed"]);
const MERGEABILITY_STATES = new Set(["mergeable", "conflicting", "unknown"]);
const TERMINAL_READINESS = new Set(["blocked", "ready-for-review", "ready-to-merge"]);
const ALL_READINESS = new Set([...TERMINAL_READINESS, "awaiting-mergeability"]);
const SECRET_PATTERN = /(?:\bsk-[A-Za-z0-9_-]{16,}|\bgithub_pat_[A-Za-z0-9_]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+eyJ[A-Za-z0-9_-]{8,})/;

export const RETURN_READINESS = Object.freeze({
  BLOCKED: "blocked",
  AWAITING_MERGEABILITY: "awaiting-mergeability",
  READY_FOR_REVIEW: "ready-for-review",
  READY_TO_MERGE: "ready-to-merge",
});

export class ReturnReconciliationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = "ReturnReconciliationError";
    this.code = code;
  }
}

/**
 * Reconcile a terminal Codex return against independently observed repository evidence.
 * The function has no I/O; callers must obtain the observation separately.
 */
export function reconcileCodexCloudReturn(taskRecord, returnRecord, evidenceRecord, { previousReceipt = null } = {}) {
  const task = validateCodexCloudTask(taskRecord);
  const returned = validateCodexCloudReturn(returnRecord, task);
  const evidence = validateReturnEvidence(evidenceRecord);
  const taskFingerprint = digest(task);
  const returnFingerprint = digest(returned);

  assertImmutableLinkage(task, returned, evidence);

  const factualEvidence = evidenceForFingerprint(evidence);
  const evidenceFingerprint = digest(factualEvidence);
  if (previousReceipt !== null) {
    const prior = validateReturnReconciliationReceipt(previousReceipt);
    if (prior.taskId !== task.taskId || prior.idempotencyKey !== task.idempotencyKey || prior.repository !== task.repository) {
      fail("PREVIOUS_RECEIPT_MISMATCH", "The prior receipt belongs to a different task.");
    }
    if (prior.taskFingerprint !== taskFingerprint) {
      fail("IMMUTABLE_TASK_CONFLICT", "The task differs from the task bound to the prior receipt.");
    }
    if (prior.returnFingerprint !== returnFingerprint) {
      fail(prior.terminal ? "TERMINAL_CONFLICT" : "RETURN_CONFLICT", "A different return already exists for this task.");
    }
    if (prior.evidenceFingerprint === evidenceFingerprint) return prior;
    if (prior.terminal) {
      fail("TERMINAL_CONFLICT", "Terminal reconciliation evidence cannot be replaced.");
    }
    if (prior.readiness !== RETURN_READINESS.AWAITING_MERGEABILITY) {
      fail("RETURN_CONFLICT", "Only a pending mergeability observation may be reconciled again.");
    }
    if (prior.changedFilesSha256 !== changedFilesDigest(evidence) ||
        prior.verificationSha256 !== verificationDigest(evidence)) {
      fail("RETURN_CONFLICT", "A pending observation may update mergeability, but not the observed diff or verification evidence.");
    }
  }

  let readiness;
  if (returned.state === "blocked") {
    assertBlockedReturn(returned, evidence);
    readiness = RETURN_READINESS.BLOCKED;
  } else {
    assertCompletedReturn(task, returned, evidence);
    if (evidence.mergeability === "unknown") {
      readiness = RETURN_READINESS.AWAITING_MERGEABILITY;
    } else if (task.integrationMode === "merge-after-verify") {
      readiness = RETURN_READINESS.READY_TO_MERGE;
    } else {
      readiness = RETURN_READINESS.READY_FOR_REVIEW;
    }
  }

  return createContentFreeReceipt({
    task,
    returned,
    evidence,
    taskFingerprint,
    returnFingerprint,
    evidenceFingerprint,
    readiness,
  });
}

export function validateReturnEvidence(record) {
  exact(record, EVIDENCE_KEYS, "Return evidence");
  if (record.schemaVersion !== 1) fail("INVALID_EVIDENCE", "Return evidence schema version is invalid.");
  repository(record.repository, "Return evidence repository");
  positiveInteger(record.issueNumber, "Return evidence issue number");
  nullablePositiveInteger(record.pullRequestNumber, "Return evidence pull request number");
  commit(record.baseCommit, "Return evidence base commit");
  commit(record.currentBaseCommit, "Return evidence current base commit");
  nullableCommit(record.headCommit, "Return evidence head commit");
  paths(record.changedFiles, 256, "Return evidence changed files", true);
  if (record.pullRequestState !== null && !PR_STATES.has(record.pullRequestState)) {
    fail("INVALID_EVIDENCE", "Return evidence pull request state is invalid.");
  }
  if (record.mergeability !== null && !MERGEABILITY_STATES.has(record.mergeability)) {
    fail("INVALID_EVIDENCE", "Return evidence mergeability is invalid.");
  }
  if (!Array.isArray(record.verification) || record.verification.length > 20) {
    fail("INVALID_EVIDENCE", "Return verification evidence is invalid.");
  }
  const commands = new Set();
  const verification = record.verification.map((item) => {
    exact(item, CHECK_KEYS, "Return verification evidence");
    bounded(item.command, 300, "Return verification command");
    if (SECRET_PATTERN.test(item.command)) fail("CREDENTIAL_CONTENT", "Return evidence cannot contain credentials or tokens.");
    if (!CHECK_STATES.has(item.status)) fail("INVALID_EVIDENCE", "Return verification status is invalid.");
    if (!Number.isSafeInteger(item.exitCode) || item.exitCode < 0 || item.exitCode > 255) {
      fail("INVALID_EVIDENCE", "Return verification exit code is invalid.");
    }
    commit(item.headCommit, "Return verification head commit");
    sha256(item.evidenceSha256, "Return verification digest");
    if (commands.has(item.command)) fail("DUPLICATE_VERIFICATION", `Duplicate verification evidence: ${item.command}`);
    commands.add(item.command);
    return Object.freeze({
      command: item.command,
      status: item.status,
      exitCode: item.exitCode,
      headCommit: item.headCommit.toLowerCase(),
      evidenceSha256: item.evidenceSha256,
    });
  });
  canonicalTimestamp(record.observedAt, "Return evidence observation time");

  const hasPullRequest = record.pullRequestNumber !== null;
  if (hasPullRequest !== (record.headCommit !== null) || hasPullRequest !== (record.pullRequestState !== null) ||
      hasPullRequest !== (record.mergeability !== null)) {
    fail("INVALID_EVIDENCE", "Return evidence pull request fields must be present or absent together.");
  }
  if (!hasPullRequest && (record.changedFiles.length !== 0 || verification.length !== 0)) {
    fail("INVALID_EVIDENCE", "Return evidence without a pull request cannot claim files or checks.");
  }

  return Object.freeze({
    schemaVersion: 1,
    repository: record.repository,
    issueNumber: record.issueNumber,
    pullRequestNumber: record.pullRequestNumber,
    baseCommit: record.baseCommit.toLowerCase(),
    currentBaseCommit: record.currentBaseCommit.toLowerCase(),
    headCommit: record.headCommit?.toLowerCase() ?? null,
    changedFiles: Object.freeze([...record.changedFiles]),
    pullRequestState: record.pullRequestState,
    mergeability: record.mergeability,
    verification: Object.freeze(verification),
    observedAt: record.observedAt,
  });
}

export function validateReturnReconciliationReceipt(record, { taskRecord = null, returnRecord = null } = {}) {
  exact(record, RECEIPT_KEYS, "Return reconciliation receipt");
  if (record.schemaVersion !== 1) fail("INVALID_RECEIPT", "Return reconciliation receipt schema version is invalid.");
  receiptId(record.receiptId);
  taskId(record.taskId);
  idempotencyKey(record.idempotencyKey);
  repository(record.repository, "Return reconciliation repository");
  sha256(record.taskFingerprint, "Return reconciliation task fingerprint");
  sha256(record.returnFingerprint, "Return reconciliation return fingerprint");
  sha256(record.evidenceFingerprint, "Return reconciliation evidence fingerprint");
  positiveInteger(record.issueNumber, "Return reconciliation issue number");
  nullablePositiveInteger(record.pullRequestNumber, "Return reconciliation pull request number");
  commit(record.baseCommit, "Return reconciliation base commit");
  nullableCommit(record.headCommit, "Return reconciliation head commit");
  if (record.integrationMode !== "pull-request" && record.integrationMode !== "merge-after-verify") {
    fail("INVALID_RECEIPT", "Return reconciliation integration mode is invalid.");
  }
  if (!ALL_READINESS.has(record.readiness)) fail("INVALID_RECEIPT", "Return reconciliation readiness is invalid.");
  if (record.terminal !== TERMINAL_READINESS.has(record.readiness)) {
    fail("INVALID_RECEIPT", "Return reconciliation terminal flag is invalid.");
  }
  nonnegativeInteger(record.changedFileCount, 256, "Return reconciliation changed-file count");
  sha256(record.changedFilesSha256, "Return reconciliation changed-files digest");
  nonnegativeInteger(record.verificationCount, 20, "Return reconciliation verification count");
  sha256(record.verificationSha256, "Return reconciliation verification digest");
  canonicalTimestamp(record.observedAt, "Return reconciliation observation time");
  privacy(record.privacy);

  if (record.readiness === RETURN_READINESS.BLOCKED) {
    if (record.pullRequestNumber !== null || record.headCommit !== null || record.changedFileCount !== 0 || record.verificationCount !== 0) {
      fail("INVALID_RECEIPT", "A blocked reconciliation receipt cannot claim pull request evidence.");
    }
  } else if (record.pullRequestNumber === null || record.headCommit === null || record.changedFileCount < 1 || record.verificationCount < 1) {
    fail("INVALID_RECEIPT", "A completed reconciliation receipt requires bounded pull request evidence.");
  }

  const identity = receiptIdentity(record);
  if (record.receiptId !== `rr-${digest(identity)}`) fail("INVALID_RECEIPT", "Return reconciliation receipt ID is invalid.");

  if (taskRecord !== null) {
    const task = validateCodexCloudTask(taskRecord);
    if (record.taskId !== task.taskId || record.idempotencyKey !== task.idempotencyKey ||
        record.repository !== task.repository || record.baseCommit !== task.baseCommit ||
        record.integrationMode !== task.integrationMode || record.taskFingerprint !== digest(task)) {
      fail("RECEIPT_TASK_MISMATCH", "Return reconciliation receipt does not match its immutable task.");
    }
  }
  if (returnRecord !== null) {
    const returned = validateCodexCloudReturn(returnRecord, taskRecord);
    if (record.taskId !== returned.taskId || record.issueNumber !== returned.issueNumber ||
        record.pullRequestNumber !== returned.pullRequestNumber || record.baseCommit !== returned.baseCommit ||
        record.headCommit !== returned.headCommit || record.returnFingerprint !== digest(returned)) {
      fail("RECEIPT_RETURN_MISMATCH", "Return reconciliation receipt does not match its immutable return.");
    }
  }

  return Object.freeze({
    ...record,
    privacy: Object.freeze({ ...record.privacy }),
  });
}

function assertImmutableLinkage(task, returned, evidence) {
  if (evidence.repository !== task.repository) fail("REPOSITORY_MISMATCH", "Return evidence is for a different repository.");
  if (evidence.issueNumber !== returned.issueNumber) fail("ISSUE_MISMATCH", "Return evidence is for a different issue.");
  if (evidence.baseCommit !== task.baseCommit || returned.baseCommit !== task.baseCommit) {
    fail("BASE_MISMATCH", "The task, return, and observed pull request base commits do not match.");
  }
  if (returned.state === "completed") {
    if (evidence.pullRequestNumber !== returned.pullRequestNumber) fail("PULL_REQUEST_MISMATCH", "Return evidence is for a different pull request.");
    if (evidence.headCommit !== returned.headCommit) fail("HEAD_MISMATCH", "The returned and observed head commits do not match.");
  }
}

function assertBlockedReturn(returned, evidence) {
  if (returned.pullRequestNumber !== null || returned.headCommit !== null || returned.changedFiles.length !== 0 ||
      evidence.pullRequestNumber !== null) {
    fail("BLOCKED_RETURN_CONFLICT", "A blocked return cannot claim pull request changes.");
  }
}

function assertCompletedReturn(task, returned, evidence) {
  if (evidence.currentBaseCommit !== task.baseCommit) {
    fail("STALE_BASE", "The target branch advanced after this task was created; the return must be refreshed.");
  }
  if (returned.headCommit === returned.baseCommit) fail("EMPTY_HEAD", "The return head commit cannot equal its base commit.");
  if (returned.changedFiles.length < 1 || evidence.changedFiles.length < 1) {
    fail("EMPTY_RETURN", "A completed return must contain at least one changed file.");
  }
  for (const file of evidence.changedFiles) {
    if (!pathAllowed(file, task.allowedPaths)) fail("OUT_OF_SCOPE", `Observed changed file is outside task scope: ${file}`);
  }
  const claimed = [...returned.changedFiles].sort();
  const actual = [...evidence.changedFiles].sort();
  if (claimed.length !== actual.length || claimed.some((file, index) => file !== actual[index])) {
    fail("DIFF_MISMATCH", "Returned changed files do not match the observed pull request diff.");
  }
  if (evidence.pullRequestState !== "open") {
    fail("CLOSED_RETURN", "A closed, unmerged pull request is not eligible for reconciliation.");
  }
  if (evidence.mergeability === "conflicting") {
    fail("MERGE_CONFLICT", "The pull request conflicts with its target branch.");
  }
  assertVerification(task, returned, evidence);
}

function assertVerification(task, returned, evidence) {
  if (evidence.verification.length !== task.verification.length) {
    fail("VERIFICATION_SET_MISMATCH", "Verification evidence must match every required command exactly.");
  }
  const checks = new Map(evidence.verification.map((item) => [item.command, item]));
  for (const command of task.verification) {
    const check = checks.get(command);
    if (!check) fail("MISSING_VERIFICATION", `Required verification evidence is missing: ${command}`);
    if (check.headCommit !== returned.headCommit) {
      fail("STALE_VERIFICATION", `Verification was not executed against the returned head commit: ${command}`);
    }
    if (check.status !== "passed" || check.exitCode !== 0) {
      fail("VERIFICATION_FAILED", `Required verification did not pass: ${command}`);
    }
  }
}

function createContentFreeReceipt({ task, returned, evidence, taskFingerprint, returnFingerprint, evidenceFingerprint, readiness }) {
  const changedFiles = [...evidence.changedFiles].sort();
  const verification = normalizedVerification(evidence);
  const receipt = {
    schemaVersion: 1,
    receiptId: "",
    taskId: task.taskId,
    idempotencyKey: task.idempotencyKey,
    repository: task.repository,
    taskFingerprint,
    returnFingerprint,
    evidenceFingerprint,
    issueNumber: returned.issueNumber,
    pullRequestNumber: returned.pullRequestNumber,
    baseCommit: returned.baseCommit,
    headCommit: returned.headCommit,
    integrationMode: task.integrationMode,
    readiness,
    terminal: TERMINAL_READINESS.has(readiness),
    changedFileCount: changedFiles.length,
    changedFilesSha256: digest(changedFiles),
    verificationCount: verification.length,
    verificationSha256: digest(verification),
    observedAt: evidence.observedAt,
    privacy: { ...COORDINATION_PRIVACY },
  };
  receipt.receiptId = `rr-${digest(receiptIdentity(receipt))}`;
  return validateReturnReconciliationReceipt(receipt, { taskRecord: task, returnRecord: returned });
}

function changedFilesDigest(evidence) {
  return digest([...evidence.changedFiles].sort());
}

function verificationDigest(evidence) {
  return digest(normalizedVerification(evidence));
}

function normalizedVerification(evidence) {
  return [...evidence.verification]
    .map(({ command, status, exitCode, headCommit, evidenceSha256 }) => ({ command, status, exitCode, headCommit, evidenceSha256 }))
    .sort((a, b) => a.command.localeCompare(b.command));
}

function evidenceForFingerprint(evidence) {
  return {
    schemaVersion: evidence.schemaVersion,
    repository: evidence.repository,
    issueNumber: evidence.issueNumber,
    pullRequestNumber: evidence.pullRequestNumber,
    baseCommit: evidence.baseCommit,
    currentBaseCommit: evidence.currentBaseCommit,
    headCommit: evidence.headCommit,
    changedFiles: [...evidence.changedFiles].sort(),
    pullRequestState: evidence.pullRequestState,
    mergeability: evidence.mergeability,
    verification: [...evidence.verification].sort((a, b) => a.command.localeCompare(b.command)),
  };
}

function receiptIdentity(record) {
  return {
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    idempotencyKey: record.idempotencyKey,
    repository: record.repository,
    taskFingerprint: record.taskFingerprint,
    returnFingerprint: record.returnFingerprint,
    evidenceFingerprint: record.evidenceFingerprint,
    issueNumber: record.issueNumber,
    pullRequestNumber: record.pullRequestNumber,
    baseCommit: record.baseCommit,
    headCommit: record.headCommit,
    integrationMode: record.integrationMode,
    readiness: record.readiness,
    terminal: record.terminal,
    changedFileCount: record.changedFileCount,
    changedFilesSha256: record.changedFilesSha256,
    verificationCount: record.verificationCount,
    verificationSha256: record.verificationSha256,
  };
}

function digest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_RECORD", `${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail("INVALID_RECORD", `${label} field is not allowed: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail("INVALID_RECORD", `${label} field is missing: ${key}`);
}

function privacy(value) {
  exact(value, PRIVACY_KEYS, "Return reconciliation privacy boundary");
  if (value.chatAccess !== false || value.conversationTranscriptIncluded !== false || value.credentialsIncluded !== false ||
      value.contentBoundary !== COORDINATION_PRIVACY.contentBoundary) {
    fail("INVALID_RECEIPT", "Return reconciliation privacy boundary is invalid.");
  }
}

function repository(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ||
      value.split("/").some((item) => item === "." || item === "..")) fail("INVALID_EVIDENCE", `${label} is invalid.`);
}

function taskId(value) {
  if (typeof value !== "string" || !/^ccx-[a-f0-9-]{8,72}$/i.test(value)) fail("INVALID_RECEIPT", "Return reconciliation task ID is invalid.");
}

function idempotencyKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) {
    fail("INVALID_RECEIPT", "Return reconciliation idempotency key is invalid.");
  }
}

function receiptId(value) {
  if (typeof value !== "string" || !/^rr-[a-f0-9]{64}$/.test(value)) fail("INVALID_RECEIPT", "Return reconciliation receipt ID is invalid.");
}

function commit(value, label) {
  if (typeof value !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) fail("INVALID_EVIDENCE", `${label} is invalid.`);
}

function nullableCommit(value, label) {
  if (value !== null) commit(value, label);
}

function sha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("INVALID_EVIDENCE", `${label} is invalid.`);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail("INVALID_EVIDENCE", `${label} is invalid.`);
}

function nullablePositiveInteger(value, label) {
  if (value !== null) positiveInteger(value, label);
}

function nonnegativeInteger(value, maximum, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail("INVALID_RECEIPT", `${label} is invalid.`);
}

function bounded(value, maximum, label) {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum || /[\r\n\0]/.test(value)) {
    fail("INVALID_EVIDENCE", `${label} is invalid.`);
  }
}

function paths(value, maximum, label, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > maximum || new Set(value).size !== value.length) {
    fail("INVALID_EVIDENCE", `${label} are invalid.`);
  }
  value.forEach((item) => safePath(item, label));
}

function safePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.startsWith("/") || value.startsWith("\\") ||
      value.includes("\\") || /[\r\n\0]/.test(value) || !/^[A-Za-z0-9._/-]+$/.test(value)) {
    fail("INVALID_EVIDENCE", `${label} are invalid.`);
  }
  const segments = value.split("/");
  if (segments.some((item) => !item || item === "." || item === "..") || segments[0].toLowerCase() === ".git") {
    fail("INVALID_EVIDENCE", `${label} are invalid.`);
  }
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("INVALID_EVIDENCE", `${label} is invalid.`);
  }
}

function fail(code, message) {
  throw new ReturnReconciliationError(code, message);
}

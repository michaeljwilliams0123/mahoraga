import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createCodexCloudReturn, createCodexCloudTask } from "../src/codex-cloud-contract.mjs";
import {
  RETURN_READINESS,
  reconcileCodexCloudReturn,
  validateReturnEvidence,
  validateReturnReconciliationReceipt,
} from "../src/return-reconciler.mjs";

const BASE = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";
const OTHER = "3333333333333333333333333333333333333333";
const WHEN = "2026-08-24T16:00:00.000Z";
const sha = (value) => createHash("sha256").update(value).digest("hex");

function fixture({ integrationMode = "merge-after-verify", checks = ["npm test", "npm run lint"] } = {}) {
  const task = createCodexCloudTask({
    idempotencyKey: "return-reconciliation-v1",
    repository: "example/mahoraga",
    baseCommit: BASE,
    title: "Reconcile a bounded return",
    task: "Implement the scoped change and return independently verifiable repository evidence.",
    allowedPaths: ["src/return-reconciler.mjs", "test"],
    verification: checks,
    maximumAttempts: 2,
    integrationMode,
  }, { taskId: "ccx-12345678-1234-1234-1234-123456789abc", now: "2026-08-24T15:00:00.000Z" });
  const returned = createCodexCloudReturn(task, {
    issueNumber: 41,
    pullRequestNumber: 42,
    headCommit: HEAD,
    changedFiles: ["src/return-reconciler.mjs", "test/return-reconciler.test.mjs"],
    verification: ["npm test passed", "npm run lint passed"],
    summary: "Implemented the return reconciler without storing repository content in its receipt.",
  }, { now: "2026-08-24T15:30:00.000Z" });
  const evidence = {
    schemaVersion: 1,
    repository: task.repository,
    issueNumber: returned.issueNumber,
    pullRequestNumber: returned.pullRequestNumber,
    baseCommit: BASE,
    currentBaseCommit: BASE,
    headCommit: HEAD,
    changedFiles: [...returned.changedFiles],
    pullRequestState: "open",
    mergeability: "mergeable",
    verification: checks.map((command, index) => ({
      command,
      status: "passed",
      exitCode: 0,
      headCommit: HEAD,
      evidenceSha256: sha(`${command}:${index}`),
    })),
    observedAt: WHEN,
  };
  return { task, returned, evidence };
}

function errorCode(code) {
  return (error) => error?.code === code;
}

test("verified merge-after-verify returns become content-free ready-to-merge receipts", () => {
  const { task, returned, evidence } = fixture();
  const receipt = reconcileCodexCloudReturn(task, returned, evidence);
  assert.equal(receipt.readiness, RETURN_READINESS.READY_TO_MERGE);
  assert.equal(receipt.terminal, true);
  assert.equal(receipt.changedFileCount, 2);
  assert.equal(receipt.verificationCount, 2);
  assert.match(receipt.receiptId, /^rr-[a-f0-9]{64}$/);
  assert.deepEqual(validateReturnReconciliationReceipt(receipt, { taskRecord: task, returnRecord: returned }), receipt);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /return-reconciler\.mjs|npm test|Implemented the return|passed/);
  assert.equal(Object.hasOwn(receipt, "summary"), false);
  assert.equal(Object.hasOwn(receipt, "verification"), false);
  assert.equal(receipt.privacy.chatAccess, false);
});

test("pull-request integration stops at ready-for-review", () => {
  const { task, returned, evidence } = fixture({ integrationMode: "pull-request" });
  const receipt = reconcileCodexCloudReturn(task, returned, evidence);
  assert.equal(receipt.readiness, RETURN_READINESS.READY_FOR_REVIEW);
  assert.equal(receipt.terminal, true);
});

test("unknown mergeability is retryable and a later clean observation can become terminal", () => {
  const { task, returned, evidence } = fixture();
  const pending = reconcileCodexCloudReturn(task, returned, { ...evidence, mergeability: "unknown" });
  assert.equal(pending.readiness, RETURN_READINESS.AWAITING_MERGEABILITY);
  assert.equal(pending.terminal, false);
  const ready = reconcileCodexCloudReturn(task, returned, { ...evidence, observedAt: "2026-08-24T16:01:00.000Z" }, { previousReceipt: pending });
  assert.equal(ready.readiness, RETURN_READINESS.READY_TO_MERGE);
  assert.equal(ready.terminal, true);
});

test("a pending observation cannot substitute different diff or verification facts", () => {
  const { task, returned, evidence } = fixture();
  const pending = reconcileCodexCloudReturn(task, returned, { ...evidence, mergeability: "unknown" });
  const substituted = {
    ...evidence,
    verification: evidence.verification.map((check, index) => index ? check : { ...check, evidenceSha256: sha("substituted") }),
    observedAt: "2026-08-24T16:02:00.000Z",
  };
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, substituted, { previousReceipt: pending }),
    errorCode("RETURN_CONFLICT"),
  );
});

test("identical evidence is idempotent even when its observation timestamp changes", () => {
  const { task, returned, evidence } = fixture();
  const first = reconcileCodexCloudReturn(task, returned, evidence);
  const repeated = reconcileCodexCloudReturn(task, returned, { ...evidence, observedAt: "2026-08-24T17:00:00.000Z" }, { previousReceipt: first });
  assert.deepEqual(repeated, first);
  assert.equal(repeated.receiptId, first.receiptId);
  assert.equal(repeated.observedAt, WHEN);
});

test("evidence ordering does not create a false terminal conflict", () => {
  const { task, returned, evidence } = fixture();
  const first = reconcileCodexCloudReturn(task, returned, evidence);
  const reordered = {
    ...evidence,
    changedFiles: [...evidence.changedFiles].reverse(),
    verification: [...evidence.verification].reverse(),
    observedAt: "2026-08-24T17:00:00.000Z",
  };
  assert.deepEqual(reconcileCodexCloudReturn(task, returned, reordered, { previousReceipt: first }), first);
});

test("terminal receipts reject replacement returns and changed evidence", () => {
  const { task, returned, evidence } = fixture();
  const receipt = reconcileCodexCloudReturn(task, returned, evidence);
  const conflictingReturn = { ...returned, headCommit: OTHER };
  const conflictingEvidence = {
    ...evidence,
    headCommit: OTHER,
    verification: evidence.verification.map((check) => ({ ...check, headCommit: OTHER })),
  };
  assert.throws(
    () => reconcileCodexCloudReturn(task, conflictingReturn, conflictingEvidence, { previousReceipt: receipt }),
    errorCode("TERMINAL_CONFLICT"),
  );
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, mergeability: "unknown" }, { previousReceipt: receipt }),
    errorCode("TERMINAL_CONFLICT"),
  );
});

test("immutable issue, pull request, repository, base, and head linkage is enforced", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, repository: "example/other" }), errorCode("REPOSITORY_MISMATCH"));
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, issueNumber: 99 }), errorCode("ISSUE_MISMATCH"));
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, pullRequestNumber: 99 }), errorCode("PULL_REQUEST_MISMATCH"));
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, baseCommit: OTHER }), errorCode("BASE_MISMATCH"));
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, headCommit: OTHER }), errorCode("HEAD_MISMATCH"));
  assert.throws(() => reconcileCodexCloudReturn(task, { ...returned, idempotencyKey: "different-key" }, evidence), /does not match its task/);
});

test("stale target branches and empty heads are rejected", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, currentBaseCommit: OTHER }), errorCode("STALE_BASE"));
  const sameHead = { ...returned, headCommit: BASE };
  const sameHeadEvidence = {
    ...evidence,
    headCommit: BASE,
    verification: evidence.verification.map((check) => ({ ...check, headCommit: BASE })),
  };
  assert.throws(() => reconcileCodexCloudReturn(task, sameHead, sameHeadEvidence), errorCode("EMPTY_HEAD"));
});

test("actual paths must be safe, allowed, and identical to the claimed diff", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, changedFiles: ["src/return-reconciler.mjs", "testing/escape.mjs"] }),
    errorCode("OUT_OF_SCOPE"),
  );
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, changedFiles: ["src/return-reconciler.mjs"] }),
    errorCode("DIFF_MISMATCH"),
  );
  assert.throws(() => validateReturnEvidence({ ...evidence, changedFiles: ["test/../secrets.txt"] }), /changed files are invalid/);
  assert.throws(() => validateReturnEvidence({ ...evidence, changedFiles: [".git/config"] }), /changed files are invalid/);
  assert.throws(() => validateReturnEvidence({ ...evidence, changedFiles: ["test\\escape.mjs"] }), /changed files are invalid/);
});

test("verification evidence must be exact, unique, successful, and bound to the head", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, verification: evidence.verification.slice(0, 1) }), errorCode("VERIFICATION_SET_MISMATCH"));
  assert.throws(
    () => validateReturnEvidence({ ...evidence, verification: [evidence.verification[0], evidence.verification[0]] }),
    errorCode("DUPLICATE_VERIFICATION"),
  );
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, verification: evidence.verification.map((check, index) => index ? check : { ...check, status: "failed", exitCode: 1 }) }),
    errorCode("VERIFICATION_FAILED"),
  );
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, verification: evidence.verification.map((check, index) => index ? check : { ...check, headCommit: OTHER }) }),
    errorCode("STALE_VERIFICATION"),
  );
  assert.throws(
    () => reconcileCodexCloudReturn(task, returned, { ...evidence, verification: [...evidence.verification, { ...evidence.verification[0], command: "npm audit" }] }),
    errorCode("VERIFICATION_SET_MISMATCH"),
  );
  assert.throws(() => validateReturnEvidence({ ...evidence, verification: [{ ...evidence.verification[0], output: "secret build log" }] }), /field is not allowed/);
  assert.throws(() => validateReturnEvidence({ ...evidence, verification: [{ ...evidence.verification[0], evidenceSha256: "0".repeat(63) }] }), /digest is invalid/);
  assert.throws(
    () => validateReturnEvidence({ ...evidence, verification: [{ ...evidence.verification[0], command: "curl -H 'Authorization: Bearer eyJ1234567890abcdef'" }] }),
    errorCode("CREDENTIAL_CONTENT"),
  );
});

test("closed and conflicting pull requests cannot become merge ready", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, pullRequestState: "closed" }), errorCode("CLOSED_RETURN"));
  assert.throws(() => reconcileCodexCloudReturn(task, returned, { ...evidence, mergeability: "conflicting" }), errorCode("MERGE_CONFLICT"));
});

test("blocked returns produce terminal receipts without fabricated change evidence", () => {
  const { task } = fixture();
  const returned = createCodexCloudReturn(task, {
    state: "blocked",
    issueNumber: 41,
    summary: "The required repository permission is unavailable.",
    verification: ["No repository mutation attempted"],
  }, { now: "2026-08-24T15:30:00.000Z" });
  const evidence = {
    schemaVersion: 1,
    repository: task.repository,
    issueNumber: 41,
    pullRequestNumber: null,
    baseCommit: BASE,
    currentBaseCommit: OTHER,
    headCommit: null,
    changedFiles: [],
    pullRequestState: null,
    mergeability: null,
    verification: [],
    observedAt: WHEN,
  };
  const receipt = reconcileCodexCloudReturn(task, returned, evidence);
  assert.equal(receipt.readiness, RETURN_READINESS.BLOCKED);
  assert.equal(receipt.terminal, true);
  assert.equal(receipt.pullRequestNumber, null);
  assert.equal(receipt.changedFileCount, 0);
  assert.equal(receipt.verificationCount, 0);
  assert.doesNotMatch(JSON.stringify(receipt), /required repository permission/);
  assert.throws(
    () => reconcileCodexCloudReturn(task, { ...returned, changedFiles: ["src/return-reconciler.mjs"] }, evidence),
    errorCode("BLOCKED_RETURN_CONFLICT"),
  );
});

test("evidence and receipt schemas reject injected content and tampering", () => {
  const { task, returned, evidence } = fixture();
  assert.throws(() => validateReturnEvidence({ ...evidence, modelResponse: "private content" }), /field is not allowed/);
  assert.throws(() => validateReturnEvidence({ ...evidence, observedAt: "August 24, 2026" }), /observation time is invalid/);
  assert.throws(() => validateReturnEvidence({ ...evidence, pullRequestNumber: null }), /fields must be present or absent together/);
  const receipt = reconcileCodexCloudReturn(task, returned, evidence);
  assert.throws(() => validateReturnReconciliationReceipt({ ...receipt, summary: "injected" }), /field is not allowed/);
  assert.throws(() => validateReturnReconciliationReceipt({ ...receipt, changedFileCount: 3 }), errorCode("INVALID_RECEIPT"));
  assert.throws(() => validateReturnReconciliationReceipt({ ...receipt, privacy: { ...receipt.privacy, chatAccess: true } }), errorCode("INVALID_RECEIPT"));
});

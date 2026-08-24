import test from "node:test";
import assert from "node:assert/strict";
import {
  RELAY_DELIVERY, RELAY_PROTOCOL_VERSION, cancelTask, completeTask, failTask, leaseTask,
  renewLease, submitTask, taskStatus, validateRelayTask,
} from "../src/task-relay-contract.mjs";

const T0 = "2026-08-24T12:00:00.000Z";
const T1 = "2026-08-24T12:00:30.000Z";
const T2 = "2026-08-24T12:02:00.000Z";
const submission = Object.freeze({
  idempotencyKey: "github-issue-42-v1",
  taskType: "repository.verify",
  repository: "MichaelJWilliams0123/Mahoraga",
  baseCommit: "A".repeat(40),
  allowedPaths: ["src/**", "test/**"],
  maxAttempts: 2,
  metadata: { integrationMode: "pull-request", issueNumber: 42, labels: ["relay", "verified"] },
});
const receipt = Object.freeze({ headCommit: "b".repeat(40), verificationDigest: "c".repeat(64), changedPaths: ["src/example.mjs"] });

test("3.0.1 submission is normalized, hash-bound, immutable, and at-least-once", () => {
  const result = submitTask([], submission, { now: T0 });
  assert.equal(result.created, true);
  assert.equal(result.task.protocolVersion, RELAY_PROTOCOL_VERSION);
  assert.deepEqual(result.task.delivery, RELAY_DELIVERY);
  assert.equal(result.task.request.repository, "michaeljwilliams0123/mahoraga");
  assert.equal(result.task.request.baseCommit, "a".repeat(40));
  assert.equal(Object.isFrozen(result.task.request.metadata), true);
  assert.equal(validateRelayTask(result.task).requestHash, result.task.requestHash);
  assert.throws(() => validateRelayTask({ ...result.task, request: { ...result.task.request, baseCommit: "d".repeat(40) } }), /relay-request-hash-mismatch/);
});

test("duplicate idempotency key with the same normalized request reuses one logical task", () => {
  const first = submitTask([], submission, { now: T0 });
  const duplicate = submitTask([first.task], { ...submission, repository: "michaeljwilliams0123/mahoraga", baseCommit: "a".repeat(40), allowedPaths: ["test/**", "src/**"] }, { now: T2 });
  assert.equal(duplicate.created, false);
  assert.deepEqual(duplicate.task, first.task);
});

test("duplicate idempotency key with a different request conflicts", () => {
  const first = submitTask([], submission, { now: T0 });
  assert.throws(() => submitTask([first.task], { ...submission, taskType: "repository.release" }, { now: T1 }), /relay-idempotency-conflict/);
});

test("expired leases can be reassigned only with a larger fencing token", () => {
  const task = submitTask([], submission, { now: T0 }).task;
  const first = leaseTask(task, { runnerId: "runner-a", leaseSeconds: 30 }, { now: T0 });
  assert.equal(first.fencingToken, 1);
  assert.equal(taskStatus(first, { now: T1 }).lease.expired, true);
  const second = leaseTask(first, { runnerId: "runner-b", leaseSeconds: 60 }, { now: T1 });
  assert.equal(second.fencingToken, 2);
  assert.equal(second.attemptCount, 2);
  assert.throws(() => completeTask(second, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T1 }), /relay-stale-fencing-token/);
  assert.throws(() => renewLease(second, { runnerId: "runner-a", fencingToken: 1, leaseSeconds: 60 }, { now: T1 }), /relay-stale-fencing-token/);
});

test("an active lease renews without changing its fencing token", () => {
  const task = submitTask([], submission, { now: T0 }).task;
  const leased = leaseTask(task, { runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
  const renewed = renewLease(leased, { runnerId: "runner-a", fencingToken: 1, leaseSeconds: 60 }, { now: T1 });
  assert.equal(renewed.fencingToken, 1);
  assert.equal(renewed.attemptCount, 1);
  assert.equal(renewed.lease.expiresAt, "2026-08-24T12:02:00.000Z");
});

test("an expired lease cannot renew or complete and bounded attempts stop reassignment", () => {
  let task = submitTask([], { ...submission, maxAttempts: 1 }, { now: T0 }).task;
  task = leaseTask(task, { runnerId: "runner-a", leaseSeconds: 30 }, { now: T0 });
  assert.throws(() => renewLease(task, { runnerId: "runner-a", fencingToken: 1, leaseSeconds: 30 }, { now: T1 }), /relay-lease-expired/);
  assert.throws(() => completeTask(task, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T1 }), /relay-lease-expired/);
  assert.throws(() => leaseTask(task, { runnerId: "runner-b", leaseSeconds: 30 }, { now: T1 }), /relay-attempt-limit-reached/);
});

test("completion replay is idempotent but altered replay cannot create a second effect", () => {
  const queued = submitTask([], submission, { now: T0 }).task;
  const leased = leaseTask(queued, { runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
  const completed = completeTask(leased, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T1 });
  assert.equal(completed.status, "succeeded");
  assert.deepEqual(completeTask(completed, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T2 }), completed);
  assert.throws(() => completeTask(completed, { runnerId: "runner-a", fencingToken: 1, receipt: { ...receipt, headCommit: "d".repeat(40) } }, { now: T2 }), /relay-completion-replay-conflict/);
});

test("retryable failure requeues, final failure terminates, and failure replay is safe", () => {
  const queued = submitTask([], submission, { now: T0 }).task;
  const firstLease = leaseTask(queued, { runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
  const retry = failTask(firstLease, { runnerId: "runner-a", fencingToken: 1, code: "verification.failed", retryable: true }, { now: T1 });
  assert.equal(retry.status, "queued");
  assert.deepEqual(failTask(retry, { runnerId: "runner-a", fencingToken: 1, code: "verification.failed", retryable: true }, { now: T2 }), retry);
  const secondLease = leaseTask(retry, { runnerId: "runner-b", leaseSeconds: 60 }, { now: T2 });
  const failed = failTask(secondLease, { runnerId: "runner-b", fencingToken: 2, code: "verification.failed", retryable: true }, { now: "2026-08-24T12:02:30.000Z" });
  assert.equal(failed.status, "failed");
  assert.throws(() => leaseTask(failed, { runnerId: "runner-c", leaseSeconds: 60 }, { now: "2026-08-24T12:03:00.000Z" }), /relay-task-terminal/);
});

test("cancellation revokes an active lease and rejects subsequent worker completion", () => {
  const queued = submitTask([], submission, { now: T0 }).task;
  const leased = leaseTask(queued, { runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
  const cancelled = cancelTask(leased, { reasonCode: "owner.cancelled" }, { now: T1 });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.lease, null);
  assert.deepEqual(cancelTask(cancelled, { reasonCode: "owner.cancelled" }, { now: T2 }), cancelled);
  assert.throws(() => completeTask(cancelled, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T1 }), /relay-stale-fencing-token/);
});

test("strict schemas reject extra fields, unsafe metadata, credentials, and response content", () => {
  assert.throws(() => submitTask([], { ...submission, unexpected: true }, { now: T0 }), /field-not-allowed/);
  assert.throws(() => submitTask([], { ...submission, metadata: { prompt: "do work" } }, { now: T0 }), /metadata-key-rejected/);
  assert.throws(() => submitTask([], { ...submission, metadata: { apiKey: `github_pat_${"x".repeat(40)}` } }, { now: T0 }), /metadata-key-rejected/);
  assert.throws(() => submitTask([], { ...submission, metadata: { correlationId: "password=do-not-store" } }, { now: T0 }), /metadata-value-rejected/);
  assert.throws(() => submitTask([], { ...submission, metadata: { modelResponse: "private output" } }, { now: T0 }), /metadata-key-rejected/);
});

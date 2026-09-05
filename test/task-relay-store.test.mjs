import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RELAY_PROTOCOL_VERSION } from "../src/task-relay-contract.mjs";
import { TaskRelayStore } from "../src/task-relay-store.mjs";

const T0 = "2026-08-24T12:00:00.000Z";
const T1 = "2026-08-24T12:00:30.000Z";
const T2 = "2026-08-24T12:02:00.000Z";
const submission = Object.freeze({
  idempotencyKey: "github-issue-32-v1",
  taskType: "repository.verify",
  repository: "michaeljwilliams0123/mahoraga",
  baseCommit: "a".repeat(40),
  allowedPaths: ["src/**", "test/**"],
  maxAttempts: 2,
  metadata: { integrationMode: "pull-request", issueNumber: 32 },
});
const receipt = Object.freeze({ headCommit: "b".repeat(40), verificationDigest: "c".repeat(64), changedPaths: ["src/task-relay-store.mjs"] });

function storeFile() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-relay-store-"));
  return { root, file: path.join(root, "relay.sqlite") };
}

test("durable submit is atomic, hash-bound, and idempotent across process restart", () => {
  const { root, file } = storeFile();
  try {
    const first = new TaskRelayStore(file);
    const created = first.submit(submission, { now: T0 });
    assert.equal(created.created, true);
    assert.equal(first.protocolVersion(), RELAY_PROTOCOL_VERSION);
    first.close();

    const restarted = new TaskRelayStore(file);
    const again = restarted.submit(submission, { now: T2 });
    assert.equal(again.created, false);
    assert.equal(again.task.taskId, created.task.taskId);
    assert.equal(restarted.getByIdempotencyKey(submission.idempotencyKey).requestHash, created.task.requestHash);
    assert.throws(() => restarted.submit({ ...submission, taskType: "repository.release" }, { now: T2 }), /relay-idempotency-conflict/);
    restarted.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lease acquisition is atomic and stale fencing tokens cannot complete", () => {
  const { root, file } = storeFile();
  try {
    const store = new TaskRelayStore(file);
    const queued = store.submit(submission, { now: T0 }).task;
    const leased = store.leaseQueued({ runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
    assert.equal(leased.taskId, queued.taskId);
    assert.equal(leased.fencingToken, 1);
    assert.equal(store.leaseQueued({ runnerId: "runner-b", leaseSeconds: 60 }, { now: T0 }), null);
    assert.throws(() => store.complete(queued.taskId, { runnerId: "runner-b", fencingToken: 1, receipt }, { now: T1 }), /relay-stale-fencing-token/);
    const completed = store.complete(queued.taskId, { runnerId: "runner-a", fencingToken: 1, receipt }, { now: T1 });
    assert.equal(completed.status, "succeeded");
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("expired leases reassign with a larger fencing token after restart", () => {
  const { root, file } = storeFile();
  try {
    let store = new TaskRelayStore(file);
    const queued = store.submit(submission, { now: T0 }).task;
    store.lease(queued.taskId, { runnerId: "runner-a", leaseSeconds: 30 }, { now: T0 });
    store.close();
    store = new TaskRelayStore(file);
    const reassigned = store.lease(queued.taskId, { runnerId: "runner-b", leaseSeconds: 60 }, { now: T1 });
    assert.equal(reassigned.fencingToken, 2);
    assert.throws(() => store.renew(queued.taskId, { runnerId: "runner-a", fencingToken: 1, leaseSeconds: 60 }, { now: T1 }), /relay-stale-fencing-token/);
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retryable failure, terminal failure, cancellation, and contention stay durable", () => {
  const { root, file } = storeFile();
  try {
    const store = new TaskRelayStore(file);
    const first = store.submit(submission, { now: T0 }).task;
    const leased = store.lease(first.taskId, { runnerId: "runner-a", leaseSeconds: 60 }, { now: T0 });
    const retry = store.fail(first.taskId, { runnerId: "runner-a", fencingToken: 1, code: "verification.failed", retryable: true }, { now: T1 });
    assert.equal(retry.status, "queued");
    const second = store.lease(first.taskId, { runnerId: "runner-b", leaseSeconds: 60 }, { now: T2 });
    const failed = store.fail(first.taskId, { runnerId: "runner-b", fencingToken: 2, code: "verification.failed", retryable: true }, { now: "2026-08-24T12:02:30.000Z" });
    assert.equal(failed.status, "failed");

    const other = store.submit({ ...submission, idempotencyKey: "github-issue-32-cancel" }, { now: T0 }).task;
    store.lease(other.taskId, { runnerId: "runner-c", leaseSeconds: 60 }, { now: T0 });
    const cancelled = store.cancel(other.taskId, { reasonCode: "owner.cancelled" }, { now: T1 });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(store.status(other.taskId, { now: T2 }).status, "cancelled");
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

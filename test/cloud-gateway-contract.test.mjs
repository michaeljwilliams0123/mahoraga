import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ENVELOPE_BYTES,
  artifactInitiateEnvelope,
  authenticateRequest,
  cancelEnvelope,
  createSession,
  eventCursorEnvelope,
  publicUiState,
  redeemArtifactGrant,
  statusEnvelope,
  submitEnvelope,
} from "../src/cloud-gateway-contract.mjs";

const T0 = "2026-09-05T05:00:00.000Z";
const csrf = "csrf-token-00000001";
const session = createSession({ sessionId: "sess-owner-0001", userId: "user-owner-1", csrfToken: csrf, now: T0 });
const authRequest = {
  sessionId: session.sessionId,
  userId: session.userId,
  csrfToken: csrf,
  origin: "https://mahoraga-cloud-workspace.vercel.app",
  authenticated: true,
};

test("public UI state stays capability flags and never carries task or artifact records", () => {
  const ui = publicUiState({ authenticated: false, capabilities: ["chat", "files"] });
  assert.deepEqual(Object.keys(ui), ["schemaVersion", "product", "authenticated", "capabilities"]);
  assert.equal(ui.authenticated, false);
  assert.doesNotMatch(JSON.stringify(ui), /taskId|artifact|prompt|credential/);
});

test("authenticated envelopes require session, CSRF, and the HTTPS workspace origin", () => {
  const auth = authenticateRequest(session, authRequest);
  assert.equal(auth.userId, "user-owner-1");
  assert.throws(() => authenticateRequest(session, { ...authRequest, authenticated: false }), /gateway-unauthenticated/);
  assert.throws(() => authenticateRequest(session, { ...authRequest, csrfToken: "csrf-token-00000002" }), /gateway-csrf-mismatch/);
  assert.throws(() => authenticateRequest(session, { ...authRequest, origin: "http://127.0.0.1:4782" }), /gateway-origin-rejected/);
  assert.throws(() => authenticateRequest(session, { ...authRequest, origin: "wss://tunnel.example" }), /gateway-origin-rejected/);
});

test("submit is idempotent, bounded, and does not echo private content", () => {
  const auth = authenticateRequest(session, authRequest);
  const first = submitEnvelope(auth, { idempotencyKey: "issue-31-v1", taskType: "repository.verify", requestedOutcome: "Inspect the gateway contract." }, { now: T0 });
  assert.equal(first.created, true);
  assert.equal(first.task.status, "queued");
  assert.equal(Object.hasOwn(first.task, "requestedOutcome"), false);
  const again = submitEnvelope(auth, { idempotencyKey: "issue-31-v1", taskType: "repository.verify", requestedOutcome: "Inspect the gateway contract." }, { existingTasks: [{ ...first.task, userId: auth.userId, idempotencyKey: "issue-31-v1" }], now: T0 });
  assert.equal(again.created, false);
  assert.equal(again.task.taskId, first.task.taskId);
  assert.throws(() => submitEnvelope(auth, { idempotencyKey: "issue-31-v1", taskType: "repository.release", requestedOutcome: "Inspect the gateway contract." }, { existingTasks: [{ ...first.task, userId: auth.userId, idempotencyKey: "issue-31-v1" }] }), /gateway-idempotency-conflict/);
});

test("status, cancel, and event cursors stay task-scoped and reject stale pages", () => {
  const auth = authenticateRequest(session, authRequest);
  const submitted = submitEnvelope(auth, { idempotencyKey: "issue-31-status", taskType: "repository.verify", requestedOutcome: "Report status only." }, { now: T0 });
  const task = { ...submitted.task, userId: auth.userId, idempotencyKey: "issue-31-status" };
  const status = statusEnvelope(auth, { taskId: task.taskId, limit: 10, cursor: null }, { tasks: [task], now: T0 });
  assert.equal(status.task.taskId, task.taskId);
  assert.equal(status.page.limit, 10);

  const cancelled = cancelEnvelope(auth, { taskId: task.taskId, idempotencyKey: "cancel-1", reasonCode: "owner.cancelled" }, { tasks: [task], now: T0 });
  assert.equal(cancelled.task.status, "cancelled");

  const events = [
    { eventId: `evt-${"a".repeat(32)}`, taskId: task.taskId, sequence: 1, kind: "queued", createdAt: T0 },
    { eventId: `evt-${"b".repeat(32)}`, taskId: task.taskId, sequence: 2, kind: "cancelled", createdAt: T0 },
  ];
  const page = eventCursorEnvelope(auth, { taskId: task.taskId, limit: 1, cursor: null }, { tasks: [task], events });
  assert.equal(page.events.length, 1);
  const next = eventCursorEnvelope(auth, { taskId: task.taskId, limit: 1, cursor: page.nextCursor }, { tasks: [task], events });
  assert.equal(next.events[0].kind, "cancelled");
  assert.throws(() => eventCursorEnvelope(auth, { taskId: task.taskId, limit: 1, cursor: "c".repeat(64) }, { tasks: [task], events }), /gateway-cursor-stale/);
});

test("artifact grants are task-scoped and reject unsafe names, cross-task redemption, and credentials", () => {
  const auth = authenticateRequest(session, authRequest);
  const submitted = submitEnvelope(auth, { idempotencyKey: "issue-31-art", taskType: "repository.verify", requestedOutcome: "Attach a bounded file." }, { now: T0 });
  const task = { ...submitted.task, userId: auth.userId, idempotencyKey: "issue-31-art" };
  const initiated = artifactInitiateEnvelope(auth, {
    taskId: task.taskId,
    idempotencyKey: "artifact-1",
    fileName: "report.txt",
    mimeType: "text/plain",
    sizeBytes: 12,
    sha256: "d".repeat(64),
  }, { tasks: [task], now: T0 });
  assert.equal(initiated.grant.taskId, task.taskId);
  const redeemed = redeemArtifactGrant(initiated.grant, { taskId: task.taskId, userId: auth.userId, now: T0 });
  assert.equal(redeemed.artifactId, initiated.artifact.artifactId);
  assert.throws(() => redeemArtifactGrant(initiated.grant, { taskId: `tsk-${"e".repeat(32)}`, userId: auth.userId, now: T0 }), /gateway-cross-task-artifact/);
  assert.throws(() => artifactInitiateEnvelope(auth, {
    taskId: task.taskId, idempotencyKey: "artifact-2", fileName: "../secret.txt", mimeType: "text/plain", sizeBytes: 12, sha256: "d".repeat(64),
  }, { tasks: [task], now: T0 }), /gateway-filename-unsafe/);
  assert.throws(() => submitEnvelope(auth, {
    idempotencyKey: "issue-31-secret", taskType: "repository.verify", requestedOutcome: "github_pat_abcdefghijklmnopqrstuvwxyz0123456789",
  }), /gateway-credential-rejected|gateway-outcome-invalid/);
});

test("oversized envelopes and private-content fields fail closed", () => {
  const auth = authenticateRequest(session, authRequest);
  assert.throws(() => submitEnvelope(auth, {
    idempotencyKey: "too-big", taskType: "repository.verify", requestedOutcome: "x".repeat(MAX_ENVELOPE_BYTES),
  }), /gateway-envelope-too-large|gateway-outcome-invalid/);
  assert.throws(() => submitEnvelope(auth, {
    idempotencyKey: "prompt-echo", taskType: "repository.verify", requestedOutcome: "include the chat transcript here",
  }), /gateway-outcome-invalid/);
});

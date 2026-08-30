import test from "node:test";
import assert from "node:assert/strict";
import { builderIntakeBody } from "../src/server.mjs";
import { secondaryValidationContext } from "../src/repository-worker.mjs";

test("Builder intake accepts only explicit task-scoped metadata", () => {
  const intake = builderIntakeBody({ requestedOutcome: "Implement focused change.", taskArea: "provider-adapter", initialMessage: "secret prompt", injected: "ignored" }, "pcx-builder-test");
  assert.deepEqual(intake, {
    intent: "codex.execute", idempotencyKey: undefined, correlationId: "pcx-builder-test",
    requestedOutcome: "Implement focused change.", priority: "normal", maximumAttempts: 1,
    taskArea: "provider-adapter", conversationId: false, authoritySessionId: null, integrationLeaseId: null,
    baseCommit: undefined, allowedPaths: undefined,
  });
  assert.equal("initialMessage" in intake, false);
});

test("Secondary validation idempotency binds assignment, expected base, and exact returned commit", () => {
  const context = secondaryValidationContext({ idempotencyKey: "secondary-validate:sec-abcdef01-2345-6789-abcd-ef0123456789:abcdef0123456789:fedcba9876543210" });
  assert.deepEqual(context, { assignmentId: "sec-abcdef01-2345-6789-abcd-ef0123456789", expectedBaseCommit: "abcdef0123456789", returnCommit: "fedcba9876543210" });
  assert.equal(secondaryValidationContext({ idempotencyKey: "secondary-validate:sec-x:abcdef0" }), null);
});

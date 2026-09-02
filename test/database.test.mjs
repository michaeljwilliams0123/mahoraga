import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { RuntimeDatabase } from "../src/database.mjs";
import { createAssignmentRecord } from "../src/coordination-records.mjs";

function databaseFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-v2-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return database;
}

test("task submission is idempotent and durable", (t) => {
  const database = databaseFixture(t);
  const first = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "same-request" });
  const second = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "same-request" });
  assert.equal(first.id, second.id);
  assert.equal(database.listTasks().length, 1);
});

test("an idempotency key cannot silently alias a different task request", (t) => {
  const database = databaseFixture(t);
  database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "request-identity" });
  assert.throws(() => database.submitTask({
    capability: "manifest.validate", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "request-identity",
  }), /Idempotency key conflicts with a different task request/);
  assert.equal(database.listTasks().length, 1);
});

test("expired running tasks recover to queued", (t) => {
  const database = databaseFixture(t);
  const task = database.submitTask({ capability: "system.health", dataClass: "synthetic", requestedMode: "local", idempotencyKey: "recover-me" });
  const claimed = database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  assert.equal(claimed.id, task.id);
  assert.equal(database.recoverExpired(new Date(Date.now() + 6000)), 1);
  assert.equal(database.getTask(task.id).status, "queued");
});

test("priority ordering, correlation metadata, and worker crash recovery are durable", (t) => {
  const database = databaseFixture(t);
  database.submitTask({ capability: "system.health", dataClass: "synthetic", idempotencyKey: "normal", priority: "normal", correlationId: "roundtrip-1" });
  const high = database.submitTask({ capability: "system.health", dataClass: "synthetic", idempotencyKey: "high", priority: "high", maximumAttempts: 3 });
  const claimed = database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  assert.equal(claimed.id, high.id);
  assert.equal(database.recoverWorkerTasks("local-core"), 1);
  assert.equal(database.getTask(high.id).status, "queued");
  assert.equal(database.getTask(database.listTasks().find((task) => task.idempotencyKey === "normal").id).correlationId, "roundtrip-1");
  assert.ok(database.listEvents().some((event) => event.eventType === "task.recovered"));
});

test("improvements require an explicit decision before state changes", (t) => {
  const database = databaseFixture(t);
  const improvement = database.proposeImprovement({ title: "Improve worker recovery", summary: "Candidate only.", testSummary: "12/12 passed" });
  assert.equal(improvement.status, "proposed");
  assert.equal(database.decideImprovement(improvement.id, "approved").status, "approved");
});

test("assignment discourse persists and waiting tasks resume with user input", (t) => {
  const database = databaseFixture(t);
  const conversation = database.createConversation({ title: "Browser assignment", initialMessage: "Open the approved workspace." });
  const task = database.submitTask({ capability: "browser.status", dataClass: "synthetic", idempotencyKey: "discourse-task", conversationId: conversation.id });
  database.claimNext({ workerId: "browser", capabilities: ["browser.status"], leaseMs: 5000 });
  assert.equal(database.waitTaskForUser(task.id, "Which approved tab should I use?").status, "waiting_for_user");
  assert.equal(database.resumeTaskWithInput(task.id, "Use the unified workspace tab.").status, "queued");
  const messages = database.listConversationMessages(conversation.id);
  assert.deepEqual(messages.map((item) => item.role), ["user", "worker", "user"]);
  assert.equal(messages[1].requiresResponse, true);
});

test("conversation messages preserve insertion order when timestamps are identical", { concurrency: false }, (t) => {
  const database = databaseFixture(t);
  const RealDate = globalThis.Date;
  globalThis.Date = class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : ["2026-08-31T00:00:00.000Z"])); }
    static now() { return RealDate.parse("2026-08-31T00:00:00.000Z"); }
  };
  t.after(() => { globalThis.Date = RealDate; });
  const conversation = database.createConversation({ title: "Ordered messages", initialMessage: "message-0" });
  for (let index = 1; index < 12; index += 1) database.addConversationMessage({ conversationId: conversation.id, content: `message-${index}` });
  assert.deepEqual(database.listConversationMessages(conversation.id).map((item) => item.content), Array.from({ length: 12 }, (_, index) => `message-${index}`));
});

test("browser receipts retain only bounded verification metadata", (t) => {
  const database = databaseFixture(t);
  const task = database.submitTask({ capability: "browser.observe", dataClass: "synthetic", idempotencyKey: "browser-receipt" });
  database.claimNext({ workerId: "browser", capabilities: ["browser.observe"], leaseMs: 5000 });
  database.markVerifying(task.id, "browser:3.2.0");
  const sha256 = "a".repeat(64);
  database.finishTask(task.id, { status: "completed", resultSummary: "Browser observation completed.", receiptMetadata: { operation: "browser-observe", titleSha256: sha256, artifactSha256: sha256, screenshotWidth: 1280, screenshotHeight: 720, networkRequests: 2, networkFailures: 0, networkStatus2xx: 2, networkStatus3xx: 0, networkStatus4xx: 0, networkStatus5xx: 0, consoleErrors: 0, consoleWarnings: 0, consoleHashCount: 0 } });
  const receipt = database.listReceipts(task.id)[0];
  const { summarySha256, ...metadata } = receipt.metadata;
  assert.match(summarySha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(metadata, { operation: "browser-observe", titleSha256: sha256, artifactSha256: sha256, screenshotWidth: 1280, screenshotHeight: 720, networkRequests: 2, networkFailures: 0, networkStatus2xx: 2, networkStatus3xx: 0, networkStatus4xx: 0, networkStatus5xx: 0, consoleErrors: 0, consoleWarnings: 0, consoleHashCount: 0 });
  assert.throws(() => database.recordReceipt({ task, phase: "completed", verifier: "browser", summary: "bad receipt", metadata: { url: "http://127.0.0.1:4782/" } }), /metadata key/);
});

test("objective graphs release dependencies, retain overlap evidence, and complete with receipts", (t) => {
  const database = databaseFixture(t);
  const common = { dataClass: "synthetic", requestedMode: "local", taskArea: "runtime-health", owner: "mahoraga", provider: "local-core", retryPolicy: "bounded", completionCriteria: "worker-verified" };
  const objective = database.createObjective({ title: "Verify runtime", tasks: [
    { id: "health", capability: "system.health", dependsOn: [], ...common },
    { id: "manifest", capability: "manifest.validate", dependsOn: ["health"], ...common },
  ] });
  database.reconcileObjectives();
  let current = database.getObjective(objective.id);
  let first = current.tasks.find((task) => task.id === "health").task;
  database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
  database.markVerifying(first.id, "local-core"); database.finishTask(first.id, { status: "completed", resultSummary: "health verified" });
  database.reconcileObjectives(); database.reconcileObjectives();
  current = database.getObjective(objective.id);
  const second = current.tasks.find((task) => task.id === "manifest").task;
  database.claimNext({ workerId: "local-core", capabilities: ["manifest.validate"], leaseMs: 5000 });
  database.markVerifying(second.id, "local-core"); database.finishTask(second.id, { status: "completed", resultSummary: "manifest verified" });
  database.reconcileObjectives(); database.reconcileObjectives();
  assert.equal(database.getObjective(objective.id).status, "completed");
  assert.equal(database.getObjective(objective.id).tasks.every((task) => task.status === "completed"), true);
});

test("Codex Builder sessions preserve only task-scoped structured result metadata", (t) => {
  const database = databaseFixture(t);
  const task = database.submitTask({ capability: "codex.execute", dataClass: "synthetic", idempotencyKey: "builder-task", correlationId: "pcx-builder", integrationLeaseId: "int-00000000-0000-4000-8000-000000000004", baseCommit: "a".repeat(40), allowedPaths: ["src"] });
  const session = database.createCodexBuilderSession({ taskId: task.id, authoritySessionId: "primary-session" });
  assert.equal(session.status, "PREPARED");
  const recorded = database.recordCodexBuilderResult({ sessionId: session.id, status: "completed", verificationState: "passed", changedFileCount: 2, commitId: "abcdef0123456789" });
  assert.equal(recorded.status, "RETURNED");
  assert.equal(database.getTask(task.id).status, "completed");
  assert.ok(database.listEvents().some((event) => event.eventType === "codex-builder.result-recorded"));
});

test("Secondary Codex mailbox tracks READY return monitoring and repository validation", (t) => {
  const database = databaseFixture(t);
  const assignment = database.createSecondaryAssignment({ title: "Focused adapter change", taskArea: "provider-adapter", expectedTask: "Add one focused test.", expectedBaseCommit: "abcdef0123456789", correlationId: "secondary-roundtrip", allowedPaths: ["src", "test"] });
  assert.equal(assignment.status, "READY");
  assert.deepEqual(assignment.allowedPaths, ["src", "test"]);
  assert.equal(database.observeSecondaryReturn({ assignmentId: assignment.id, remoteAvailable: false }).status, "READY");
  const returned = database.observeSecondaryReturn({ assignmentId: assignment.id, remoteAvailable: true, returnCommit: "fedcba9876543210" });
  assert.equal(returned.status, "RETURNED");
  const validation = database.submitTask({ capability: "repository.verify", dataClass: "synthetic", idempotencyKey: "secondary-validation" });
  database.attachSecondaryValidation({ assignmentId: assignment.id, taskId: validation.id });
  assert.equal(database.completeSecondaryValidation({ taskId: validation.id, verified: true }).status, "VALIDATED");
});

test("GitHub assignment imports are idempotent and reject conflicting metadata", (t) => {
  const database = databaseFixture(t);
  const record = createAssignmentRecord({
    correlationId: "github-roundtrip", title: "Review relay contract", taskArea: "relay-contract",
    expectedTask: "Review only the bounded relay files.", expectedBaseCommit: "abcdef0123456789", allowedPaths: ["src", "test"],
  }, { assignmentId: "sec-abcdef01-2345-6789-abcd-ef0123456789", now: "2026-08-23T00:00:00.000Z" });
  const first = database.importSecondaryAssignment(record);
  const second = database.importSecondaryAssignment(record);
  assert.equal(first.id, second.id);
  assert.equal(second.source, "github-mailbox");
  assert.deepEqual(second.allowedPaths, ["src", "test"]);
  assert.throws(() => database.importSecondaryAssignment({ ...record, title: "Conflicting title" }), /Conflicting GitHub coordination assignment/);
});
test("answer evaluations persist content-free evidence and bounded retry state", (t) => {
  const database = databaseFixture(t);
  const conversation = database.createConversation({ title: "Quality loop", initialMessage: "Explain the concrete runtime fix." });
  const task = database.submitTask({
    capability: "assistant.respond", dataClass: "synthetic", idempotencyKey: "answer-quality-roundtrip",
    conversationId: conversation.id, requestedOutcome: "Explain the concrete runtime fix.",
    completionCriteria: "substantive-response", maximumAttempts: 2,
  });
  assert.equal(task.completionCriteria, "substantive-response");
  assert.throws(() => database.submitTask({
    capability: "assistant.respond", dataClass: "synthetic", idempotencyKey: "answer-quality-roundtrip",
    conversationId: conversation.id, requestedOutcome: "Explain the concrete runtime fix.",
    completionCriteria: "different-criteria", maximumAttempts: 2,
  }), /completionCriteria/);

  const evidence = {
    summarySha256: "a".repeat(64), criteriaSha256: "b".repeat(64), summaryWordCount: 3,
    criterionTokenCount: 4, matchedCriterionCount: 1, providerVerified: true, declaredEvidenceCount: 0,
    acknowledgementDetected: true, vagueDetected: false, contradictionDetected: false,
  };
  database.claimNext({ workerId: "local-core", capabilities: ["assistant.respond"], leaseMs: 5000 });
  database.markVerifying(task.id, "answer-quality");
  const first = database.recordAnswerEvaluation({
    taskId: task.id, attemptNumber: 1, evaluatorVersion: "1.0.0", decision: "retry",
    reasons: ["mere-acknowledgement"], evidence,
  });
  assert.equal(first.decision, "retry");
  assert.equal("summary" in first, false);
  assert.deepEqual(database.recordAnswerEvaluation({
    taskId: task.id, attemptNumber: 1, evaluatorVersion: "1.0.0", decision: "retry",
    reasons: ["mere-acknowledgement"], evidence,
  }), first);
  assert.equal(database.requeueAfterAnswerEvaluation({ taskId: task.id, decision: "retry" }).status, "queued");

  database.claimNext({ workerId: "local-core", capabilities: ["assistant.respond"], leaseMs: 5000 });
  database.markVerifying(task.id, "answer-quality");
  database.recordAnswerEvaluation({
    taskId: task.id, attemptNumber: 2, evaluatorVersion: "1.0.0", decision: "unresolved",
    reasons: ["mere-acknowledgement"], evidence,
  });
  database.finishTask(task.id, {
    status: "failed", errorCode: "answer-quality-unresolved",
    resultSummary: "Mahoraga could not verify a complete response after 2 bounded attempts. No claim of completion was recorded.",
  });
  assert.equal(database.getTask(task.id).status, "failed");
  assert.equal(database.listAnswerEvaluations(task.id).length, 2);
  const messages = database.listConversationMessages(conversation.id);
  assert.match(messages.at(-1).content, /could not verify a complete response/i);
});

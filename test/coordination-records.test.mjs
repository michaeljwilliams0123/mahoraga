import assert from "node:assert/strict";
import test from "node:test";
import { createAssignmentRecord, createResultRecord, validateActualChanges, validateAssignmentRecord, validateResultRecord } from "../src/coordination-records.mjs";

const assignment = () => createAssignmentRecord({
  title: "Implement a bounded provider adapter",
  taskArea: "provider-adapter",
  expectedTask: "Change only the adapter and its focused tests.",
  expectedBaseCommit: "abcdef0123456789",
  allowedPaths: ["src", "test", "docs"],
}, { assignmentId: "sec-abcdef01-2345-6789-abcd-ef0123456789", now: "2026-08-23T00:00:00.000Z" });

test("GitHub coordination assignments expose only bounded task metadata", () => {
  const record = assignment();
  assert.equal(record.returnBranch, `secondary/${record.assignmentId}`);
  assert.equal(record.privacy.chatAccess, false);
  assert.equal(record.privacy.conversationTranscriptIncluded, false);
  assert.equal(record.privacy.credentialsIncluded, false);
  assert.throws(() => validateAssignmentRecord({ ...record, chatTranscript: "private conversation" }), /field is not allowed/);
});

test("coordination authority is Primary-created and Secondary-returned", () => {
  const record = assignment();
  assert.throws(() => validateAssignmentRecord({ ...record, createdBy: "secondary-codex", assignedTo: "main-codex" }), /authority must be main-codex to secondary-codex/);
  const result = createResultRecord(record, { status: "blocked", returnCommit: null, changedFiles: [], verification: [], summary: "Bounded blocker." });
  assert.throws(() => validateResultRecord({ ...result, completedBy: "main-codex" }, record), /result authority must be secondary-codex/);
});

test("GitHub coordination results bind the assignment branch and allowed paths", () => {
  const source = assignment();
  const result = createResultRecord(source, {
    status: "completed",
    returnCommit: "fedcba9876543210",
    changedFiles: ["src/provider.mjs", "test/provider.test.mjs"],
    verification: ["node --test --test-isolation=none"],
    summary: "Implemented and verified the focused adapter change.",
  }, { now: "2026-08-23T01:00:00.000Z" });
  assert.equal(validateResultRecord(result, source).assignmentId, source.assignmentId);
  assert.throws(() => validateResultRecord({ ...result, changedFiles: ["state/primary-codex.token"] }, source), /outside assignment scope/);
});

test("blocked results do not require a fabricated commit", () => {
  const source = assignment();
  const result = createResultRecord(source, {
    status: "blocked", returnCommit: null, changedFiles: [], verification: [], summary: "Blocked because the required source is not available.",
  });
  assert.equal(result.returnCommit, null);
});

test("actual Git changes cannot be concealed by a result record", () => {
  const source = assignment();
  const result = createResultRecord(source, {
    status: "completed",
    returnCommit: "fedcba9876543210",
    changedFiles: ["src/provider.mjs"],
    verification: ["node --test --test-isolation=none"],
    summary: "Implemented and verified the focused adapter change.",
  });
  assert.deepEqual(validateActualChanges([`coordination/assignments/${source.assignmentId}.json`, "src/provider.mjs"], result, source, [`coordination/assignments/${source.assignmentId}.json`]), ["src/provider.mjs"]);
  assert.throws(() => validateActualChanges(["src/provider.mjs", "state/primary-codex.token"], result, source), /outside assignment scope/);
  assert.throws(() => validateActualChanges(["src/different.mjs"], result, source), /do not match the actual Git diff/);
});

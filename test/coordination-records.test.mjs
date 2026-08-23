import assert from "node:assert/strict";
import test from "node:test";
import { createAssignmentRecord, createResultRecord, validateAssignmentRecord, validateResultRecord } from "../src/coordination-records.mjs";

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

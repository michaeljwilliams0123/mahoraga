import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAssignmentRecord } from "../src/coordination-records.mjs";
import { loadCoordinationAssignments, syncCoordinationAssignments } from "../src/coordination-mailbox.mjs";
import { RuntimeDatabase } from "../src/database.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-coordination-"));
  mkdirSync(path.join(root, "coordination", "assignments"), { recursive: true });
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, database };
}

test("GitHub assignment files import into the runtime database exactly once", (t) => {
  const { root, database } = fixture(t);
  const assignment = createAssignmentRecord({
    title: "Review relay contract", taskArea: "relay-contract", expectedTask: "Review the bounded relay implementation.",
    expectedBaseCommit: "abcdef0123456789", allowedPaths: ["src", "test"],
  }, { assignmentId: "sec-abcdef01-2345-6789-abcd-ef0123456789", now: "2026-08-23T00:00:00.000Z" });
  writeFileSync(path.join(root, "coordination", "assignments", `${assignment.assignmentId}.json`), `${JSON.stringify(assignment, null, 2)}\n`);
  assert.equal(loadCoordinationAssignments(root).length, 1);
  assert.deepEqual(syncCoordinationAssignments(database, root).imported, [assignment.assignmentId]);
  assert.deepEqual(syncCoordinationAssignments(database, root).imported, []);
  assert.equal(database.getSecondaryAssignment(assignment.assignmentId).source, "github-mailbox");
});

test("assignment filenames must bind to their validated IDs", (t) => {
  const { root } = fixture(t);
  const assignment = createAssignmentRecord({
    title: "Review relay contract", taskArea: "relay-contract", expectedTask: "Review the bounded relay implementation.",
    expectedBaseCommit: "abcdef0123456789", allowedPaths: ["src"],
  }, { assignmentId: "sec-abcdef01-2345-6789-abcd-ef0123456789" });
  writeFileSync(path.join(root, "coordination", "assignments", "sec-deadbeef.json"), JSON.stringify(assignment));
  assert.throws(() => loadCoordinationAssignments(root), /filename does not match/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const script = new URL("../scripts/emergency-rollback.ps1", import.meta.url);

test("emergency rollback is candidate-scoped and has no hard-coded production reset", () => {
  assert.equal(existsSync(script), true, "scripts/emergency-rollback.ps1 must exist");
  const source = readFileSync(script, "utf8");
  assert.match(source, /CandidatePort/);
  assert.match(source, /4783/);
  assert.match(source, /\.mahoraga-candidate/);
  assert.match(source, /CandidateWorktree/);
  assert.match(source, /CandidateBaseSha/);
  assert.doesNotMatch(source, /397acebf16766f44e3b4317f9d8b68b10de5f821/i);
  assert.doesNotMatch(source, /ProductionCommit\s*=/i);
  assert.doesNotMatch(source, /restores? the verified 3\.6\.0/i);
});
import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeCandidatePaths } from "../src/sovereign-candidate-producer.mjs";

test("sovereign candidate paths reject traversal and protected files", () => {
  assert.deepEqual(assertSafeCandidatePaths(["test/safe-regression.test.mjs"]), ["test/safe-regression.test.mjs"]);
  for (const unsafe of ["../src/escape.mjs", "src/../escape.mjs", "/etc/passwd", ".github/workflows/verify.yml", "AGENTS.md", "src/sovereign-candidate-producer.mjs", "test//empty.mjs"]) {
    assert.throws(() => assertSafeCandidatePaths([unsafe]));
  }
  assert.throws(() => assertSafeCandidatePaths([]));
});

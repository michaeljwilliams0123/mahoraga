import test from "node:test";
import assert from "node:assert/strict";
import { autonomyAllowedPaths } from "../src/autonomy-execution-scope.mjs";

test("autonomous write scope is deterministic and excludes workflow authority", () => {
  assert.deepEqual(autonomyAllowedPaths("Fix the runtime router and tests."), ["src", "test"]);
  assert.deepEqual(autonomyAllowedPaths("Update the Mahoraga interface and apply the change."), ["cloud-app", "operator-deck", "src", "test"]);
  assert.deepEqual(autonomyAllowedPaths("Update the documentation for the runtime."), ["docs", "src", "test"]);
  assert.deepEqual(autonomyAllowedPaths("Update provider manifest and package dependencies."), ["mahoraga.manifest.json", "package.json", "src", "test"]);
  assert.deepEqual(autonomyAllowedPaths("Improve release automation scripts and document it."), ["docs", "scripts", "src", "test"]);
  for (const prompt of ["change CI workflows", "release automation", "update GitHub Actions"]) {
    assert.equal(autonomyAllowedPaths(prompt).some((item) => item === ".github" || item.startsWith(".github/")), false);
  }
  assert.equal(autonomyAllowedPaths("Update the Mahoraga interface.").includes("cloud"), false);
});

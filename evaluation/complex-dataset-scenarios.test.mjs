import test from "node:test";
import assert from "node:assert/strict";
import { runComplexDatasetScenarios } from "./complex-dataset-scenarios.mjs";

test("complex synthetic datasets yield bounded findings and plain-language conclusions", () => {
  const results = runComplexDatasetScenarios();
  assert.equal(results.length, 3);
  assert.ok(results.every((item) => item.passed));
  assert.ok(results.reduce((sum, item) => sum + item.rowsAnalyzed, 0) >= 60_000);
  assert.ok(results.every((item) => item.findings.length >= 3));
  assert.ok(results.every((item) => /not |cannot|explained/i.test(item.conclusion)));
  assert.ok(results.every((item) => item.caveat.length > 20));
  const conversion = results.find((item) => item.id === "conversion-mix-shift");
  assert.equal(conversion.findings.find((item) => item.code === "mix-shift").count, 1);
});

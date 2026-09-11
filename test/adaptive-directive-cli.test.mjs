import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("adaptive directive CLI emits a zero-credit bounded review contract", () => {
  const result = spawnSync(process.execPath, [
    "scripts/adaptive-directive-review.mjs",
    "Update runtime UI readiness without paid fallback",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.zeroCredit, true);
  assert.equal(output.providerRequired, false);
  assert.deepEqual(output.directive.surfaces, ["policy", "runtime", "ui"]);
  assert.ok(output.impactMap.nodes.some((node) => node.id === "readiness"));
  assert.equal(output.reviewStop.stop, false);
  assert.ok(output.reviewStop.missingEvidence.length > 0);
  assert.equal(output.nextStep, "trusted-ledger");
});

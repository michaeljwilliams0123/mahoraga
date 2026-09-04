import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/sovereign-scan-report.mjs");

test("sovereign scan report emits bounded JSON with gap ids", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: root });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(typeof report.product, "string");
  assert.equal(typeof report.version, "string");
  assert.ok(report.counts && typeof report.counts === "object");
  assert.ok(Array.isArray(report.blockedGapIds));
  assert.ok(Array.isArray(report.actionableGapIds));
});

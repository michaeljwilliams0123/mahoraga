import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateLanguagePolicy } from "../scripts/language-policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(path.join(root, "config/language-policy.json"), "utf8"));

test("polyglot policy defaults the control plane to TypeScript", () => {
  assert.equal(policy.version, 1);
  assert.equal(policy.defaultLanguage, "typescript");
  assert.deepEqual(policy.javascriptMigrationDebtExtensions, [".js", ".mjs", ".cjs"]);
  assert.equal(policy.nativeCodeRequiresBenchmark, true);
  assert.deepEqual(policy.javascriptExceptions, []);
});

test("current repository is migration debt, not a policy violation", () => {
  const report = validateLanguagePolicy(root);
  assert.equal(report.healthy, true);
  assert.equal(report.violations.length, 0);
  assert.ok(report.migrationDebt.some((item) => item.startsWith("src/")));
  assert.ok(report.migrationDebt.some((item) => item.startsWith("test/")));
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const arsenal = readFileSync(join(root, "operator-deck/src/lib/fleet/arsenal.ts"), "utf8");
const execute = readFileSync(join(root, "operator-deck/src/lib/fleet/execute.server.ts"), "utf8");

const staleRepositoryPhrases = [
  "Public GitHub head",
  "public main",
  "Public metadata",
  "Scout public repo",
  "current public summary",
  "reads public metadata live",
  "Runs now. Public GitHub",
];

for (const phrase of staleRepositoryPhrases) {
  test(`operator arsenal does not describe the private repository as public: ${phrase}`, () => {
    assert.doesNotMatch(arsenal, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });
}

test("operator execution receipts do not describe private GitHub APIs as public", () => {
  assert.doesNotMatch(execute, /public Actions API|GitHub public API/i);
});

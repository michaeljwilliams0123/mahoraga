import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "verify.yml");

async function workflow() {
  return (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
}

test("canonical CI verifies Linux and Windows with Node 24", async () => {
  const source = await workflow();
  assert.match(source, /pull_request:/);
  assert.match(source, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(source, /ubuntu-latest/);
  assert.match(source, /windows-latest/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(source, /actions\/setup-node@[a-f0-9]{40} # v7/);
  assert.match(source, /node-version:\s*"24"/);
  assert.match(source, /npm run verify/);
  assert.match(source, /npm run gap:audit/);
  assert.match(source, /github-audit\.mjs --format markdown >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(source, /if: matrix\.os == 'ubuntu-latest'/);
});

test("canonical CI remains read-only", async () => {
  const source = await workflow();
  const block = source.match(/\npermissions:\n([\s\S]*?)\nconcurrency:/)?.[1];
  assert.ok(block, "permissions block missing");
  assert.deepEqual(block.trim().split(/\n/).map((line) => line.trim()).filter(Boolean), ["contents: read"]);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./);
});

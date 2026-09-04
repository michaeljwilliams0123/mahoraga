import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

test("sovereign scheduler preserves the canonical UTC window and adds a staggered fallback", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "sovereign-eight-hour-cycle.yml"), "utf8");

  assert.match(source, /cron: '17 \*\/4 \* \* \*'/);
  assert.match(source, /cron: '47 \*\/4 \* \* \*'/);
  assert.doesNotMatch(source, /timezone:/);
  assert.match(source, /concurrency:\s*\n\s*group: sovereign-four-hour-\$\{\{ github\.repository \}\}\s*\n\s*cancel-in-progress: false/);
  assert.doesNotMatch(source, /\bnpm ci\b/);
  assert.match(source, /workflow_dispatch:/);
});

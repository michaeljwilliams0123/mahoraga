import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

test("sovereign scheduler uses heartbeat wakeups around a durable anchored clock", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "sovereign-eight-hour-cycle.yml"), "utf8");

  assert.match(source, /workflow_run:/);
  assert.match(source, /Publish Staged Mahoraga Update/);
  assert.match(source, /cron: '7,22,37,52 \* \* \* \*'/);
  assert.doesNotMatch(source, /cron: '17 \*\/4 \* \* \*'/);
  assert.doesNotMatch(source, /cron: '47 \*\/4 \* \* \*'/);
  assert.match(source, /contents: write/);
  assert.match(source, /SOVEREIGN_ANCHOR_PREFIX: sovereign-cycle-anchor-v2-/);
  assert.match(source, /SOVEREIGN_COMPLETE_PREFIX: sovereign-cycle-complete-v2-/);
  assert.match(source, /createDeploymentAnchor/);
  assert.match(source, /sleep "\$\{wait_seconds\}"/);
  assert.match(source, /duplicate heartbeat suppressed/);
  assert.match(source, /refs\/tags\/\$\{complete_tag\}/);
  assert.match(source, /concurrency:\s*\n\s*group: sovereign-four-hour-\$\{\{ github\.repository \}\}\s*\n\s*cancel-in-progress: false/);
  assert.doesNotMatch(source, /\bnpm ci\b/);
  assert.match(source, /workflow_dispatch:/);
});

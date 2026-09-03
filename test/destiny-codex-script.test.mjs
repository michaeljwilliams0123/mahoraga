import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SCRIPT = new URL("../scripts/destiny-codex-dispatch.mjs", import.meta.url);

test("Destiny PR validation includes deletions and requires a newly added envelope", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.match(source, /"diff", "--name-status", "--no-renames", "-z"/);
  assert.doesNotMatch(source, /--diff-filter=ACMR/);
  assert.match(source, /dispatchEntry\.status !== "A"/);
  assert.match(source, /dispatchStatus: dispatchEntry\.status/);
});

test("new Destiny dispatches require the versioned fail-closed readiness gate", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.match(source, /destiny-trigger-trust\.mjs/);
  assert.match(source, /config["'], ["']destiny-trigger-trust\.json/);
  assert.match(source, /readiness-file/);
  assert.match(source, /evaluateDestinyTriggerReadiness/);
  assert.match(source, /destiny-trigger-not-ready:/);
  const existingCheck = source.indexOf("if (await isFile(file))");
  const readinessCheck = source.indexOf("const readiness = evaluateDestinyTriggerReadiness");
  const write = source.indexOf("await writeFile(file");
  assert.ok(existingCheck >= 0 && readinessCheck > existingCheck && write > readinessCheck, "readiness must gate only new dispatch writes after idempotent existing-envelope inspection");
});

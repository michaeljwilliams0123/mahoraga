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

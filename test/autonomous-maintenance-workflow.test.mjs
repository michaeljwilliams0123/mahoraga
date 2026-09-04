import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function workflow(name) {
  return readFile(path.join(ROOT, ".github", "workflows", name), "utf8");
}

test("scheduled candidate cycle preserves a four-hour durable cadence without installing root dependencies", async () => {
  const source = await workflow("sovereign-eight-hour-cycle.yml");
  assert.match(source, /name: Sovereign Four Hour Candidate Cycle/);
  assert.match(source, /cron: '7,22,37,52 \* \* \* \*'/);
  assert.match(source, /Publish Staged Mahoraga Update/);
  assert.match(source, /SOVEREIGN_ANCHOR_PREFIX: sovereign-cycle-anchor-v2-/);
  assert.match(source, /SOVEREIGN_COMPLETE_PREFIX: sovereign-cycle-complete-v2-/);
  assert.match(source, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read\s*\n\s*pull-requests: read/);
  assert.match(source, /candidate-cycle:\s*\n\s*permissions:\s*\n\s*actions: write\s*\n\s*contents: write\s*\n\s*pull-requests: write/);
  assert.doesNotMatch(source, /\bnpm ci\b/);
  assert.match(source, /node src\/cloud-cycle-worker\.mjs/);
});

test("automatic beta release normalizes a prerelease manifest version before adding the beta run", async () => {
  const source = await workflow("release.yml");
  assert.match(source, /release_base="\$\{base_version%%-\*\}"/);
  assert.match(source, /version="\$\{release_base\}-beta\.\$\{GITHUB_RUN_NUMBER\}"/);
});

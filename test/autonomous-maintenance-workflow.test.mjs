import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function workflow(name) {
  return readFile(path.join(ROOT, ".github", "workflows", name), "utf8");
}

test("scheduled candidate cycle runs the dependency-free worker without npm install", async () => {
  const source = await workflow("sovereign-eight-hour-cycle.yml");
  assert.match(source, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(source, /\bnpm ci\b/);
  assert.match(source, /run: node src\/cloud-cycle-worker\.mjs/);
});

test("automatic beta release normalizes a prerelease manifest version before adding the beta run", async () => {
  const source = await workflow("release.yml");
  assert.match(source, /release_base="\$\{base_version%%-\*\}"/);
  assert.match(source, /version="\$\{release_base\}-beta\.\$\{GITHUB_RUN_NUMBER\}"/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const runtimeServer = readFileSync(join(root, "src/server.mjs"), "utf8");
const openWorkspace = readFileSync(join(root, "scripts/open-workspace.ps1"), "utf8");
const baselineServer = readFileSync(join(root, "state/release-baseline/src/server.mjs"), "utf8");
const baselineOpenWorkspace = readFileSync(join(root, "state/release-baseline/scripts/open-workspace.ps1"), "utf8");
const runtimeTest = readFileSync(join(root, "test/runtime.test.mjs"), "utf8");
const cloudRuntimeTest = readFileSync(join(root, "test/canonical-cloud-runtime.test.mjs"), "utf8");

const pagesHost = "michaeljwilliams0123.github.io";
const pagesPath = "/mahoraga";
const pagesDefaultPattern = new RegExp(
  String.raw`${pagesHost.replaceAll(".", "\\.")}${pagesPath}/?`
);

for (const [label, source] of [
  ["runtime server", runtimeServer],
  ["workspace opener", openWorkspace],
  ["release-baseline runtime server", baselineServer],
  ["release-baseline workspace opener", baselineOpenWorkspace],
]) {
  test(`${label} does not make GitHub Pages the default workspace origin`, () => {
    assert.equal(pagesDefaultPattern.test(source), false);
  });
}

test("runtime contract no longer calls GitHub Pages the canonical interaction surface", () => {
  assert.doesNotMatch(runtimeTest, /canonical GitHub Pages workspace/i);
  assert.doesNotMatch(cloudRuntimeTest, /canonical GitHub Pages workspace/i);
});

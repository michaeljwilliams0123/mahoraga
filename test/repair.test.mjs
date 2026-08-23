import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { applyAutomaticRepairs, ESSENTIAL_FILES, scanRepairState } from "../src/repair.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

test("release baseline covers every essential production file", async () => {
  const manifest = await loadManifest();
  const scan = await scanRepairState(manifest);
  assert.equal(scan.healthy, true, JSON.stringify(scan.issues));
});

test("core repair defects are staged rather than silently restored", async () => {
  const manifest = await loadManifest();
  const relative = `state/repair-test-${Date.now()}/core.mjs`;
  const baseline = path.join(process.cwd(), manifest.repair.baselineDirectory, relative);
  try {
    mkdirSync(path.dirname(baseline), { recursive: true });
    writeFileSync(baseline, "baseline", "utf8");
    ESSENTIAL_FILES.push(relative);
    const result = await applyAutomaticRepairs(manifest);
    assert.deepEqual(result.staged, [relative]);
    assert.equal(result.repaired.length, 0);
  } finally {
    ESSENTIAL_FILES.pop();
    rmSync(path.dirname(path.join(process.cwd(), relative)), { recursive: true, force: true });
    rmSync(path.dirname(baseline), { recursive: true, force: true });
  }
});

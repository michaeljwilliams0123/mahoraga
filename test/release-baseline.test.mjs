import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyBaselineFiles } from "../scripts/create-release-baseline.mjs";

async function withBaselineFixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-baseline-"));
  const baselineRoot = path.join(root, "state", "release-baseline");
  await mkdir(baselineRoot, { recursive: true });
  try {
    await callback({ root, baselineRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("release baseline verification accepts byte-identical source and baseline files", async () => {
  await withBaselineFixture(async ({ root, baselineRoot }) => {
    await writeFile(path.join(root, "package.json"), "{\"version\":1}\n");
    await writeFile(path.join(baselineRoot, "package.json"), "{\"version\":1}\n");

    assert.deepEqual(await verifyBaselineFiles({ root, baselineRoot, files: ["package.json"] }), []);
  });
});

test("release baseline verification reports deterministic content drift", async () => {
  await withBaselineFixture(async ({ root, baselineRoot }) => {
    await writeFile(path.join(root, "package.json"), "{\"version\":2}\n");
    await writeFile(path.join(baselineRoot, "package.json"), "{\"version\":1}\n");

    assert.deepEqual(await verifyBaselineFiles({ root, baselineRoot, files: ["package.json"] }), [
      { relative: "package.json", reason: "content-drift" },
    ]);
  });
});

test("release baseline verification reports missing baseline files", async () => {
  await withBaselineFixture(async ({ root, baselineRoot }) => {
    await writeFile(path.join(root, "package.json"), "{\"version\":1}\n");

    assert.deepEqual(await verifyBaselineFiles({ root, baselineRoot, files: ["package.json"] }), [
      { relative: "package.json", reason: "baseline-missing-or-empty" },
    ]);
  });
});

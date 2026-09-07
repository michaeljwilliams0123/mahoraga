import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canonicalProjectId = "prj_lkeL3E4UNp2HkMxm8KePeGdl5ADJ";
const expectedIgnoreCommand = `if [ "$VERCEL_PROJECT_ID" = "${canonicalProjectId}" ]; then exit 1; else exit 0; fi`;
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("only the canonical Vercel project may continue a Git-triggered build", async () => {
  const [rootConfigSource, appConfigSource] = await Promise.all([
    read("../vercel.json"),
    read("vercel.json"),
  ]);

  for (const source of [rootConfigSource, appConfigSource]) {
    const config = JSON.parse(source);
    assert.equal(config.git?.deploymentEnabled, true);
    assert.equal(config.ignoreCommand, expectedIgnoreCommand);
  }
});

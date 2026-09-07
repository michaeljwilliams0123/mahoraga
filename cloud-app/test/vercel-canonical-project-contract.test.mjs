import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canonicalProjectId = "prj_lkeL3E4UNp2HkMxm8KePeGdl5ADJ";
const expectedRootIgnoreCommand = `if [ "$VERCEL_PROJECT_ID" = "${canonicalProjectId}" ]; then git diff --quiet HEAD^ HEAD -- cloud-app; else exit 0; fi`;
const expectedAppIgnoreCommand = `if [ "$VERCEL_PROJECT_ID" = "${canonicalProjectId}" ]; then git diff --quiet HEAD^ HEAD -- .; else exit 0; fi`;
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Vercel projects stay configured but Git-disabled during the provider migration", async () => {
  const [rootConfigSource, appConfigSource] = await Promise.all([
    read("../vercel.json"),
    read("vercel.json"),
  ]);

  const rootConfig = JSON.parse(rootConfigSource);
  const appConfig = JSON.parse(appConfigSource);

  assert.equal(rootConfig.git?.deploymentEnabled, false);
  assert.equal(appConfig.git?.deploymentEnabled, false);
  assert.equal(rootConfig.ignoreCommand, expectedRootIgnoreCommand);
  assert.equal(appConfig.ignoreCommand, expectedAppIgnoreCommand);
});

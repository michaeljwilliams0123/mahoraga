import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const railwayDockerfile = new URL("../Dockerfile", import.meta.url);
const canonicalDockerfile = new URL("../Dockerfile.cloud", import.meta.url);

test("Railway default container stays byte-identical to the canonical cloud runtime", async () => {
  const [railway, canonical] = await Promise.all([
    readFile(railwayDockerfile, "utf8"),
    readFile(canonicalDockerfile, "utf8"),
  ]);
  assert.equal(railway, canonical);
  assert.match(railway, /^FROM node:24-/m);
  assert.match(railway, /MAHORAGA_STATE_DIR=\/var\/lib\/mahoraga/);
  assert.doesNotMatch(railway, /^\s*VOLUME\b/m);
  assert.match(railway, /HEALTHCHECK .*\/api\/ready/);
  assert.match(railway, /CMD \["node", "scripts\/cloud-service\.mjs"\]/);
});

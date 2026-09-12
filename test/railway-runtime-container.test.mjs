import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dockerfile = new URL("../Dockerfile.railway", import.meta.url);

test("Railway runtime uses a deterministic Node 24 root-package container", async () => {
  const source = await readFile(dockerfile, "utf8");
  assert.match(source, /^FROM node:24-/m);
  assert.match(source, /COPY package\.json package-lock\.json \.\//);
  assert.match(source, /RUN npm ci --omit=dev/);
  assert.match(source, /COPY src \.\/src/);
  assert.match(source, /COPY mahoraga\.manifest\.json \.\//);
  assert.match(source, /CMD \["npm", "start"\]/);
  assert.doesNotMatch(source, /cloud-app|experiments|state\/release-baseline/);
});

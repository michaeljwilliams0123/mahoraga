import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../next.config.ts", import.meta.url);

test("Next CSP derives connect-src from the same validated public API origin", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /import \{ mahoragaApiOrigin \} from "\.\/lib\/api-origin"/);
  assert.match(source, /const publicApiOrigin = mahoragaApiOrigin\(\)/);
  assert.match(source, /\.\.\.\(publicApiOrigin \? \[publicApiOrigin\] : \[\]\)/);
  assert.match(source, /connect-src \$\{connectSources\.join\(" "\)\}/);
});

test("Next CSP preserves recovery endpoints and contains no Railway origin", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /https:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev/);
  assert.match(source, /wss:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev/);
  assert.doesNotMatch(source, /railway\.app/);
});

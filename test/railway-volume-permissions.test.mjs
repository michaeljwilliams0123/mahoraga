import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Railway volume bootstrap repairs ownership then drops privileges", async () => {
  const [dockerfile, entrypoint] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../scripts/docker-entrypoint.sh", import.meta.url), "utf8"),
  ]);

  assert.match(dockerfile, /apt-get install[^\n]*gosu/);
  assert.match(dockerfile, /ENTRYPOINT \["\.\/scripts\/docker-entrypoint\.sh"\]/);
  assert.doesNotMatch(dockerfile, /^USER node$/m);
  assert.match(entrypoint, /chown -R node:node "\$\{MAHORAGA_STATE_DIR:\-\/var\/lib\/mahoraga\}"/);
  assert.match(entrypoint, /exec gosu node "\$@"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("cloud supervisor creates one strong shared core bearer when Railway leaves it blank", async () => {
  const service = await read("scripts/cloud-service.mjs");
  assert.match(service, /import \{ randomBytes \} from "node:crypto";/);
  assert.match(service, /const primaryCodexToken = process\.env\.MAHORAGA_PRIMARY_CODEX_TOKEN\?\.trim\(\) \|\| randomBytes\(32\)\.toString\("base64url"\);/);
  assert.match(service, /MAHORAGA_PRIMARY_CODEX_TOKEN: primaryCodexToken/);
  assert.ok(service.indexOf("MAHORAGA_PRIMARY_CODEX_TOKEN: primaryCodexToken") < service.indexOf('start("core"'));
});

test("cloud supervisor does not log the shared core bearer", async () => {
  const service = await read("scripts/cloud-service.mjs");
  assert.doesNotMatch(service, /console\.log\([^\n]*primaryCodexToken/);
  assert.doesNotMatch(service, /rotateAndAppend\([^\n]*primaryCodexToken/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");

test("cloud health never fabricates authoritative runtime provenance from deployment environment", () => {
  assert.doesNotMatch(route, /MAHORAGA_EXPECTED_SOURCE_COMMIT/);
  assert.doesNotMatch(route, /source:\s*"immutable-runtime"/);
  assert.doesNotMatch(route, /state:\s*process\.env/);
  assert.match(route, /authority:\s*"paired-mahoraga-core"/);
});

test("unpaired cloud health reports runtime provenance as unknown until the paired core supplies it", () => {
  assert.match(route, /runtime:\s*\{/);
  assert.match(route, /provenance:\s*\{/);
  assert.match(route, /state:\s*"unknown"/);
  assert.match(route, /source:\s*"paired-core-required"/);
});

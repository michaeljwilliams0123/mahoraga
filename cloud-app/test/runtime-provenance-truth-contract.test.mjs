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

test("Cloudflare expected SHA stays deployment metadata and cannot overwrite actual commit identity", () => {
  assert.match(route, /expectedCommitSha:\s*process\.env\.MAHORAGA_EXPECTED_GIT_SHA/);
  assert.match(route, /commitSha:\s*process\.env\.MAHORAGA_GIT_COMMIT_SHA\s*\?\?\s*process\.env\.COMMIT_REF/);
  assert.doesNotMatch(route, /commitSha:\s*process\.env\.MAHORAGA_EXPECTED_GIT_SHA/);
  assert.doesNotMatch(route, /RAILWAY_/);
});

test("health evaluates deployment identity at request time instead of freezing it at build", () => {
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export const revalidate = 0/);
  assert.doesNotMatch(route, /force-static/);
});

test("health uses explicit deployment metadata and otherwise stays unknown", () => {
  assert.match(route, /MAHORAGA_DEPLOYMENT_PROVIDER/);
  assert.match(route, /return "unknown"/);
  assert.doesNotMatch(route, /return "local"/);
  assert.doesNotMatch(route, /process\.env\.CONTEXT \?\? "local"/);
  assert.doesNotMatch(route, /railwayRuntimePresent/);
  assert.doesNotMatch(route, /VERCEL_/);
});

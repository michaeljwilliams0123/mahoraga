import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("owner gateway keeps identity and assertion key out of tracked vars", () => {
  assert.match(config, /\[secrets\][\s\S]*MAHORAGA_CLOUD_OWNER_ID[\s\S]*MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET/);
  assert.doesNotMatch(config, /example\.invalid/);
  assert.match(config, /MAHORAGA_RUNTIME_ORIGIN\s*=\s*"https:\/\/mahoraga-runtime-main-production\.up\.railway\.app\/"/);
});

test("Wrangler local state is ignored everywhere in the repository", () => {
  assert.match(ignore, /(^|\n)\.wrangler\/(\r?\n|$)/);
});

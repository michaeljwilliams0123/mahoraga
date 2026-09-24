import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("owner gateway keeps identity and assertion key out of tracked vars", () => {
  assert.match(config, /\[secrets\][\s\S]*MAHORAGA_CLOUD_OWNER_ID[\s\S]*MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET/);
  assert.doesNotMatch(config, /example\.invalid/);
  assert.match(config, /MAHORAGA_RUNTIME_ORIGIN\s*=\s*"https:\/\/mahoraga-execution-runtime\.mahoraga-mjw0123\.workers\.dev\/"/);\n  assert.doesNotMatch(config, /railway\.app/i);
});

test("Wrangler local state is ignored everywhere in the repository", () => {
  assert.match(ignore, /(^|\n)\.wrangler\/(\r?\n|$)/);
});

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const wrangler = "npx --yes wrangler@4.132.0";
const cfg = "--config deploy/cloudflare-owner-gateway/wrangler.toml";

test("owner gateway operator commands pin Wrangler and never embed secret values", () => {
  assert.equal(pkg.scripts["cloudflare:owner-gateway:whoami"], `${wrangler} whoami`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:deploy"], `${wrangler} deploy ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:deployments"], `${wrangler} deployments list ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:secret:owner"], `${wrangler} secret put MAHORAGA_CLOUD_OWNER_ID ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:secret:assertion"], `${wrangler} secret put MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET ${cfg}`);
  for (const value of Object.values(pkg.scripts).filter((value) => value.includes("cloudflare:owner-gateway") || value.includes("wrangler@4.132.0"))) {
    assert.doesNotMatch(value, /owner@example|secret=.*|token=.*|password=/i);
  }
});
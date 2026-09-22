import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const rootConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

test("owner gateway uses a host-neutral runtime origin contract", () => {
  assert.match(worker, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(worker, /MAHORAGA_FLY_ORIGIN/);
  assert.match(config, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(config, /MAHORAGA_FLY_ORIGIN/);
});

test("Cloudflare Builds root config preserves the native bridge deployment contract", () => {
  assert.match(rootConfig, /MAHORAGA_PAGES_ORIGIN\s*=\s*"https:\/\/michaeljwilliams0123\.github\.io\/"/);
  assert.match(rootConfig, /\[\[services\]\][\s\S]*binding\s*=\s*"MAHORAGA_EXECUTION_RUNTIME"[\s\S]*service\s*=\s*"mahoraga-execution-runtime"/);
});

test("owner gateway rejects forwarding loops before proxying", () => {
  assert.match(worker, /target\.origin\s*===\s*requestUrl\.origin/);
  assert.match(worker, /gateway-origin-invalid/);
});

test("owner gateway trusts Cloudflare Access context rather than a caller identity header", () => {
  assert.match(worker, /ctx\?\.access/);
  assert.match(worker, /ctx\.access\.getIdentity/);
  assert.doesNotMatch(worker, /request\.headers\.get\("cf-access-authenticated-user-email"\)/);
});

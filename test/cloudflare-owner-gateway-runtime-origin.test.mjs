import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const rootConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

test("owner gateway has no external runtime-origin fallback contract", () => {
  assert.doesNotMatch(worker, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(config, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(worker, /MAHORAGA_FLY_ORIGIN/);
  assert.doesNotMatch(config, /MAHORAGA_FLY_ORIGIN/);
  assert.match(worker, /cloud-native-route-required/);
  assert.match(config, /\[\[services\]\][\s\S]*binding\s*=\s*"MAHORAGA_EXECUTION_RUNTIME"[\s\S]*service\s*=\s*"mahoraga-execution-runtime"/);
});

test("Cloudflare Builds root config preserves the native bridge deployment contract", () => {
  assert.match(rootConfig, /MAHORAGA_PAGES_ORIGIN\s*=\s*"https:\/\/michaeljwilliams0123\.github\.io\/"/);
  assert.match(rootConfig, /\[\[services\]\][\s\S]*binding\s*=\s*"MAHORAGA_EXECUTION_RUNTIME"[\s\S]*service\s*=\s*"mahoraga-execution-runtime"/);
});

test("owner gateway fails closed after native routes instead of proxying an external origin", () => {
  assert.doesNotMatch(worker, /target\.origin\s*===\s*requestUrl\.origin/);
  assert.doesNotMatch(worker, /gateway-origin-invalid/);
  assert.doesNotMatch(worker, /return fetch\(new Request\(target/);
  assert.match(worker, /return json\(\{ error: "cloud-native-route-required" \}, 404\)/);
});

test("owner gateway trusts Cloudflare Access context rather than a caller identity header", () => {
  assert.match(worker, /ctx\?\.access/);
  assert.match(worker, /ctx\.access\.getIdentity/);
  assert.doesNotMatch(worker, /request\.headers\.get\("cf-access-authenticated-user-email"\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");

test("owner gateway uses a host-neutral runtime origin contract", () => {
  assert.match(worker, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(worker, /MAHORAGA_FLY_ORIGIN/);
  assert.match(config, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(config, /MAHORAGA_FLY_ORIGIN/);
});

test("owner gateway rejects forwarding loops before proxying", () => {
  assert.match(worker, /target\.origin\s*===\s*requestUrl\.origin/);
  assert.match(worker, /gateway-origin-invalid/);
});

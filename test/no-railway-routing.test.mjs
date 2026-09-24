import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const rootGatewayConfig = read("wrangler.toml");
const gatewayConfig = read("deploy/cloudflare-owner-gateway/wrangler.toml");
const executionWorker = read("deploy/cloudflare-execution-runtime/worker.ts");

const railwayOrigin = /(?:https?:\/\/)?[a-z0-9.-]*railway\.app/i;

test("Cloudflare owner gateway has no Railway runtime origin", () => {
  assert.doesNotMatch(rootGatewayConfig, railwayOrigin);
  assert.doesNotMatch(gatewayConfig, railwayOrigin);
  assert.match(rootGatewayConfig, /MAHORAGA_RUNTIME_ORIGIN\s*=\s*"https:\/\/mahoraga-execution-runtime\.mahoraga-mjw0123\.workers\.dev\/"/);
  assert.match(gatewayConfig, /MAHORAGA_RUNTIME_ORIGIN\s*=\s*"https:\/\/mahoraga-execution-runtime\.mahoraga-mjw0123\.workers\.dev\/"/);
});

test("Cloudflare execution runtime cannot proxy or fall through to Railway", () => {
  assert.doesNotMatch(executionWorker, railwayOrigin);
  assert.doesNotMatch(executionWorker, /proxyToRailway|RAILWAY_ANCHOR_URL|RAILWAY_ANCHOR_HOST/);
  assert.match(executionWorker, /request\.headers\.has\("x-bypass-token"\)[\s\S]*railway-routing-retired/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("provider admission reports operational failure classes instead of one opaque probe error", async () => {
  const source = await read("deploy/cloudflare-execution-runtime/provider-admission.ts");
  for (const reason of [
    "provider-authentication-failed",
    "provider-target-mismatch",
    "provider-model-response-invalid",
    "provider-model-unavailable",
    "provider-endpoint-unreachable",
  ]) assert.match(source, new RegExp(reason));
  for (const surface of ["probeResponse", "billing", "authentication", "routing", "dns", "modelAvailability", "gateway", "policy"]) {
    assert.match(source, new RegExp(surface));
  }
});

test("exact-main deployment waits for live and durable runtime convergence before it can return", async () => {
  const deploy = await read("scripts/cloudflare-execution-runtime.ts");
  assert.match(deploy, /export async function waitForExactRuntimeConvergence/);
  assert.match(deploy, /\/api\/live/);
  assert.match(deploy, /\/api\/ready/);
  assert.match(deploy, /readyBody\.durableState === "cloudflare-do-sqlite"/);
  const deployFunction = deploy.slice(deploy.indexOf("async function deploy"), deploy.indexOf("async function accept"));
  assert.match(deployFunction, /await waitForExactRuntimeConvergence\(/);
});

test("exact-main deployment cannot route to Railway", async () => {
  const deploy = await read("scripts/cloudflare-execution-runtime.ts");
  assert.match(deploy, /https:\/\/railway-disabled\.invalid\//);
  assert.doesNotMatch(deploy, /DEFAULT_RAILWAY_ANCHOR = "https:\/\/mahoraga-runtime-main-production\.up\.railway\.app\//);
});

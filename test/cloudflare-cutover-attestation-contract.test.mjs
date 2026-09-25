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

test("exact-main workflow waits for live and durable runtime convergence before provider refresh", async () => {
  const workflow = await read(".github/workflows/cloudflare-execution-runtime.yml");
  const deploy = workflow.indexOf("Deploy exact verified execution runtime");
  const convergence = workflow.indexOf("Wait for exact runtime convergence");
  const refresh = workflow.indexOf("Refresh hard-zero provider admission");
  assert.ok(deploy >= 0 && convergence > deploy && refresh > convergence);
  assert.match(workflow, /\/api\/live/);
  assert.match(workflow, /\/api\/ready/);
  assert.match(workflow, /VERIFIED_SHA/);
});

test("exact-main deployment cannot route to Railway", async () => {
  const deploy = await read("scripts/cloudflare-execution-runtime.ts");
  assert.match(deploy, /https:\/\/railway-disabled\.invalid\//);
  assert.doesNotMatch(deploy, /DEFAULT_RAILWAY_ANCHOR = "https:\/\/mahoraga-runtime-main-production\.up\.railway\.app\//);
});

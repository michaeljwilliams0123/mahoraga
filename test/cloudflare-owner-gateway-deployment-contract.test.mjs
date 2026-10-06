import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("owner gateway keeps identity and assertion key out of tracked vars and has no Railway origin", () => {
  assert.match(config, /\[secrets\][\s\S]*MAHORAGA_CLOUD_OWNER_ID[\s\S]*MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET/);
  for (const required of ["PROVIDER_REFRESH_SECRET", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_BILLING_READ_TOKEN"]) assert.match(config, new RegExp(required));
  assert.doesNotMatch(config, /example\.invalid/);
  assert.doesNotMatch(config, /MAHORAGA_RUNTIME_ORIGIN/);
  assert.doesNotMatch(config, /mahoraga-runtime-main-production\.up\.railway\.app/);
  assert.match(config, /\[\[services\]\][\s\S]*binding\s*=\s*"MAHORAGA_EXECUTION_RUNTIME"[\s\S]*service\s*=\s*"mahoraga-execution-runtime"/);
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

test("owner gateway admits universal execution capabilities and execute bridge actions", () => {
  const worker = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /browser\.execute/);
  assert.match(worker, /desktop\.execute/);
  assert.match(worker, /memory\.write/);
  assert.match(worker, /artifact\.inspect/);
  assert.match(worker, /NATIVE_ACTIONS = new Set\(\[[^\]]*"execute"/s);
});

test("owner gateway admits only bounded sanitized interaction/delivery truth from the runtime binding", async () => {
  const { default:gateway } = await import("../deploy/cloudflare-owner-gateway/worker.mjs");
  const interactionId = "interaction-0123456789abcdef0123456789abcdef";
  const validTruth = {
    interactionTruth:{
      status:"observed", interactionId, sourceFamily:"omnichannel", channelFamily:"cloudflare-runtime",
      modalities:["text","structured"], protocolFamily:"http-json", protocolVersion:"1.0", locale:"en-US",
      timezone:"America/New_York", direction:"ltr", unitSystem:"us", currency:"USD", deviceClass:"phone", networkClass:"degraded",
      executionStatus:"completed", interactionFingerprint:"a".repeat(64), negotiationFingerprint:"b".repeat(64), executionFingerprint:"c".repeat(64),
      observedAt:"2026-09-29T22:46:00.000Z", reason:"accepted",
    },
    deliveryTruth:{
      status:"queued", interactionId, taskId:"task-1", chainId:"chain-1", outputReferences:["artifact:result-1"],
      deliveryFingerprint:"d".repeat(64), observedAt:"2026-09-29T22:46:00.000Z", reason:"offline",
    },
    runtimeTruthFingerprint:"e".repeat(64),
  };
  let runtimeResponse = validTruth;
  let calls = 0;
  const env = {
    MAHORAGA_CLOUD_OWNER_ID:"owner@example.com",
    MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET:"x".repeat(48),
    MAHORAGA_EXECUTION_RUNTIME:{ fetch:async () => { calls += 1; return Response.json(runtimeResponse); } },
  };
  const ctx = { access:{ getIdentity:async () => ({ email:"owner@example.com" }) } };
  const action = (payload = { interactionId }) => new Request("https://gateway.example/api/runtime/pages-bridge/action", {
    method:"POST", headers:{ "content-type":"application/json", origin:"https://gateway.example" },
    body:JSON.stringify({ type:"interaction-truth", payload }),
  });

  const good = await gateway.fetch(action(), env, ctx);
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), validTruth);

  runtimeResponse = { ...validTruth, interactionTruth:{ ...validTruth.interactionTruth, trafficAuthority:true } };
  const forbidden = await gateway.fetch(action(), env, ctx);
  assert.equal(forbidden.status, 503);
  assert.deepEqual(await forbidden.json(), { error:"execution-runtime-evidence-invalid" });

  const callsBeforeInvalidRequest = calls;
  const arbitraryEndpoint = await gateway.fetch(action({ interactionId, endpoint:"https://evil.example", headers:{ authorization:"Bearer secret" } }), env, ctx);
  assert.equal(arbitraryEndpoint.status, 400);
  assert.deepEqual(await arbitraryEndpoint.json(), { error:"interaction-truth-request-invalid" });
  assert.equal(calls, callsBeforeInvalidRequest);
});

test("owner gateway source contract keeps interaction truth observational and service-bound", () => {
  const worker = readFileSync(new URL("../deploy/cloudflare-owner-gateway/worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /NATIVE_ACTIONS = new Set\([^)]*"interaction-truth"/s);
  assert.match(worker, /sanitizeInteractionTruthResult/);
  assert.match(worker, /INTERACTION_FORBIDDEN_KEYS/);
  assert.doesNotMatch(worker, /interaction-truth[^\n]*https?:\/\//i);
});

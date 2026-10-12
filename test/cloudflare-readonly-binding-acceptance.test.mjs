import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyReadonlyBindingSnapshot, readReadonlyBindingSnapshot,
} from "../scripts/cloudflare-readonly-binding-acceptance.mjs";

const NOW = Date.parse("2026-10-12T21:00:00Z");
const BROKER = "mahoraga-execution-broker";
const INSPECTOR = "mahoraga-cloudflare-readonly-inspector";
const id = "12345678-1234-1234-1234-123456789abc";
const env = { accountId:"a".repeat(32), apiToken:"broker-deployment-only-test-token-".repeat(2) };
const wrap = (result) => ({ success:true, result });
const service = () => ({ name:"CLOUD_PROVIDER", type:"service", service:INSPECTOR, environment:"production" });
const settings = (bindings=[]) => wrap({ bindings });
const deployment = (alter={}) => wrap({ deployments:[{
  id, created_on:new Date(NOW - 120_000).toISOString(),
  versions:[{version_id:id, percentage:100}], ...alter,
}] });
const secrets = [
  {name:"CLOUDFLARE_AUDIT_TOKEN",type:"secret_text"},
  {name:"CLOUDFLARE_ACCOUNT_ID",type:"secret_text"},
];
const valid = (other={}) => ({
  enabled:true, brokerSettings:settings([service()]), brokerDeployments:deployment(),
  inspectorSettings:settings(secrets), inspectorDeployments:deployment(),
  nowMs:NOW, ...other,
});

test("actual bound provider with both secret names and 100-percent deployments verifies metadata only", () => {
  const s=verifyReadonlyBindingSnapshot(valid());
  assert.equal(s.status,"bound-for-runtime-attestation");
  assert.equal(s.binding,"CLOUD_PROVIDER");
  assert.equal(s.service,INSPECTOR);
  assert.equal(s.requiredSecretsPresent,true);
  assert.equal(s.providerBindingPresent,true);
  assert.equal(s.executableActionConfirmed,false);
  assert.equal(s.ownerAuthorityGranted,false);
  assert.doesNotMatch(JSON.stringify(s),/Bearer|apiToken|CLOUDFLARE_AUDIT_TOKEN|private-key/i);
});

test("disabled mode proves no latent service binding; does not require or query inspector", () => {
  const s=verifyReadonlyBindingSnapshot({enabled:false,brokerSettings:settings(),nowMs:NOW});
  assert.deepEqual(s,{
    kind:"cloudflare-readonly-binding-readback",status:"disabled-unbound",
    providerBindingPresent:false,executableActionConfirmed:false,
  });
  for (const bad of [settings([service()]), settings([{name:"OTHER",type:"service",service:"external"}])]) {
    assert.throws(() => verifyReadonlyBindingSnapshot({
      enabled:false,brokerSettings:bad,nowMs:NOW,
    }),/readonly-binding-unexpected-live-service/);
  }
});

test("missing, incorrect, duplicate, and extra service names fail closed", () => {
  for (const b of [
    [], [{...service(),service:"wrong-target"}],
    [{...service(),name:"REPOSITORY_PROVIDER"}],
    [service(),service()],
    [service(),{name:"EXTRA",type:"service",service:"somewhere"}],
    [{...service(),environment:"preview"}],
  ]) assert.throws(()=>verifyReadonlyBindingSnapshot(valid({brokerSettings:settings(b)})),
    /readonly-binding-cloud-provider-mismatch/);
});

test("missing inspector credentials, duplicate metadata and outbound service binding hold", () => {
  for (const b of [
    [], [secrets[0]], [secrets[1]], [secrets[0],secrets[0],secrets[1]],
    [...secrets,{name:"OTHER_SERVICE",type:"service",service:"unexpected"}],
  ]) assert.throws(()=>verifyReadonlyBindingSnapshot(valid({inspectorSettings:settings(b)})),
    /readonly-binding-inspector-credentials-unverified/);
});

test("split traffic, missing deployment IDs, or future observations cannot be promoted", () => {
  for (const d of [
    deployment({versions:[{version_id:id,percentage:50},{version_id:id,percentage:50}]}),
    deployment({versions:[{version_id:id,percentage:99}]}),
    deployment({created_on:new Date(NOW+5001).toISOString()}),
    deployment({id:"bad"}),
    wrap({deployments:[]}),
  ]) {
    assert.throws(()=>verifyReadonlyBindingSnapshot(valid({brokerDeployments:d})),
      /readonly-binding-broker-deployment-unverified/);
    assert.throws(()=>verifyReadonlyBindingSnapshot(valid({inspectorDeployments:d})),
      /readonly-binding-inspector-deployment-unverified/);
  }
});

test("Cloudflare API calls are read-only, only fixed paths, and never show token in receipt", async () => {
  const paths = [];
  const get = async (url, init) => {
    assert.equal(init.method,"GET");
    assert.equal(init.redirect,"error");
    assert.equal(new Headers(init.headers).get("authorization"),"Bearer "+env.apiToken);
    assert.equal(new Headers(init.headers).get("cache-control"),"no-store");
    paths.push(String(url));
    const suffix = String(url).split("/workers/scripts/")[1];
    if (suffix===BROKER+"/settings")return Response.json(settings([service()]));
    if (suffix===BROKER+"/deployments")return Response.json(deployment());
    if (suffix===INSPECTOR+"/settings")return Response.json(settings(secrets));
    if (suffix===INSPECTOR+"/deployments")return Response.json(deployment());
    throw Error("unauthorized path");
  };
  const result=await readReadonlyBindingSnapshot({...env,enabled:true,nowMs:NOW,fetchImpl:get});
  assert.equal(result.status,"bound-for-runtime-attestation");
  assert.equal(paths.length,4);
  assert.equal(new Set(paths).size,4);
  assert.ok(paths.every(p=>p.startsWith("https://api.cloudflare.com/client/v4/accounts/"+env.accountId+"/workers/scripts/")));
  assert.doesNotMatch(JSON.stringify(result),/broker-deployment-only-test-token|Bearer/);
});

test("disabled mode performs exactly one broker settings GET and rejects existing provider", async () => {
  let count=0;
  const response=await readReadonlyBindingSnapshot({...env,enabled:false,nowMs:NOW,fetchImpl:async url=>{
    assert.ok(String(url).endsWith(BROKER+"/settings"));
    count++;
    return Response.json(settings());
  }});
  assert.equal(response.status,"disabled-unbound");
  assert.equal(count,1);
});

test("API failures and token absence are sanitized without action grants", async () => {
  await assert.rejects(readReadonlyBindingSnapshot({
    accountId:env.accountId,apiToken:"",enabled:true,
    fetchImpl:async()=>{throw Error("must not call network");},
  }),/readonly-binding-readback-credentials-unavailable/);
  for (const response of [
    Response.json({}, {status:403}), Response.json({success:false,result:{}}), new Response("bad-json"),
  ]) {
    await assert.rejects(readReadonlyBindingSnapshot({
      ...env,enabled:true,nowMs:NOW,fetchImpl:async()=>response.clone(),
    }),/readonly-binding-(api-unavailable|api-invalid|broker-unverified)/);
  }
  await assert.rejects(readReadonlyBindingSnapshot({
    ...env,enabled:true,nowMs:NOW,fetchImpl:async()=>{throw Error("Bearer "+env.apiToken);},
  }),/readonly-binding-api-unavailable/);
});

test("exact-main CI checks live broker binding after deployment and before runtime promotion", () => {
  const root=join(dirname(fileURLToPath(import.meta.url)),"..");
  const workflow=readFileSync(join(root,".github/workflows/cloudflare-execution-runtime.yml"),"utf8");
  const broker=workflow.indexOf("- name: Deploy private universal execution broker");
  const check=workflow.indexOf("- name: Verify live broker CLOUD_PROVIDER binding before runtime promotion");
  const runtime=workflow.indexOf("- name: Deploy exact verified execution runtime");
  assert.ok(broker>=0 && check>broker && runtime>check);
  const block=workflow.slice(check,runtime);
  assert.match(block,/node scripts\/verify-exact-head.mjs/);
  assert.match(block,/unset GITHUB_TOKEN/);
  assert.match(block,/node scripts\/cloudflare-readonly-binding-acceptance.mjs/);
  assert.match(block,/if: env.MAHORAGA_READONLY_PROVIDER_ENABLED == 'true'/);
  const implementation=readFileSync(join(root,"scripts/cloudflare-readonly-binding-acceptance.mjs"),"utf8");
  assert.match(implementation,/process.env.CLOUDFLARE_READONLY_AUDIT_TOKEN/);
  assert.doesNotMatch(implementation,/process.env.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(block,/wrangler.*deploy|secret put|token create/);
  assert.match(workflow,/MAHORAGA_READONLY_PROVIDER_ENABLED: \$\{\{ vars.MAHORAGA_READONLY_PROVIDER_ENABLED \}\}/);
});

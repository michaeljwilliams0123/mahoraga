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
const version = (bindings=[]) => wrap({ id, resources:{ bindings } });
const deployment = (alter={}) => wrap({ deployments:[{
  id, created_on:new Date(NOW - 120_000).toISOString(),
  versions:[{version_id:id, percentage:100}], ...alter,
}] });
const secrets = [
  {name:"CLOUDFLARE_AUDIT_TOKEN",type:"secret_text"},
  {name:"CLOUDFLARE_ACCOUNT_ID",type:"secret_text"},
];
const valid = (other={}) => ({
  enabled:true, brokerVersion:version([service()]), brokerDeployments:deployment(),
  inspectorVersion:version(secrets), inspectorDeployments:deployment(),
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
  const s=verifyReadonlyBindingSnapshot({enabled:false,brokerVersion:version(),brokerDeployments:deployment(),nowMs:NOW});
  assert.deepEqual(s,{
    kind:"cloudflare-readonly-binding-readback",status:"disabled-unbound",
    providerBindingPresent:false,executableActionConfirmed:false,
  });
  for (const bad of [version([service()]), version([{name:"OTHER",type:"service",service:"external"}])]) {
    assert.throws(() => verifyReadonlyBindingSnapshot({
      enabled:false,brokerVersion:bad,brokerDeployments:deployment(),nowMs:NOW,
    }),/readonly-binding-unexpected-live-service/);
  }
});

test("missing, incorrect, duplicate, and extra service names fail closed", () => {
  for (const b of [
    [], [{...service(),service:"wrong-target"}],
    [{...service(),name:"REPOSITORY_PROVIDER"}],
    [service(),service()],
    [service(),{name:"EXTRA",type:"service",service:"somewhere"}],
    [service(),{name:"EXTRA_SECRET",type:"secret_text"}],
    [{...service(),environment:"preview"}],
  ]) assert.throws(()=>verifyReadonlyBindingSnapshot(valid({brokerVersion:version(b)})),
    /readonly-binding-cloud-provider-mismatch/);
});

test("missing inspector credentials, duplicate metadata and outbound service binding hold", () => {
  for (const b of [
    [], [secrets[0]], [secrets[1]], [secrets[0],secrets[0],secrets[1]],
    [...secrets,{name:"OTHER_SERVICE",type:"service",service:"unexpected"}],
    [...secrets,{name:"EXTRA_TOKEN",type:"secret_text"}],
  ]) assert.throws(()=>verifyReadonlyBindingSnapshot(valid({inspectorVersion:version(b)})),
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

test("uploaded but undeployed Worker settings never count as the active service binding", () => {
  const wrongId = "b".repeat(8)+"-1234-1234-1234-123456789abc";
  const newVersion = (bindings) => wrap({ id:wrongId, resources:{bindings} });
  assert.throws(() => verifyReadonlyBindingSnapshot(valid({
    brokerVersion:newVersion([service()]),
  })), /readonly-binding-broker-unverified/);
  assert.throws(() => verifyReadonlyBindingSnapshot(valid({
    inspectorVersion:newVersion(secrets),
  })), /readonly-binding-inspector-unverified/);
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
    if (suffix===BROKER+"/versions/"+id)return Response.json(version([service()]));
    if (suffix===BROKER+"/deployments")return Response.json(deployment());
    if (suffix===INSPECTOR+"/versions/"+id)return Response.json(version(secrets));
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

test("disabled mode inspects only the deployed broker version, never the inspector", async () => {
  const paths=[];
  const response=await readReadonlyBindingSnapshot({...env,enabled:false,nowMs:NOW,fetchImpl:async url=>{
    const p=String(url);
    paths.push(p);
    if(p.endsWith(BROKER+"/deployments"))return Response.json(deployment());
    if(p.endsWith(BROKER+"/versions/"+id))return Response.json(version());
    throw new Error("unexpected endpoint");
  }});
  assert.equal(response.status,"disabled-unbound");
  assert.equal(paths.length,2);
  assert.ok(paths.every(p=>!p.includes(INSPECTOR)));
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

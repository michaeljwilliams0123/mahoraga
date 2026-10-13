import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyWorkersManagementToken, attestPrivateCanary,
  EXISTING_WORKER, CANARY_WORKER,
} from "../scripts/cloudflare-workers-management-token.ts";

const ACCOUNT = "a".repeat(32), TOKEN = "secret-not-real-token-" + "x".repeat(32);
const SHA = "b".repeat(40), D = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const env = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN: TOKEN, VERIFIED_SHA: SHA };
const active = { success: true, result: { id: "c".repeat(32), status: "active" } };
const deployed = { success: true, result: { deployments: [{
  id: D, created_on: "2026-10-01T12:00:00Z",
  versions: [{ version_id: V, percentage: 100 }],
}] } };
const version = { success: true, result: {
  id: V, resources: { bindings: [{ name: "TARGET_SHA", type: "plain_text", text: SHA }] },
} };
function mock(handlers) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, method: options?.method, headers: options?.headers });
    const [match, body, status = 200] = handlers.find(([key]) => url.endsWith(key)) ?? [];
    if (!match) throw Error("unexpected endpoint");
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, requests };
}
const accountVerify = "/accounts/" + ACCOUNT + "/tokens/verify";
const userVerify = "/user/tokens/verify";
const brokerDeploy = "/accounts/" + ACCOUNT + "/workers/scripts/" + EXISTING_WORKER + "/deployments";
const canaryDeploy = "/accounts/" + ACCOUNT + "/workers/scripts/" + CANARY_WORKER + "/deployments";
const canaryVersion = "/accounts/" + ACCOUNT + "/workers/scripts/" + CANARY_WORKER + "/versions/" + V;

test("valid account-owned token confirms access to existing worker but does not invent write authority", async () => {
  const f = mock([[accountVerify, active], [brokerDeploy, deployed]]);
  const receipt = await verifyWorkersManagementToken(env, f.fetchImpl);
  assert.equal(receipt.status, "verified-read-access");
  assert.equal(receipt.tokenKind, "account");
  assert.equal(receipt.workerReadConfirmed, true);
  assert.equal(receipt.createConfirmed, false);
  assert.equal(receipt.deployConfirmed, false);
  assert.equal(receipt.editConfirmed, false);
  assert.deepEqual(f.requests.map(x => x.method), ["GET", "GET"]);
  assert.ok(f.requests.every(x => x.headers.authorization === "Bearer " + TOKEN));
  assert.doesNotMatch(JSON.stringify(receipt), /secret-not-real-token/);
});
test("user-owned API token falls back to user verify endpoint", async () => {
  const f = mock([[accountVerify, { success: false }, 403], [userVerify, active], [brokerDeploy, deployed]]);
  const receipt = await verifyWorkersManagementToken(env, f.fetchImpl);
  assert.equal(receipt.tokenKind, "user");
  assert.equal(f.requests.length, 3);
});
test("missing or malformed account and token fail before network requests", async () => {
  const f = mock([]);
  await assert.rejects(verifyWorkersManagementToken({ ...env, CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN: "" }, f.fetchImpl),
    /management-credential-unavailable/);
  await assert.rejects(verifyWorkersManagementToken({ ...env, CLOUDFLARE_ACCOUNT_ID: "bad" }, f.fetchImpl),
    /management-credential-unavailable/);
  assert.equal(f.requests.length, 0);
});
test("disabled or expired token is rejected", async () => {
  const f = mock([[accountVerify, {success:true,result:{id:"c".repeat(32),status:"disabled"}}]]);
  await assert.rejects(verifyWorkersManagementToken(env, f.fetchImpl), /management-token-not-active/);
});
test("token lacking deployment-read permission is not reported as verified", async () => {
  const f = mock([[accountVerify, active], [brokerDeploy, {success:false, errors:[{message:"bad"}]}, 403]]);
  await assert.rejects(verifyWorkersManagementToken(env, f.fetchImpl), /management-api-denied-403/);
});
test("ambiguous split Worker traffic cannot satisfy verified read", async () => {
  const f = mock([[accountVerify, active], [brokerDeploy, { success:true,result:{deployments:[{
    ...deployed.result.deployments[0], versions:[{version_id:V,percentage:50},{version_id:D,percentage:50}],
  }]}}]]);
  await assert.rejects(verifyWorkersManagementToken(env, f.fetchImpl), /management-worker-readback-unavailable/);
});
test("canary accepted only for exact full-traffic deployed version and pinned source", async () => {
  const f = mock([[canaryDeploy, deployed], [canaryVersion, version]]);
  const receipt = await attestPrivateCanary(env, f.fetchImpl);
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.targetSha, SHA);
  assert.equal(receipt.trafficPercent, 100);
  assert.equal(receipt.runtimeAuthorityGranted, false);
  assert.deepEqual(f.requests.map(x=>x.method), ["GET","GET"]);
});
test("stale source SHA, extra secret, or split deployment fail closed", async () => {
  const wrong = mock([[canaryDeploy, deployed], [canaryVersion, {
    success:true,result:{id:V,resources:{bindings:[{name:"TARGET_SHA",type:"plain_text",text:"f".repeat(40)}]}},
  }]]);
  await assert.rejects(attestPrivateCanary(env,wrong.fetchImpl),/management-canary-provenance-mismatch/);
  const extra = mock([[canaryDeploy,deployed],[canaryVersion,{
    success:true,result:{id:V,resources:{bindings:[...version.result.resources.bindings,{name:"UNEXPECTED",type:"secret_text"}]}},
  }]]);
  await assert.rejects(attestPrivateCanary(env,extra.fetchImpl),/management-canary-provenance-mismatch/);
  const split = mock([[canaryDeploy,{success:true,result:{deployments:[{
    ...deployed.result.deployments[0],versions:[{version_id:V,percentage:50},{version_id:D,percentage:50}],
  }]}}]]);
  await assert.rejects(attestPrivateCanary(env,split.fetchImpl),/management-canary-deployment-invalid/);
});
test("management workflow is opt-in owner-only and cannot replace the production deployment credential", async () => {
  const workflow = await readFile(new URL("../.github/workflows/cloudflare-workers-management.yml",import.meta.url),"utf8");
  const prod = await readFile(new URL("../.github/workflows/cloudflare-execution-runtime.yml",import.meta.url),"utf8");
  const canary = await readFile(new URL("../deploy/cloudflare-management-canary/wrangler.jsonc",import.meta.url),"utf8");
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/github\.actor == github\.repository_owner/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN \}\}/);
  assert.match(workflow,/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN \}\}/);
  assert.match(workflow,/scripts\/cloudflare-zero-credit-attestation\.mjs/);
  assert.match(workflow,/scripts\/verify-exact-head\.mjs/);
  assert.match(workflow,/Verify \(ubuntu-latest\)/);
  assert.match(workflow,/Verify \(windows-latest\)/);
  assert.match(workflow,/deploy\/cloudflare-management-canary\/wrangler\.jsonc/);
  assert.match(workflow,/cloudflare-workers-management-token\.mjs attest/);
  assert.match(prod,/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(prod,/CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN/);
  assert.equal(JSON.parse(canary).workers_dev,false);
  assert.equal(JSON.parse(canary).preview_urls,false);
  assert.equal(JSON.parse(canary).name,CANARY_WORKER);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker.ts";

const NOW = Date.parse("2026-09-28T22:05:00.000Z");
const CAP = (capability, permissionClass, authorityScopes) => ({
  capability, permissionClass, healthy:true, zeroCreditEligible:true, costClass:"zero-credit",
  dataClassesAllowed:["enterprise"], authorityScopes,
});
const ATT = (provider, workerId, locality, capabilities) => ({
  schemaVersion:1, kind:"universal-worker-attestation", provider, workerId, locality,
  observedAt:new Date(NOW - 1_000).toISOString(), expiresAt:new Date(NOW + 60_000).toISOString(),
  observedLatencyMs:5, queueDepth:0, reliabilityScore:1, capabilities,
});
const binding = (attestation, execute) => ({
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/capabilities") return Response.json(attestation);
    if (path === "/api/execute") return Response.json(await execute(await request.json()));
    return new Response("not found", { status:404 });
  },
});

const envelopeScopes = ["repo:read","repo:write","codex:contained","cloud:execute","browser:execute"];
const handoff = (lease, requiredNextCapability, requestedPermission, hopCount) => ({
  status:"handoff",
  handoff:{
    schemaVersion:1, taskId:lease.taskId, chainId:lease.chainId, fromWorkerId:lease.workerId,
    requiredNextCapability, requestedPermission, authorityScopes:envelopeScopes,
    evidenceRefs:[`evidence-${hopCount}`], hopCount,
  },
});

test("universal broker preserves one chain across repository codex verify cloud and browser workers", async () => {
  const repository = binding(ATT("github","github-worker","cloud",[
    CAP("repository.inspect","read",["repo:read"]), CAP("repository.verify","read",["repo:read"]),
  ]), ({ lease }) => lease.capability === "repository.inspect"
    ? handoff(lease,"codex.execute","contained",1)
    : handoff(lease,"cloud.execute","execute",3));
  const codex = binding(ATT("codex","codex-worker","local",[
    CAP("codex.execute","contained",["codex:contained"]),
  ]), ({ lease }) => handoff(lease,"repository.verify","read",2));
  const cloud = binding(ATT("cloudflare","cloud-worker","cloudflare",[
    CAP("cloud.execute","execute",["cloud:execute"]),
  ]), ({ lease }) => handoff(lease,"browser.execute","execute",4));
  const browser = binding(ATT("browser","browser-worker","cloud",[
    CAP("browser.execute","execute",["browser:execute"]),
  ]), ({ lease }) => ({ status:"complete", receipt:{ id:"final-browser-receipt", capability:lease.capability } }));

  const broker = createExecutionBroker({
    REPOSITORY_PROVIDER:repository, CODEX_PROVIDER:codex, CLOUD_PROVIDER:cloud, BROWSER_PROVIDER:browser,
  }, () => NOW);
  const response = await broker.fetch(new Request("https://broker/api/execute", {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({
      request:{ schemaVersion:1, taskId:"task-multihop", chainId:"chain-multihop",
        requiredCapability:"repository.inspect", requestedPermission:"read", authorityPermission:"contained",
        dataClass:"enterprise", authorityScopes:envelopeScopes, costPreference:"zero-credit-first",
        maxHops:6, constraints:{requireZeroCredit:true}, evidenceRefs:[] },
      payload:{ objective:"inspect, modify, verify, deploy, browser-check" },
    }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "complete");
  assert.equal(body.chainId, "chain-multihop");
  assert.equal(body.handoffCount, 4);
  assert.equal(body.receipts.filter((receipt) => receipt.kind === "handoff-receipt").length, 4);
  assert.equal(body.receipts.at(-1).providerReceipt.id, "final-browser-receipt");
});

test("execution fails closed when a route lease expires during provider work", async () => {
  let now = NOW;
  const repository = binding(
    ATT("github","github-worker","cloud",[CAP("repository.inspect","read",["repo:read"])]),
    () => {
      now += 61_000;
      return { status:"complete", receipt:{ id:"late-completion" } };
    },
  );
  const broker = createExecutionBroker({ REPOSITORY_PROVIDER:repository }, () => now);
  const response = await broker.fetch(new Request("https://broker/api/execute", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      request:{
        schemaVersion:1, taskId:"task-expiring", chainId:"chain-expiring",
        requiredCapability:"repository.inspect", requestedPermission:"read",
        dataClass:"enterprise", authorityScopes:["repo:read"], costPreference:"zero-credit-first",
        maxHops:2, constraints:{requireZeroCredit:true}, evidenceRefs:[],
      },
      payload:{ objective:"slow inspect" },
    }),
  }));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "execution-lease-expired");
  assert.equal(body.chainId, "chain-expiring");
});

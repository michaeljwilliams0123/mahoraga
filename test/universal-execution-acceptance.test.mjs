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


const hopScopes = ["repo:read", "cloud:read"];
function budgetFixture({maxHops=2, wrongWorker=false, completeImmediately=false, omitBudget=false}={}) {
  let calls = 0; let capabilityReads = 0;
  const fixtureBinding = (provider, worker, capability, next) => ({ fetch:async request => {
    if (new URL(request.url).pathname === "/api/capabilities") {
      capabilityReads++;
      return Response.json(ATT(provider,worker,"cloud",[CAP(capability,"read",hopScopes)]));
    }
    const {lease} = await request.json(); calls++;
    if (completeImmediately || calls === 6) return Response.json({status:"complete",receipt:{id:"bounded-fixture-end"}});
    return Response.json({status:"handoff",handoff:{schemaVersion:1,taskId:lease.taskId,chainId:lease.chainId,
      fromWorkerId:wrongWorker ? "unleased-worker" : lease.workerId, requiredNextCapability:next,
      requestedPermission:"read",authorityScopes:hopScopes,evidenceRefs:[],hopCount:1}});
  } });
  const broker = createExecutionBroker({
    REPOSITORY_PROVIDER:fixtureBinding("github","repository-worker","repository.inspect","cloud.inspect"),
    CLOUD_PROVIDER:fixtureBinding("cloudflare","cloud-worker","cloud.inspect","repository.inspect"),
  },()=>NOW);
  return {
    counts:()=>({calls,capabilityReads}),
    run:()=>broker.fetch(new Request("https://broker/api/execute",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({request:{taskId:"budget-task",chainId:"budget-chain",requiredCapability:"repository.inspect",
        requestedPermission:"read",dataClass:"enterprise",authorityScopes:hopScopes,maxHops:omitBudget ? undefined : maxHops,
        constraints:{requireZeroCredit:true},evidenceRefs:[]},payload:{objective:"bounded synthetic inspection"}})})),
  };
}

test("broker-owned hop budget stops repeated provider counters before a third execution", async()=>{
  const fixture = budgetFixture({maxHops:2});
  const response = await fixture.run();
  assert.equal(response.status,409);
  const result = await response.json();
  assert.equal(result.error,"handoff-hop-limit");
  assert.equal(result.chainId,"budget-chain");
  assert.equal(fixture.counts().calls,2);
  assert.equal(result.receipts.filter(r=>r.kind==="handoff-receipt").length,1);
  assert.equal(result.receipts.some(r=>r.kind==="execution-receipt"),false);
});

test("a reset provider hop counter cannot continue under a larger broker budget", async()=>{
  const fixture = budgetFixture({maxHops:4});
  const response = await fixture.run();
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,"handoff-hop-count-mismatch");
  assert.equal(fixture.counts().calls,2);
});

test("handoff cannot impersonate a worker outside the active execution lease", async()=>{
  const fixture = budgetFixture({maxHops:4,wrongWorker:true});
  const response = await fixture.run();
  assert.equal(response.status,409);
  const result = await response.json();
  assert.equal(result.error,"handoff-worker-mismatch");
  assert.equal(fixture.counts().calls,1);
  assert.equal(result.receipts.some(r=>r.kind==="handoff-receipt"),false);
});

test("invalid execution hop budgets are denied before capability reads or executor calls", async()=>{
  for (const maxHops of [null,0,-1,1.5,"2",Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1]) {
    const fixture = budgetFixture({maxHops,completeImmediately:true});
    assert.equal((await fixture.run()).status,400,String(maxHops));
    assert.deepEqual(fixture.counts(),{calls:0,capabilityReads:0});
  }
  const missing = budgetFixture({omitBudget:true,completeImmediately:true});
  assert.equal((await missing.run()).status,400);
  assert.deepEqual(missing.counts(),{calls:0,capabilityReads:0});
});

test("a valid one-hop budget permits direct completion without a handoff", async()=>{
  const fixture = budgetFixture({maxHops:1,completeImmediately:true});
  const response = await fixture.run();
  assert.equal(response.status,200);
  assert.equal((await response.json()).handoffCount,0);
  assert.equal(fixture.counts().calls,1);
});

function discoveryFixture({deadline=false, freshObservation=false, legacy=false}={}) {
  let now = NOW;
  let executions = 0;
  const proof = ATT("github","discovery-worker","cloud",[CAP("repository.inspect","read",["repo:read"])]);
  if (!deadline && !freshObservation) proof.expiresAt = new Date(NOW + 1_000).toISOString();
  const repository = {async fetch(request) {
    if (new URL(request.url).pathname === "/api/capabilities") {
      if (legacy) return Response.json({attestations:[]});
      if (freshObservation) {
        now += 10_000;
        proof.observedAt = new Date(now).toISOString();
        proof.expiresAt = new Date(now + 60_000).toISOString();
      }
      return Response.json(proof);
    }
    executions++;
    return Response.json({status:"complete",receipt:{id:"discovery-execution"}});
  }};
  // A later binding delays discovery after the repository proof was accepted.
  const cloud = {async fetch() { now += 2_000; return Response.json({attestations:[]}); }};
  const legacyBinding = {async fetch() {
    now += 10_000;
    return Response.json({schemaVersion:1,kind:"connector-capability-attestation",
      observedAt:new Date(now).toISOString(),expiresAt:new Date(now+60_000).toISOString(),
      grants:[{capability:"repository.inspect",provider:"github",permissionClass:"read",healthy:true,zeroCreditEligible:true}]});
  }};
  const broker = createExecutionBroker({REPOSITORY_PROVIDER:repository,CLOUD_PROVIDER:cloud,
    ...(legacy ? {CONNECTOR_CAPABILITY_BROKER:legacyBinding} : {})},()=>now);
  const request = {taskId:"discovery-task",chainId:"discovery-chain",requiredCapability:"repository.inspect",
    requestedPermission:"read",dataClass:"enterprise",authorityScopes:["repo:read"],maxHops:2,
    constraints:{requireZeroCredit:true},evidenceRefs:[],
    ...(deadline ? {deadlineAt:new Date(NOW+1_000).toISOString()} : {})};
  return {executions:()=>executions, now:()=>now, async run(path) {
    if (path === "capabilities") return broker.fetch(new Request("https://broker/api/capabilities"));
    const body = path === "execute" ? {request,payload:{objective:"fresh discovery"}}
      : path === "handoff" ? {request,handoff:{schemaVersion:1,taskId:request.taskId,chainId:request.chainId,
        fromWorkerId:"previous-worker",requiredNextCapability:"repository.inspect",requestedPermission:"read",
        authorityScopes:["repo:read"],evidenceRefs:[],hopCount:1}} : request;
    return broker.fetch(new Request(`https://broker/api/${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
  }};
}

for (const path of ["route","execute","handoff"]) {
  test(`${path} rejects proof that expires while a later provider is being discovered`,async()=>{
    const fixture = discoveryFixture();
    const response = await fixture.run(path);
    const body = await response.json();
    assert.equal(fixture.executions(),0,"expired proof must never authorize a provider call");
    assert.equal(response.status,503);
    assert.equal(body.error,"no-eligible-route");
    assert.equal(body.lease,undefined);
  });
  test(`${path} rejects a deadline crossed during provider discovery`,async()=>{
    const fixture = discoveryFixture({deadline:true});
    const response = await fixture.run(path);
    const body = await response.json();
    assert.equal(fixture.executions(),0,"expired deadlines must stop execution before dispatch");
    assert.equal(response.status,503);
    assert.equal(body.error,"execution-deadline-exceeded");
    assert.equal(body.lease,undefined);
  });
}

test("capability pool excludes proof expired during discovery and reports its actual observation time",async()=>{
  const fixture = discoveryFixture();
  const response = await fixture.run("capabilities");
  const body = await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(body.routes,[]);
  assert.equal(body.providerReadiness.routableCapabilities,0);
  assert.notEqual(body.providerReadiness.state,"admitted");
  assert.equal(body.observedAt,new Date(fixture.now()).toISOString());
});

for (const legacy of [false,true]) {
  test(`${legacy ? "legacy" : "universal"} proof observed during a slow capability read remains routable`,async()=>{
    const fixture = discoveryFixture({freshObservation:true,legacy});
    const response = await fixture.run("execute");
    assert.equal(response.status,200);
    assert.equal((await response.json()).status,"complete");
    assert.equal(fixture.executions(),1);
  });
}

test("each handoff rechecks discovery freshness before dispatching its successor",async()=>{
  let now = NOW;
  let discoveries = 0;
  let executions = 0;
  const repository = binding(ATT("github","handoff-discovery-worker","cloud",[
    CAP("repository.inspect","read",["repo:read"]),CAP("repository.verify","read",["repo:read"]),
  ]),({lease})=>{
    executions++;
    return {status:"handoff",handoff:{schemaVersion:1,taskId:lease.taskId,chainId:lease.chainId,
      fromWorkerId:lease.workerId,requiredNextCapability:"repository.verify",requestedPermission:"read",
      authorityScopes:["repo:read"],evidenceRefs:[],hopCount:1}};
  });
  const cloud = {async fetch() {
    if (++discoveries === 2) now += 61_000;
    return Response.json({attestations:[]});
  }};
  const broker = createExecutionBroker({REPOSITORY_PROVIDER:repository,CLOUD_PROVIDER:cloud},()=>now);
  const response = await broker.fetch(new Request("https://broker/api/execute",{method:"POST",
    headers:{"content-type":"application/json"},body:JSON.stringify({request:{taskId:"late-successor",chainId:"late-chain",
      requiredCapability:"repository.inspect",requestedPermission:"read",dataClass:"enterprise",authorityScopes:["repo:read"],
      maxHops:3,constraints:{requireZeroCredit:true},evidenceRefs:[]}})}));
  assert.equal(response.status,503);
  const body = await response.json();
  assert.equal(body.error,"no-eligible-route");
  assert.equal(executions,1,"expired successor proof must not dispatch a second execution");
  assert.equal(body.receipts.filter(r=>r.kind==="handoff-receipt").length,1);
  assert.equal(body.receipts.some(r=>r.kind==="execution-receipt"),false);
});

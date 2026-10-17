import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { projectCloudOwnerOperationsSnapshot } from "../deploy/cloudflare-execution-runtime/owner-operations-snapshot.ts";
const sha="6f4c6fdb6e04a72c6a6317f22d82c3e61f9031b6";
const sample = (rows=[{status:"PENDING",count:2},{status:"SUCCESS",count:6},{status:"FAILED",count:1}]) =>
  projectCloudOwnerOperationsSnapshot({sourceSha:sha,observedAt:"2026-10-17T19:00:00Z",turns:rows,
    assistant:{routable:false,provider:"cloudflare-native",providerReasonCode:"provider-canary-stale",evidenceLevel:"runtime-probe"}});
test("only owner-scoped turn counts are reported as facts",()=>{
  const s=sample();
  assert.deepEqual(s.tasks,{active:2,waiting:0,failed:1,completed:6});
  assert.equal(s.observationScope,"owner-cloud-turns");
  assert.equal(s.repository.cleanState,"deployment-provenance-only");
  assert.equal(s.verification.exactHeadSha,null);
  assert.equal(s.latestAuthorityDecision,null);
  assert.equal(s.cloudEvidence.mutationActionsSupported,false);
  assert.equal(s.cloudEvidence.unknown.includes("repairs"),true);
  assert.equal(s.interactionReadiness.ready,false);
});
test("zero recorded tasks never implies zero repair incidents or workers",()=>{
  const s=sample([]);
  assert.equal(s.tasks.completed,0);
  assert.equal(s.cloudEvidence.unknown.includes("workers"),true);
  assert.equal(s.cloudEvidence.unknown.includes("objectives"),true);
});
test("invalid evidence cannot be presented as a legitimate snapshot",()=>{
  assert.throws(()=>projectCloudOwnerOperationsSnapshot({sourceSha:"main",observedAt:"invalid",turns:[],
    assistant:{routable:true,provider:"x",providerReasonCode:null,evidenceLevel:"unknown"}}),/cloud-operations-evidence-invalid/);
  assert.equal(sample([{status:"SUCCESS",count:-10}]).tasks.completed,0);
});
test("cloud action stays read-only, scoped, and no unsupported modes are advertised",()=>{
  const relay=readFileSync(new URL("../cloud-app/lib/runtime-relay.ts",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../deploy/cloudflare-execution-runtime/worker.ts",import.meta.url),"utf8");
  const workspace=readFileSync(new URL("../cloud-app/components/workspace.tsx",import.meta.url),"utf8");
  assert.match(worker,/input\?\.type === "operations-snapshot"/);
  assert.match(worker,/owner_id_hash = \?/);
  assert.match(worker,/projectCloudOwnerOperationsSnapshot/);
  assert.doesNotMatch(workspace,/mode: "act"/);
  assert.match(relay,/if \(this\.bridgeAuthenticated \|\| this\.cloudSession\) throw relayError\("canonical-action-unavailable"\);/);
});

test("Build/Ship requires an actual admitted zero-credit development worker, not chat",async()=>{
  const {canRunZeroCreditDevelopmentAction}=await import("../cloud-app/lib/capability-families.ts");
  const route=(capability,costClass,routable=true)=>({capability,costClass,routable,enabled:true,provider:"test",workerIds:[],routingReason:null,providerReasonCode:null,evidenceLevel:"runtime-probe"});
  assert.equal(canRunZeroCreditDevelopmentAction(true,[route("assistant.respond","deterministic")]),false);
  assert.equal(canRunZeroCreditDevelopmentAction(true,[route("repository.inspect","deterministic")]),false);
  assert.equal(canRunZeroCreditDevelopmentAction(true,[route("codex.execute","licensed-cloud")]),false);
  assert.equal(canRunZeroCreditDevelopmentAction(true,[route("codex.execute","cloud-open-weight",false)]),false);
  assert.equal(canRunZeroCreditDevelopmentAction(true,[route("build.execute","cloud-open-weight")]),true);
  assert.equal(canRunZeroCreditDevelopmentAction(false,[route("build.execute","cloud-open-weight")]),false);
});

test("cloud Work calls PENDING a persisted turn, not a running worker",()=>{
  const work=readFileSync(new URL("../cloud-app/components/workspace/work-view.tsx",import.meta.url),"utf8");
  assert.match(work,/Pending turns/);
  assert.match(work,/not proof of a running worker/);
  assert.match(work,/Cloudflare turn counts only/);
});

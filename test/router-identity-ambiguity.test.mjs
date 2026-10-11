import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { createTaskRouter } from "../src/router.mjs";
const task={capability:"system.health",dataClass:"synthetic",requestedMode:"local"};
const bare={workerId:"local-core",capability:"system.health",costClass:"deterministic",billingClass:"zero-marginal",authorityScopes:[],platformAuthorityScopes:[]};
const rankRoutes=candidates=>()=>({candidates,considered:[],reason:null});
test("conflicting duplicate worker authority cannot win based on evidence ordering",async()=>{
  const manifest=await loadManifest();
  const restricted={...bare,authorityScopes:["connector.invoke"]};
  for(const candidates of [[bare,restricted],[restricted,bare]]){
    const result=createTaskRouter({rankRoutes:rankRoutes(candidates)})(manifest,task,{platformAuthorityScopesByWorkerId:{"local-core":[]}});
    assert.equal(result.status,"waiting");
    assert.equal(result.reason,"routing-evidence-ambiguous");
    assert.equal(result.worker,null);
  }
});
test("identical duplicate worker evidence is deduplicated and retains the valid deterministic route",async()=>{
  const manifest=await loadManifest();
  const result=createTaskRouter({rankRoutes:rankRoutes([bare,{...bare,authorityScopes:[],platformAuthorityScopes:[]}])})(manifest,task);
  assert.equal(result.status,"routable");
  assert.equal(result.worker.id,"local-core");
  assert.equal(result.competition.considered.length,1);
});

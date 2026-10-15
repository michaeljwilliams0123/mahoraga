import test from "node:test";
import assert from "node:assert/strict";
import { parseInternalActivity } from "../lib/internal-activity.ts";
import { selectCloudflareHfCandidates } from "../../deploy/cloudflare-execution-runtime/hf-candidate-discovery.ts";
const sha = "a".repeat(40);
const now=Date.parse("2026-10-15T15:00:00.000Z");
const state={
 schemaVersion:1,sourceSha:sha,enabled:true,phase:"scheduled",
 lastWakeAt:null,nextWakeAt:now+60_000,wakeCount:0,artifactCount:0,candidateActionCount:0,
 lastError:null,snapshotFingerprint:null,artifactFingerprint:null,
 observedAt:new Date(now).toISOString(),durableState:"cloudflare-do-sqlite",modelInvocations:0
};
const hf={status:"candidate-metadata-only",query:"SmolLM",sourceSha:sha,observedAt:new Date(now).toISOString(),nextCheckAt:new Date(now+86400000).toISOString(),
 candidates:selectCloudflareHfCandidates([{id:"owner/model",sha,private:false,gated:false,downloads:12,cardData:{license:"apache-2.0"}}]),
 creditCost:0,inferencePerformed:false,modelAdmissionPerformed:false,productionActivated:false};
test("UI safely parses native continuity and HF metadata extensions without accepting extra private fields",()=>{
 const parsed=parseInternalActivity({...state,nativeContinuity:null,huggingFaceDiscovery:hf},sha,now);
 assert.equal(parsed?.huggingFaceDiscovery?.candidates.length,1);
 assert.equal(parseInternalActivity({...state,huggingFaceDiscovery:{...hf,token:"secret"}},sha,now),null);
 assert.equal(parseInternalActivity({...state,nativeContinuity:null,huggingFaceDiscovery:{...hf,productionActivated:true}},sha,now),null);
 assert.equal(parseInternalActivity({...state,credential:"secret"},sha,now),null);
 assert.equal(parseInternalActivity(state,sha,now)?.enabled,true);
});

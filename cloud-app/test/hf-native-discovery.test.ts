import test from "node:test";
import assert from "node:assert/strict";
import { parseInternalActivity } from "../lib/internal-activity.ts";
const sha = "a".repeat(40);
const now=Date.parse("2026-10-15T15:00:00.000Z");
const state={
 schemaVersion:1,sourceSha:sha,enabled:true,phase:"scheduled",
 lastWakeAt:null,nextWakeAt:now+60_000,wakeCount:0,artifactCount:0,candidateActionCount:0,
 lastError:null,snapshotFingerprint:null,artifactFingerprint:null,
 observedAt:new Date(now).toISOString(),durableState:"cloudflare-do-sqlite",modelInvocations:0
};
const hf={status:"candidate-metadata-only",query:"SmolLM",sourceSha:sha,observedAt:new Date(now).toISOString(),nextCheckAt:new Date(now+86400000).toISOString(),
 candidates:[{repoId:"owner/model",revision:sha,license:"apache-2.0",downloads:12,admissionState:"requires-independent-inspection" as const,modelExecutionVerified:false as const}],
 creditCost:0,inferencePerformed:false,modelAdmissionPerformed:false,productionActivated:false};
test("UI safely parses native continuity and HF metadata extensions without accepting extra private fields",()=>{
 const parsed=parseInternalActivity({...state,nativeContinuity:null,huggingFaceDiscovery:hf},sha,now);
 assert.equal(parsed?.huggingFaceDiscovery?.candidates.length,1);
 assert.equal(parseInternalActivity({...state,huggingFaceDiscovery:{...hf,token:"secret"}},sha,now),null);
 assert.equal(parseInternalActivity({...state,nativeContinuity:null,huggingFaceDiscovery:{...hf,productionActivated:true}},sha,now),null);
 assert.equal(parseInternalActivity({...state,credential:"secret"},sha,now),null);
 assert.equal(parseInternalActivity(state,sha,now)?.enabled,true);
});

test("diagnostic reason and HTTP status are safe to render; unknown keys remain rejected", () => {
 const failure = { ...hf, status: "metadata-unavailable", candidates: [],
   failureReason: "upstream-http", httpStatus: 503 };
 const parsed = parseInternalActivity({ ...state, huggingFaceDiscovery: failure }, sha, now);
 assert.equal(parsed?.huggingFaceDiscovery?.failureReason, "upstream-http");
 assert.equal(parsed?.huggingFaceDiscovery?.httpStatus, 503);
 assert.equal(parseInternalActivity({ ...state, huggingFaceDiscovery: { ...failure, failureReason: "private-key" } }, sha, now), null);
 assert.equal(parseInternalActivity({ ...state, huggingFaceDiscovery: { ...failure, httpStatus: 999 } }, sha, now), null);
 assert.equal(parseInternalActivity({ ...state, huggingFaceDiscovery: { ...failure, candidates: hf.candidates, status: "candidate-metadata-only" } }, sha, now), null);
 const clean = parseInternalActivity({ ...state, huggingFaceDiscovery: { ...hf, failureReason: null, httpStatus: 200 } }, sha, now);
 assert.equal(clean?.huggingFaceDiscovery?.failureReason, null);
 assert.equal(parseInternalActivity({ ...state, huggingFaceDiscovery: hf }, sha, now)?.huggingFaceDiscovery?.candidates.length, 1);
});

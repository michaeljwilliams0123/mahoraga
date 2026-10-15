import test from "node:test";
import assert from "node:assert/strict";
import { selectCloudflareHfCandidates } from "../deploy/cloudflare-execution-runtime/hf-candidate-discovery.ts";
const sha = "a".repeat(40);
test("cloud discovery permits only non-gated immutable public metadata and never admits candidates",()=>{
 const result=selectCloudflareHfCandidates([
  {id:"owner/model",sha,private:false,gated:false,downloads:12,cardData:{license:"apache-2.0"},readme:"do not execute"},
  {id:"owner/blocked",sha,private:false,gated:true,downloads:900,cardData:{license:"apache-2.0"}},
  {id:"owner/secret",sha,private:true,gated:false,downloads:900,cardData:{license:"apache-2.0"}},
  {id:"owner/mutable",sha:"main",gated:false,downloads:900,cardData:{license:"apache-2.0"}},
 ]);
 assert.equal(result.length,1);
 assert.deepEqual(result[0],{repoId:"owner/model",revision:sha,license:"apache-2.0",downloads:12,
  admissionState:"requires-independent-inspection",modelExecutionVerified:false});
 assert.doesNotMatch(JSON.stringify(result),/readme|do not execute/);
 assert.throws(()=>selectCloudflareHfCandidates(Array.from({length:21},()=>({}))),/hf-cloud-metadata-invalid/);
});

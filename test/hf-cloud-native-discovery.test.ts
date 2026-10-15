import test from "node:test";
import assert from "node:assert/strict";
import { selectCloudflareHfCandidates, classifyHfDiscoveryFailure } from "../deploy/cloudflare-execution-runtime/hf-candidate-discovery.ts";
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

test("live Hugging Face license tags yield an inspected candidate, not an empty success", () => {
 const models = [{ id: "sentence-transformers/all-MiniLM-L6-v2", sha, private: false, gated: false,
   downloads: 100, tags: ["sentence-similarity", "license:apache-2.0"] }];
 const rows = selectCloudflareHfCandidates(models);
 assert.equal(rows.length, 1);
 assert.equal(rows[0]?.license, "apache-2.0");
 assert.equal(rows[0]?.admissionState, "requires-independent-inspection");
 assert.equal(rows[0]?.modelExecutionVerified, false);
 assert.equal(selectCloudflareHfCandidates([{ ...models[0], gated: true }]).length, 0);
 assert.equal(selectCloudflareHfCandidates([{ ...models[0], tags: ["license:<malformed>"] }]).length, 0);
});
test("the runtime exposes bounded failure classes and no upstream exception text", () => {
 assert.equal(classifyHfDiscoveryFailure(new Error("hf-cloud-upstream-unavailable")), "upstream-http");
 assert.equal(classifyHfDiscoveryFailure(new Error("hf-cloud-body-too-large")), "body-too-large");
 assert.equal(classifyHfDiscoveryFailure(new Error("hf-cloud-no-eligible-models")), "no-eligible-models");
 assert.equal(classifyHfDiscoveryFailure(new SyntaxError("invalid body")), "invalid-json");
 assert.equal(classifyHfDiscoveryFailure(new DOMException("deadline", "TimeoutError")), "timeout");
 assert.equal(classifyHfDiscoveryFailure(new Error("credentials: sensitive")), "network-error");
});

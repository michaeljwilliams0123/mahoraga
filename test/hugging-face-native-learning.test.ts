import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scoutNativeHuggingFace, trialNativeHuggingFace, recallNativeHuggingFace, compareNativeHuggingFaceTrials } from "../src/hugging-face-native-learning.ts";
// @ts-expect-error Existing governed JavaScript policy.
import { DEFAULT_MODEL_SUPPLY_CHAIN, modelInspectionReceiptSha256 } from "../src/model-supply-chain.mjs";

const now = new Date("2026-10-15T12:00:00.000Z");
const sha = "a".repeat(40), digest = "d".repeat(64), digest2 = "e".repeat(64);
const metadata = { scannerId:"test-scan", artifactSha256:"a".repeat(64), artifactSizeBytes:42, trustRemoteCode:false,
  pickleDetected:false, executableCodeDetected:false, inspectedAt:"2026-10-15T11:00:00.000Z", expiresAt:"2026-10-16T11:00:00.000Z" };
const policy = { ...DEFAULT_MODEL_SUPPLY_CHAIN, admissions: [{
  id:"local-test-artifact", state:"admitted", source:{ provider:"huggingface", repository:"owner/model", revision:sha, artifactPath:"model.gguf", trustRemoteCode:false },
  artifact:{ format:"gguf", sha256:metadata.artifactSha256, sizeBytes:42 },
  inspection:{ ...metadata, receiptSha256:modelInspectionReceiptSha256(metadata) },
  runtimeBindings:[{ provider:"ollama", digest, sizeBytes:420 }, {provider:"ollama",digest:digest2,sizeBytes:421}],
}] };
const schema = { type:"object", additionalProperties:false, required:["summary"], properties:{summary:{type:"string",maxLength:100}} };
const expectedSha256 = createHash("sha256").update(JSON.stringify({ summary:"right" })).digest("hex");
const suite = { suiteId:"hf-live-v1", cases:[
 { id:"one",prompt:"private-1",schema,expectedSha256 },{ id:"two",prompt:"private-2",schema,expectedSha256 },
]};
function local(modelDigest=digest, right=true) {
  const paths: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    const path = String(url); paths.push(path);
    if (path.endsWith("/api/tags")) return Response.json({ models:[{name:"offline-local",digest:modelDigest,size:modelDigest===digest?420:421}] });
    if (path.endsWith("/api/generate")) return Response.json({done:true,response:JSON.stringify({summary:right?"right":"wrong"})});
    if (path.endsWith("/api/embed")) return Response.json({embeddings:[[1,0],[0,1],[1,0]]});
    throw Error("unexpected-network-call");
  }) as typeof fetch;
  return { paths, fetchImpl, modelSupplyChain:policy, now:()=>now,
    env:{NODE_ENV:"development",ALLOW_LOCAL_AI_DEV:"true"} };
}
test("scout produces immutable inspected shortlist, quarantines gated items, makes no inference calls", async()=>{
  const routes:string[]=[];
  const fetchImpl = (async(url: RequestInfo | URL)=>{
    const path=String(url); routes.push(path);
    if (path.includes("/api/models?")) return Response.json([
      {id:"owner/model",sha,downloads:100,private:false,gated:false,cardData:{license:"apache-2.0"}},
      {id:"owner/gated",sha,downloads:200,private:false,gated:true,cardData:{license:"apache-2.0"}},
    ]);
    if(path.includes("/revision/"))return Response.json({id:"owner/model",sha,private:false,gated:false});
    throw Error("unexpected route");
  }) as typeof fetch;
  const result=await scoutNativeHuggingFace("agents",{fetchImpl,now});
  assert.equal((result.result as any).count,1);assert.equal((result.result as any).candidates[0].revisionVerified,true);
  assert.equal(result.creditCost,0); assert.equal(result.productionActivated,false);assert.equal(routes.length,2);
  assert.equal(routes.every(x=>x.startsWith("https://huggingface.co/")),true);
});
test("live local benchmark uses admitted Ollama and durable output hashes without raw prompts",async()=>{
  const a=local();const r=await trialNativeHuggingFace(suite,a);
  assert.equal((r.result as any).modelExecutionVerified,true);
  assert.equal((r.result as any).passed,2);assert.equal((r.result as any).modelDigest,digest);
  assert.equal(a.paths.length,4);assert.equal(a.paths.every(x=>x.startsWith("http://127.0.0.1:11434/")),true);
  assert.doesNotMatch(JSON.stringify(r),/private-1|private-2|right/);
  assert.equal(r.productionActivated,false);
});
test("unadmitted model and missing runtime hold and never falsely report model execution",async()=>{
  const a=local();const r=await trialNativeHuggingFace(suite,{ ...a, modelSupplyChain:DEFAULT_MODEL_SUPPLY_CHAIN });
  assert.equal((r.result as any).failed,2);assert.equal((r.result as any).modelExecutionVerified,false);
  assert.equal(a.paths.length,2);assert.equal((r.result as any).promotionEligible,false);
  assert.deepEqual((r.result as any).holds.map((x: {reason: string}) => x.reason),
    ["model-supply-chain-unadmitted","model-supply-chain-unadmitted"]);
});
test("local semantic recall returns only references and matching scores",async()=>{
  const a=local(); const r=await recallNativeHuggingFace({ documents:[
    {reference:"issue:786",text:"private incident"},{reference:"pr:1123",text:"private release"}], query:"secret",limit:2 },a);
  assert.deepEqual((r.result as any).references.map((x: any)=>x.reference),["issue:786","pr:1123"]);
  assert.equal((r.result as any).modelExecutionVerified,true);
  assert.equal(a.paths.length,2);
  assert.doesNotMatch(JSON.stringify(r),/private incident|private release|secret/);
});
test("trial comparison selects a measured candidate for review only and checks same suite",async()=>{
  const good=await trialNativeHuggingFace(suite,local());
  const poor=await trialNativeHuggingFace(suite,local(digest2,false));
  const ranked=compareNativeHuggingFaceTrials([poor,good]);
  assert.equal(ranked.recommendedForReview,digest);
  assert.equal(ranked.activationPerformed,false);assert.equal(ranked.independentEvaluatorVerified,false);
  assert.throws(()=>compareNativeHuggingFaceTrials([good,{...poor,fingerprint:"f".repeat(64)}]),/hf-native-comparison-invalid/);
});
test("never allow local inference outside explicit development mode", async()=>{
  const localHost = local();
  await assert.rejects(trialNativeHuggingFace(suite,{...localHost,env:{NODE_ENV:"production",ALLOW_LOCAL_AI_DEV:"true"}}),/hf-local-development-disabled/);
  await assert.rejects(recallNativeHuggingFace({documents:[{reference:"issue:786",text:"hello"}],query:"hello",limit:1},
    {...localHost,env:{NODE_ENV:"development"}}),/hf-local-development-disabled/);
  assert.equal(localHost.paths.length,0);
});
test("refuse malformed suites and semantic inputs before invoking any transport",async()=>{
  const a=local();
  await assert.rejects(trialNativeHuggingFace({suiteId:"bad",cases:[{...suite.cases[0]!,prompt:""}]},a),/hf-native-suite-invalid/);
  await assert.rejects(recallNativeHuggingFace({documents:[{reference:"../secret",text:"a"}],query:"secret",limit:1},a),/hf-native-recall-invalid/);
  assert.equal(a.paths.length,0);
});

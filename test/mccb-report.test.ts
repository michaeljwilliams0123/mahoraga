import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../src/mccb-report.ts", import.meta.url), "utf8").catch(() => "");
const api = source ? await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`) : {};
const cohorts = ["strongest-individual", "homogeneous", "heterogeneous"];
function fixture() {
  const provenance = { sourceSha:"a".repeat(40),suiteDigest:"b".repeat(64),evaluatorDigest:"c".repeat(64),costEnvelopeDigest:"d".repeat(64) };
  return {schemaVersion:1,kind:"mccb-measurements",...provenance,
    budget:{maxDurationMs:1000,maxCostMicros:0,maxWorkers:4},cases:[{caseId:"case-1",repetitions:1}],
    runs:cohorts.map((cohort,index)=>({runId:`run-${index}`,caseId:"case-1",repetition:1,cohort,...provenance,
      evidenceDigest:String(index+1).repeat(64),outcome:"completed",quality:1,durationMs:100,costMicros:0,workers:1,
      duplicateEffects:0,controlViolations:[]}))};
}
function build(input: unknown) {
  assert.equal(typeof api.buildMccbReport,"function","comparative measurement reporting must exist");
  return api.buildMccbReport(input);
}

test("matched cohorts yield descriptive measurements without verification or superiority authority",()=>{
  const result=build(fixture());
  assert.equal(result.coverage,"complete");
  assert.equal(result.independentEvaluationVerified,false);
  assert.equal(result.superiorityEstablished,false);
  assert.equal(result.authorityGranted,false);
  assert.equal(result.inputTrust,"not-authenticated");
  assert.equal(result.cohorts.length,3);
  assert.equal(result.cohorts[0].quality.mean,1);
  assert.equal(result.cohorts[0].runs,1);
  assert.equal(result.rawRuns.length,3);
});
test("missing cohorts and repetitions remain explicit instead of manufacturing a comparison",()=>{
  const input=fixture(); input.cases[0]!.repetitions=2; input.runs=input.runs.slice(0,1);
  const result=build(input);
  assert.equal(result.coverage,"incomplete");
  assert.equal(result.missing.length,5);
  assert.equal(result.cohorts[1].runs,0);
  assert.equal(result.cohorts[1].quality.mean,null);
  assert.equal(result.superiorityEstablished,false);
  input.runs=[];
  assert.equal(build(input).missing.length,6);
});
test("mismatched source, suite, evaluator or cost envelopes are rejected",()=>{
  for(const key of ["sourceSha","suiteDigest","evaluatorDigest","costEnvelopeDigest"]) {
    const input=fixture(); Reflect.set(input.runs[0]!,key,"e".repeat(key==="sourceSha"?40:64));
    assert.throws(()=>build(input),/mccb-report-provenance-mismatch/);
  }
});
test("duplicate cells, execution IDs and copied evidence cannot count as independent runs",()=>{
  const cell=fixture();cell.runs.push({...cell.runs[0]!,runId:"another-run",evidenceDigest:"f".repeat(64)});
  assert.throws(()=>build(cell),/mccb-report-duplicate/);
  for(const key of ["runId","evidenceDigest"]) {
    const input=fixture();Reflect.set(input.runs[1]!,key,Reflect.get(input.runs[0]!,key));
    assert.throws(()=>build(input),/mccb-report-duplicate/);
  }
});
test("runs outside the declared case/repetition matrix are rejected",()=>{
  for(const change of [{caseId:"undeclared"},{repetition:2},{cohort:"invented"}]) {
    const input=fixture();Object.assign(input.runs[0]!,change);
    assert.throws(()=>build(input),/mccb-report-/);
  }
});
test("HOLDs and failures stay in raw results and quality denominators are disclosed",()=>{
  const input=fixture();input.cases[0]!.repetitions=2;
  const held={...input.runs[0]!,runId:"held-run",repetition:2,evidenceDigest:"e".repeat(64),outcome:"held",quality:null};
  const failed={...input.runs[1]!,runId:"failed-run",repetition:2,evidenceDigest:"f".repeat(64),outcome:"failed",quality:0};
  const result=build({...input,runs:[...input.runs,held,failed]});
  assert.equal(result.rawRuns.find((r: {runId:string})=>r.runId==="held-run").quality,null);
  assert.deepEqual(result.cohorts[0].outcomes,{completed:1,failed:0,held:1});
  assert.deepEqual(result.cohorts[0].quality,{observations:1,missing:1,mean:1});
  assert.equal(result.cohorts[1].quality.mean,0.5);
  assert.equal(result.coverage,"incomplete");
});
test("control failures and measured budget/duplicate-effect violations remain visible with complete coverage",()=>{
  const input=fixture();Object.assign(input.runs[0]!,{durationMs:1001,costMicros:1,workers:5,duplicateEffects:1,
    controlViolations:["evaluator-mutation"]});
  const result=build(input);
  assert.equal(result.coverage,"complete");
  assert.equal(result.controlStatus,"violations-reported");
  for(const code of ["evaluator-mutation","duration-budget-exceeded","cost-budget-exceeded","worker-budget-exceeded","duplicate-side-effect"]) {
    assert.ok(result.rawRuns[0].controlViolations.includes(code));
  }
  assert.equal(result.cohorts[0].controlViolationRuns,1);
  assert.equal(result.superiorityEstablished,false);
});
test("nonfinite/out-of-range metrics, unknown keys and private payloads are rejected without reflection",()=>{
  for(const change of [{quality:NaN},{durationMs:-1},{workers:1.5},{quality:1.1},{costMicros:Infinity},
    {duplicateEffects:Number.MAX_SAFE_INTEGER+1},{prompt:"private-sentinel"},{controlViolations:["private-sentinel"]}]) {
    const input=fixture();Object.assign(input.runs[0]!,change);
    assert.throws(()=>build(input),(error: Error)=>{assert.doesNotMatch(error.message,/private-sentinel/);return /mccb-report-/.test(error.message);});
  }
  assert.throws(()=>build({...fixture(),token:"private-sentinel"}),/mccb-report-input-invalid/);
});
test("input ordering does not change report fingerprints or mutate the caller's evidence",()=>{
  const input=fixture();const before=JSON.stringify(input);const first=build(input);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(build({...input,runs:[...input.runs].reverse()}),first);
  assert.match(first.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first.rawRuns[0]),true);
});
test("oversized or ambiguous benchmark matrices are rejected",()=>{
  const input=fixture();
  assert.throws(()=>build({...input,cases:[...input.cases,...input.cases]}),/mccb-report-input-invalid/);
  assert.throws(()=>build({...input,cases:[{caseId:"case-1",repetitions:21}]}),/mccb-report-input-invalid/);
  assert.throws(()=>build({...input,cases:[]}),/mccb-report-input-invalid/);
});
test("coerced outcome objects and trailing-newline identifiers cannot enter public reports",()=>{
  const input=fixture();Reflect.set(input.runs[0]!,"outcome",{toString:()=>"completed",secret:"private-sentinel"});
  assert.throws(()=>build(input),/mccb-report-input-invalid/);
  for(const key of ["sourceSha","suiteDigest","runId","caseId","evidenceDigest"]) {
    const changed=fixture();Reflect.set(changed.runs[0]!,key,String(Reflect.get(changed.runs[0]!,key))+"\n");
    assert.throws(()=>build(changed),/mccb-report-input-invalid/);
  }
});
test("sparse API arrays fail closed with bounded validation errors",()=>{
  const input=fixture();
  assert.throws(()=>build({...input,cases:Array(1)}),/mccb-report-input-invalid/);
  assert.throws(()=>build({...input,runs:Array(1)}),/mccb-report-input-invalid/);
  Reflect.set(input.runs[0]!,"controlViolations",Array(1));
  assert.throws(()=>build(input),/mccb-report-input-invalid/);
});
test("read-only CLI emits the same report and suppresses invalid payloads and filesystem error details",async t=>{
  const cli=fileURLToPath(new URL("../scripts/mccb-report.ts",import.meta.url));
  assert.equal(await access(cli).then(()=>true,()=>false),true,"read-only report CLI must exist");
  const dir=await mkdtemp(join(tmpdir(),"mccb-report-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"measurements.json"),input=fixture();await writeFile(path,JSON.stringify(input));
  const before=await readFile(path,"utf8");
  const output=execFileSync(process.execPath,[cli,path],{encoding:"utf8"});
  assert.deepEqual(JSON.parse(output),build(input));assert.equal(await readFile(path,"utf8"),before);
  await writeFile(path,JSON.stringify({...input,token:"private-sentinel"}));
  for(const args of [[path],[join(dir,"private-sentinel.json")],[],[path,path]]) {
    assert.throws(()=>execFileSync(process.execPath,[cli,...args],{encoding:"utf8",stdio:"pipe"}),error=>{
      const result=error as {stdout:string;stderr:string};assert.equal(result.stdout,"");
      assert.doesNotMatch(result.stderr,/private-sentinel|ENOENT|\/tmp/);assert.match(result.stderr,/mccb-report-/);return true;
    });
  }
  await writeFile(path," ".repeat(2*1024*1024+1));
  assert.throws(()=>execFileSync(process.execPath,[cli,path],{encoding:"utf8",stdio:"pipe"}),error=>{
    assert.match((error as {stderr:string}).stderr,/mccb-report-file-unavailable/);return true;
  });
});

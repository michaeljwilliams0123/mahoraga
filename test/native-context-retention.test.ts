import test from 'node:test';
import assert from 'node:assert/strict';
import {trainNativeContextModel,continueNativeContextModel} from '../src/native-context-model.ts';
import {qualifyNativeContextUpdate} from '../src/native-context-retention.ts';

const source=(text:string,sourceId:string)=>({text,sourceId,rights:'owner-authorized' as const,rightsEvidenceDigest:'a'.repeat(64)});
function fixture() {
 const samples=(pairs:string[],split:string)=>['a','b'].flatMap(first=>pairs.map((pair,i)=>source(first+pair+first,`${split}-${first}-${i}`)));
 const training=samples(['cc','dd','ee','cd','dc'],'root-training'),retention=samples(['ce','ec','de','ed'],'root-retention');
 const parent=trainNativeContextModel({modelId:'retention-root',seed:42,epochs:100,learningRate:.08,contextLength:3,embeddingSize:8,hiddenSize:16,trainingCodeSha:'b'.repeat(40),training,evaluation:retention}).checkpoint;
 const novel=['c','d'].flatMap(marker=>['a','b'].flatMap(label=>['c','d'].map((noise,i)=>source(marker+label+noise+marker,`novel-${marker}-${label}-${i}`))));
 const adaptation=['c','d'].flatMap(marker=>['a','b'].map(label=>source(marker+label+'e'+marker,`adapt-${marker}-${label}`)));
 const input={modelId:'retention-child',seed:42,epochs:100,learningRate:.08,trainingCodeSha:'c'.repeat(40),parentData:{training,evaluation:retention},training:[...training,...novel],evaluation:adaptation};
 return {parent,training,novel,retention,adaptation,input};
}
test('qualification measures real parent/candidate retention and adaptation with no activation authority',()=>{
 const f=fixture(),candidate=continueNativeContextModel(f.parent,f.input).checkpoint;
 const result=qualifyNativeContextUpdate(f.parent,candidate,{retention:f.retention,adaptation:f.adaptation,maximumRetentionLossIncrease:.05,minimumAdaptationLossReduction:.05});
 assert.equal(result.status,'qualified-experiment');assert.equal(result.retention.after.accuracy,1);assert.equal(result.adaptation.after.accuracy,1);
 assert.equal(result.retention.examples,8);assert.equal(result.adaptation.examples,4);
 assert.ok(result.adaptation.before.loss-result.adaptation.after.loss>=.05);
 assert.equal(result.productionActivated,false);assert.equal(result.executionAuthorityGranted,false);assert.equal(result.independentEvaluator,false);
 assert.equal(result.candidateDigest,candidate.fingerprint);assert.ok(Object.isFrozen(result));
});
test('incomplete retention, rebound outcomes, wrong parent and undeclared held-out adaptation fail closed',()=>{
 const f=fixture(),candidate=continueNativeContextModel(f.parent,f.input).checkpoint,policy={retention:f.retention,adaptation:f.adaptation,maximumRetentionLossIncrease:.05,minimumAdaptationLossReduction:.05};
 for(const patch of [{retention:f.retention.slice(1)},{retention:f.retention.map((s,i)=>i?s:{...s,rightsEvidenceDigest:'d'.repeat(64)})},{adaptation:[source('caca','wrong-adaptation')]},{maximumRetentionLossIncrease:Infinity}]) assert.throws(()=>qualifyNativeContextUpdate(f.parent,candidate,{...policy,...patch}));
 assert.throws(()=>qualifyNativeContextUpdate(candidate,candidate,policy));
});
test('a candidate can be held by retention requirements even though training completed',()=>{
 const f=fixture(),candidate=continueNativeContextModel(f.parent,{...f.input,epochs:1}).checkpoint;
 const result=qualifyNativeContextUpdate(f.parent,candidate,{retention:f.retention,adaptation:f.adaptation,maximumRetentionLossIncrease:0,minimumAdaptationLossReduction:10});
 assert.equal(result.status,'held-experiment');assert.ok(result.reasons.includes('adaptation-loss-insufficient'));
 assert.equal(result.productionActivated,false);
});
test('learning new classes without replay is held when the old held-out task is forgotten',()=>{
 const f=fixture(),candidate=continueNativeContextModel(f.parent,{...f.input,training:f.novel}).checkpoint;
 const result=qualifyNativeContextUpdate(f.parent,candidate,{retention:f.retention,adaptation:f.adaptation,maximumRetentionLossIncrease:.05,minimumAdaptationLossReduction:.05});
 assert.equal(result.adaptation.after.accuracy,1);assert.equal(result.retention.before.accuracy,1);assert.equal(result.retention.after.accuracy,0);
 assert.equal(result.status,'held-experiment');assert.ok(result.reasons.includes('retention-accuracy-regression'));assert.ok(result.reasons.includes('retention-loss-regression'));
});
test('later generations must evaluate every earlier reserved held-out example, not a favorable subset',()=>{
 const f=fixture(),child=continueNativeContextModel(f.parent,f.input).checkpoint;
 const adaptation=[source('eace','next-adapt-a'),source('ebce','next-adapt-b')];
 const grandchild=continueNativeContextModel(child,{...f.input,epochs:1,modelId:'retention-grandchild',parentData:{training:f.input.training,evaluation:f.adaptation},evaluation:adaptation}).checkpoint;
 const policy={retention:[...f.retention,...f.adaptation],adaptation,maximumRetentionLossIncrease:.05,minimumAdaptationLossReduction:.05};
 assert.equal(qualifyNativeContextUpdate(child,grandchild,policy).retention.examples,12);
 assert.throws(()=>qualifyNativeContextUpdate(child,grandchild,{...policy,retention:f.retention}),/context-retention-suite-incomplete/);
});

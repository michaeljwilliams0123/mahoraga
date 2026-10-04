import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {trainNativeContextModel,continueNativeContextModel,loadNativeContextCheckpoint,predictNativeContextToken} from '../src/native-context-model.ts';
import {qualifyNativeContextUpdate} from '../src/native-context-retention.ts';

/** Original hand-authored synthetic research. No live experience, provider, model promotion or activation. */
export function runNativeContinualQualification(trainingCodeSha:string) {
 if(!/^[a-f0-9]{40}$/.test(trainingCodeSha))throw new Error('continual-experiment-source-invalid');
 const rightsEvidenceDigest=createHash('sha256').update('Mahoraga hand-authored class incremental and conditional selective recall, version 1').digest('hex');
 const source=(text:string,sourceId:string)=>({sourceId,text,rights:'owner-authorized' as const,rightsEvidenceDigest});
 const samples=(pairs:string[],split:string)=>['a','b'].flatMap(first=>pairs.map((pair,i)=>source(first+pair+first,`${split}-${first}-${i}`)));
 const training=samples(['cc','dd','ee','cd','dc'],'root-training'),retention=samples(['ce','ec','de','ed'],'root-retention');
 const novel=['c','d'].flatMap(marker=>['a','b'].flatMap(label=>['c','d'].map((noise,i)=>source(marker+label+noise+marker,`class-${marker}-${label}-${i}`))));
 const adaptation=['c','d'].flatMap(marker=>['a','b'].map(label=>source(marker+label+'e'+marker,`class-heldout-${marker}-${label}`)));
 const conditionalTraining=['c','d'].flatMap(marker=>['a','b'].flatMap(label=>['c','d'].map((noise,i)=>source(marker+label+noise+(marker==='c'?label:label==='a'?'b':'a'),`conditional-${marker}-${label}-${i}`))));
 const conditionalEvaluation=['c','d'].flatMap(marker=>['a','b'].map(label=>source(marker+label+'e'+(marker==='c'?label:label==='a'?'b':'a'),`conditional-heldout-${marker}-${label}`)));
 const runs=[7,42,1337].map(seed=>{
  const parent=trainNativeContextModel({modelId:'native-continual-root',seed,epochs:100,learningRate:.08,contextLength:3,embeddingSize:8,hiddenSize:16,trainingCodeSha,training,evaluation:retention}).checkpoint;
  const parentBytes=JSON.stringify(parent),input={modelId:'native-continual-child',seed,epochs:100,learningRate:.08,trainingCodeSha,parentData:{training,evaluation:retention},training:[...training,...novel],evaluation:adaptation};
  const replay=continueNativeContextModel(parent,input).checkpoint,withoutReplay=continueNativeContextModel(parent,{...input,modelId:'native-continual-no-replay',training:novel}).checkpoint;
  const stress=continueNativeContextModel(parent,{...input,modelId:'native-conditional-stress',training:[...training,...conditionalTraining],evaluation:conditionalEvaluation}).checkpoint;
  const policy={retention,adaptation,maximumRetentionLossIncrease:.05,minimumAdaptationLossReduction:.05};
  const restored=loadNativeContextCheckpoint(JSON.stringify(replay));
  return {seed,parameterCount:replay.weights.length,parentUnchanged:JSON.stringify(parent)===parentBytes,
   saveLoadEqual:[...retention,...adaptation].every(s=>JSON.stringify(predictNativeContextToken(replay,s.text.slice(0,-1)))===JSON.stringify(predictNativeContextToken(restored,s.text.slice(0,-1)))),
   replay:qualifyNativeContextUpdate(parent,replay,policy),withoutReplay:qualifyNativeContextUpdate(parent,withoutReplay,policy),
   conditionalStress:qualifyNativeContextUpdate(parent,stress,{...policy,adaptation:conditionalEvaluation})};
 });
 return {schemaVersion:1,status:runs.every(r=>r.replay.status==='qualified-experiment'&&r.parentUnchanged&&r.saveLoadEqual)?'qualified-class-incremental-experiment':'experiment-failed',
  task:'synthetic-class-incremental-selective-recall-v1',sourceSha:trainingCodeSha,architectureVersion:'single-head-causal-context-v1',
  rootTrainingExamples:10,newClassTrainingExamples:8,retentionExamples:8,adaptationExamples:4,runs,
  creditCost:0,providerInvocations:0,productionActivated:false,executionAuthorityGranted:false,independentEvaluator:false,
  limitations:['hand-authored synthetic class-incremental recall only','the taught recall rule is shared across phases',
   'same-process evaluation with development-selected tasks and configuration','conditional-rule stress is a separate capability gap',
   'no authenticated live-experience ingestion, model promotion, production inference or general-intelligence qualification']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  git(['ls-files','--error-unmatch','src/native-context-model.ts','src/native-context-retention.ts','scripts/native-continual-experiment.ts','model-foundry/contracts/context-continuation.schema.json']);
  if(git(['status','--porcelain','--untracked-files=no']))throw new Error('continual-experiment-clean-source-required');
  const result=runNativeContinualQualification(git(['rev-parse','HEAD']));console.log(JSON.stringify(result,null,2));
  if(result.status!=='qualified-class-incremental-experiment')process.exitCode=1;
 }catch{console.error('continual-experiment-source-or-qualification-unverified');process.exitCode=1;}
}

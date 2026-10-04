import {createHash} from 'node:crypto';
import {loadNativeContextCheckpoint,evaluateNativeContextModel} from './native-context-model.ts';
import type {NativeContextCheckpoint} from './native-context-model.ts';
import type {NativeTrainingSource} from './native-model-foundry.ts';

type Policy = {retention:NativeTrainingSource[];adaptation:NativeTrainingSource[];maximumRetentionLossIncrease:number;minimumAdaptationLossReduction:number};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code:string):never {throw new Error(code);}
function freeze<T>(value:T):T {if(value && typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
function reference(source:NativeTrainingSource,tokenizer:string[]) {
 return {sourceId:source.sourceId,contentDigest:hash(source.text),contextDigest:hash([...source.text].slice(0,-1).map(token=>Math.max(0,tokenizer.indexOf(token)))),rights:source.rights,rightsEvidenceDigest:source.rightsEvidenceDigest};
}
function measure(checkpoint:NativeContextCheckpoint,sources:NativeTrainingSource[]) {
 if(!Array.isArray(sources)||sources.length<1||sources.length>512||new Set(sources.map(s=>s?.sourceId)).size!==sources.length) fail('context-retention-corpus-invalid');
 let loss=0,accuracy=0,unknownTokens=0;
 for(let offset=0;offset<sources.length;offset+=32){
  const result=evaluateNativeContextModel(checkpoint,sources.slice(offset,offset+32));
  loss+=result.loss*result.examples;accuracy+=result.accuracy*result.examples;unknownTokens+=result.unknownTokens;
 }
 return {loss:loss/sources.length,accuracy:accuracy/sources.length,unknownTokens};
}
/** Research qualification only: authentic evaluator/rights provenance and incumbent promotion remain separate. */
export function qualifyNativeContextUpdate(parent:NativeContextCheckpoint,candidate:NativeContextCheckpoint,policy:Policy) {
 const before=loadNativeContextCheckpoint(JSON.stringify(parent)),after=loadNativeContextCheckpoint(JSON.stringify(candidate)),m=after.manifest;
 if(!policy||Object.keys(policy).sort().join(',')!=='adaptation,maximumRetentionLossIncrease,minimumAdaptationLossReduction,retention'
  ||!Number.isFinite(policy.maximumRetentionLossIncrease)||policy.maximumRetentionLossIncrease<0||policy.maximumRetentionLossIncrease>.25
  ||!Number.isFinite(policy.minimumAdaptationLossReduction)||policy.minimumAdaptationLossReduction<.000001||policy.minimumAdaptationLossReduction>10) fail('context-retention-policy-invalid');
 if(m.schemaVersion!==2||m.parentModel!==before.fingerprint||m.rollbackCheckpoint!==before.fingerprint
  ||m.generation!==(before.manifest.generation??0)+1||m.rootCheckpoint!==(before.manifest.rootCheckpoint??before.fingerprint)
  ||m.initializationSeed!==before.manifest.initializationSeed||JSON.stringify(before.tokenizer)!==JSON.stringify(after.tokenizer)
  ||['contextLength','embeddingSize','hiddenSize'].some(key=>m[key as 'contextLength']!==before.manifest[key as 'contextLength'])) fail('context-retention-lineage-mismatch');
 const retentionBefore=measure(before,policy.retention),retentionAfter=measure(after,policy.retention);
 if(before.manifest.schemaVersion===1){
  if(evaluateNativeContextModel(before,policy.retention).dataManifest!==before.manifest.evaluationDataManifest) fail('context-retention-suite-incomplete');
 }else{
  const history=before.manifest.evaluationHistory!;
  if(history.length!==policy.retention.length||policy.retention.some(s=>!history.some(r=>JSON.stringify(r)===JSON.stringify(reference(s,before.tokenizer))))) fail('context-retention-suite-incomplete');
 }
 const expectedHistory=before.manifest.evaluationHistory??policy.retention.map(s=>reference(s,before.tokenizer));
 if(expectedHistory.some(r=>!m.evaluationHistory!.some(s=>JSON.stringify(s)===JSON.stringify(r)))) fail('context-retention-lineage-mismatch');
 const adaptationBefore=evaluateNativeContextModel(before,policy.adaptation),adaptationAfter=evaluateNativeContextModel(after,policy.adaptation);
 if(adaptationAfter.dataManifest!==m.evaluationDataManifest) fail('context-adaptation-suite-mismatch');
 const reasons=[...(retentionBefore.unknownTokens||retentionAfter.unknownTokens||adaptationBefore.unknownTokens||adaptationAfter.unknownTokens?['unknown-evaluation-tokens']:[]),
  ...(retentionAfter.accuracy<retentionBefore.accuracy?['retention-accuracy-regression']:[]),
  ...(retentionAfter.loss>retentionBefore.loss+policy.maximumRetentionLossIncrease?['retention-loss-regression']:[]),
  ...(adaptationAfter.accuracy!==1?['adaptation-accuracy-incomplete']:[]),
  ...(adaptationBefore.loss-adaptationAfter.loss<policy.minimumAdaptationLossReduction?['adaptation-loss-insufficient']:[])];
 const core={schemaVersion:1,kind:'native-context-retention-qualification',status:reasons.length?'held-experiment':'qualified-experiment',reasons,
  parentDigest:before.fingerprint,candidateDigest:after.fingerprint,generation:m.generation!,
  retention:{examples:policy.retention.length,before:retentionBefore,after:retentionAfter},
  adaptation:{examples:policy.adaptation.length,before:{loss:adaptationBefore.loss,accuracy:adaptationBefore.accuracy,unknownTokens:adaptationBefore.unknownTokens},
   after:{loss:adaptationAfter.loss,accuracy:adaptationAfter.accuracy,unknownTokens:adaptationAfter.unknownTokens}},
  policy:{maximumRetentionLossIncrease:policy.maximumRetentionLossIncrease,minimumAdaptationLossReduction:policy.minimumAdaptationLossReduction},
  independentEvaluator:false,productionActivated:false,executionAuthorityGranted:false,creditCost:0,providerInvocations:0};
 return freeze({...core,fingerprint:hash(core)});
}

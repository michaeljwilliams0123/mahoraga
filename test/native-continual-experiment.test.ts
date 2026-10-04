import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeContinualQualification} from '../scripts/native-continual-experiment.ts';
test('fixed-seed continual qualification measures class growth, retention, forgetting and a harder rule limitation',()=>{
 const proof=runNativeContinualQualification('b'.repeat(40));
 assert.equal(proof.status,'qualified-class-incremental-experiment');assert.deepEqual(proof.runs.map(r=>r.seed),[7,42,1337]);
 for(const run of proof.runs){
  assert.equal(run.replay.status,'qualified-experiment');assert.equal(run.replay.adaptation.before.accuracy,0);assert.equal(run.replay.adaptation.after.accuracy,1);
  assert.equal(run.replay.retention.after.accuracy,1);assert.equal(run.withoutReplay.retention.after.accuracy,0);assert.equal(run.withoutReplay.status,'held-experiment');
  assert.equal(run.parentUnchanged,true);assert.equal(run.saveLoadEqual,true);assert.equal(run.parameterCount,510);
  if(run.conditionalStress.adaptation.after.accuracy<1)assert.equal(run.conditionalStress.status,'held-experiment');
 }
 assert.equal(proof.creditCost,0);assert.equal(proof.providerInvocations,0);assert.equal(proof.productionActivated,false);assert.equal(proof.executionAuthorityGranted,false);
 const text=JSON.stringify(proof);assert.ok(!text.includes('rightsEvidenceDigest'));assert.ok(!text.includes('weights'));assert.ok(!text.includes('root-training'));
 assert.throws(()=>runNativeContinualQualification('invalid-source'));
});

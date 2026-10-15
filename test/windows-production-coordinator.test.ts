import test from 'node:test';
import assert from 'node:assert/strict';
import { activateWindowsCandidate, activationCompleted, type WindowsActivationAdapter, type RuntimeObservation } from '../src/windows-production-coordinator.ts';
const host = 'TEST-MIKE-PC'; // Fixture only, never a real-machine identity claim.
const target = 'e5cda30645461f0ede94ee20ef804ec8f78ad210';
const old = '397acebf16766f44e3b4317f9d8b68b10de5f821';
const context = { confirmedHost: host, targetSha: target, incumbentSha: old };
function fixture() {
 const calls: string[] = []; let current = old;
 const observation = (sha: string): RuntimeObservation => ({host, sourceSha:sha, authoritySha:target, healthy:true, stateCompatible:true});
 const adapter: WindowsActivationAdapter = {
  async observeHost() { calls.push('host'); return {platform:'win32',host}; },
  async authoritativeMain() { calls.push('main'); return target; },
  async observeProduction() { calls.push('production'); return observation(current); },
  async checkpoint() { calls.push('checkpoint'); return {id:'checkpoint-test',host,sourceSha:old}; },
  async verifyCheckpoint() { calls.push('checkpoint-verified'); },
  async rehearseRollback() { calls.push('rehearsal'); },
  async stageCandidate() { calls.push('stage'); },
  async observeCandidate() { calls.push('candidate'); return observation(target); },
  async admitWithIncumbent() { calls.push('incumbent-admission'); },
  async promote() { calls.push('promote'); current = target; },
  async restoreProduction() { calls.push('restore-production'); current = old; },
  async stopCandidate() { calls.push('stop-candidate'); },
 };
 return {adapter,calls,observation};
}
test('successful activation checkpoints/rehearses before mutation and stops candidate', async () => {
 const f=fixture(); const result=await activateWindowsCandidate(context,f.adapter);
 assert.equal(result.state,'activated'); assert.equal(result.candidateStopped,true);
 assert.equal(activationCompleted(result),true);
 assert.ok(f.calls.indexOf('checkpoint-verified')<f.calls.indexOf('stage'));
 assert.ok(f.calls.indexOf('rehearsal')<f.calls.indexOf('stage'));
 assert.ok(f.calls.indexOf('candidate')<f.calls.indexOf('incumbent-admission'));
 for(const gate of ['checkpoint-verified','rehearsal','candidate','incumbent-admission']) assert.ok(f.calls.indexOf(gate)<f.calls.indexOf('promote'));
 assert.equal(f.calls.includes('restore-production'),false);
});
test('wrong device holds before checkpoint or mutation', async () => {
 const f=fixture(); f.adapter.observeHost=async()=>({platform:'win32',host:'OTHER-PC'});
 assert.equal((await activateWindowsCandidate(context,f.adapter)).reason,'target-device-mismatch'); assert.equal(f.calls.includes('checkpoint'),false);
});
test('unhealthy or incompatible candidate never stops incumbent', async () => {
 for(const field of ['healthy','stateCompatible'] as const) {
  const f=fixture(); f.adapter.observeCandidate=async()=>({...f.observation(target),[field]:false});
  assert.equal((await activateWindowsCandidate(context,f.adapter)).state,'held'); assert.equal(f.calls.includes('promote'),false); assert.equal(f.calls.includes('stop-candidate'),true);
 }
});
test('independent incumbent admission failure holds without leaking private error', async () => {
 const f=fixture(); f.adapter.admitWithIncumbent=async()=>{throw new Error('private machine detail');};
 const r=await activateWindowsCandidate(context,f.adapter); assert.equal(r.reason,'activation-operation-failed'); assert.equal(f.calls.includes('promote'),false);
});
test('main moving immediately before mutation denies promotion', async () => {
 const f=fixture(); let reads=0; f.adapter.authoritativeMain=async()=>++reads===1?target:'a'.repeat(40);
 assert.equal((await activateWindowsCandidate(context,f.adapter)).reason,'target-main-drift'); assert.equal(f.calls.includes('promote'),false);
});
test('partial promotion failure restores production, not merely candidate', async () => {
 const f=fixture(); f.adapter.promote=async()=>{f.calls.push('promote');throw new Error('startup failed');};
 const r=await activateWindowsCandidate(context,f.adapter); assert.equal(r.state,'rolled-back');
 assert.ok(f.calls.indexOf('restore-production')>f.calls.indexOf('promote')); assert.equal(f.calls.at(-1),'stop-candidate');
});
test('failed production canary restores incumbent', async () => {
 const f=fixture(); let reads=0; f.adapter.observeProduction=async()=>++reads===3?{...f.observation(target),healthy:false}:f.observation(old);
 assert.equal((await activateWindowsCandidate(context,f.adapter)).state,'rolled-back'); assert.ok(f.calls.includes('restore-production'));
});
test('failed restoration is reported, never called successful rollback', async () => {
 const f=fixture(); f.adapter.promote=async()=>{throw new Error('failure');}; f.adapter.restoreProduction=async()=>{throw new Error('failure');};
 assert.equal((await activateWindowsCandidate(context,f.adapter)).state,'rollback-failed');
});
test('candidate cleanup failure cannot produce a completed activation receipt', async () => {
 const f=fixture(); f.adapter.stopCandidate=async()=>{throw new Error('failure');};
 const r=await activateWindowsCandidate(context,f.adapter); assert.equal(r.candidateStopped,false); assert.equal(r.reason,'candidate-teardown-unverified'); assert.equal(activationCompleted(r),false);
});
test('checkpoint verification or rehearsal failure holds before staging', async () => {
 for(const gate of ['verifyCheckpoint','rehearseRollback'] as const) {
  const f=fixture(); f.adapter[gate]=async()=>{throw new Error('failure');};
  assert.equal((await activateWindowsCandidate(context,f.adapter)).state,'held'); assert.equal(f.calls.includes('stage'),false); assert.equal(f.calls.includes('promote'),false);
 }
});
test('partial staging failure still tears down candidate without touching production', async () => {
 const f=fixture(); f.adapter.stageCandidate=async()=>{throw new Error('partial staging');};
 const r=await activateWindowsCandidate(context,f.adapter); assert.equal(r.state,'held'); assert.equal(r.candidateStopped,true); assert.equal(f.calls.includes('promote'),false);
});
test('restored listener with wrong source is a failed rollback', async () => {
 const f=fixture(); let reads=0; f.adapter.promote=async()=>{throw new Error('failure');};
 f.adapter.observeProduction=async()=>++reads>2?f.observation(target):f.observation(old);
 assert.equal((await activateWindowsCandidate(context,f.adapter)).state,'rollback-failed');
});
test('device identity changing after admission denies mutation', async () => {
 const f=fixture(); let reads=0; f.adapter.observeHost=async()=>({platform:'win32',host:++reads===1?host:'OTHER-PC'});
 assert.equal((await activateWindowsCandidate(context,f.adapter)).reason,'target-device-mismatch'); assert.equal(f.calls.includes('promote'),false);
});

test('rejected checkpoint metadata cannot leak a private path in the outcome', async () => {
 const f=fixture();
 f.adapter.checkpoint=async()=>({id:'C:\\private-owner\\checkpoint',host,sourceSha:old});
 const result=await activateWindowsCandidate(context,f.adapter);
 assert.equal(result.reason,'checkpoint-binding-invalid');
 assert.equal(result.checkpointId,null);
 assert.equal(JSON.stringify(result).includes('private-owner'),false);
 assert.equal(f.calls.includes('stage'),false);
});

test('candidate host/source/authority mismatch holds before promotion and cleans up', async () => {
 for(const patch of [{host:'OTHER-PC'},{sourceSha:old},{authoritySha:old}]) {
  const f=fixture(); f.adapter.observeCandidate=async()=>({...f.observation(target),...patch});
  const result=await activateWindowsCandidate(context,f.adapter);
  assert.equal(result.reason,'candidate-canary-invalid');
  assert.equal(result.state,'held');
  assert.equal(result.candidateStopped,true);
  assert.equal(f.calls.includes('promote'),false);
  assert.equal(f.calls.includes('restore-production'),false);
 }
});

test('incumbent drift after admission holds before the first production mutation', async () => {
 for(const patch of [{sourceSha:target},{authoritySha:old},{healthy:false},{stateCompatible:false}]) {
  const f=fixture(); let reads=0;
  f.adapter.observeProduction=async()=>({...f.observation(old),...(++reads===2?patch:{})});
  const result=await activateWindowsCandidate(context,f.adapter);
  assert.equal(result.reason,'incumbent-drift');
  assert.equal(result.state,'held');
  assert.equal(f.calls.includes('promote'),false);
  assert.equal(f.calls.includes('restore-production'),false);
 }
});

test('promotion is attempted once and uncertain failure restores once before cleanup', async () => {
 const f=fixture();
 f.adapter.promote=async()=>{f.calls.push('promote');throw new Error('private launch output');};
 const result=await activateWindowsCandidate(context,f.adapter);
 assert.equal(result.state,'rolled-back');
 assert.equal(f.calls.filter(call=>call==='promote').length,1);
 assert.equal(f.calls.filter(call=>call==='restore-production').length,1);
 assert.equal(f.calls.filter(call=>call==='stop-candidate').length,1);
 assert.equal(JSON.stringify(result).includes('private launch output'),false);
 assert.equal(activationCompleted(result),false);
 assert.equal(Object.isFrozen(result),true);
});

test('restored production must have health, compatibility, host and authority', async () => {
 for(const patch of [{healthy:false},{stateCompatible:false},{host:'OTHER-PC'},{authoritySha:old}]) {
  const f=fixture(); let reads=0;
  f.adapter.promote=async()=>{throw new Error('failed launch');};
  f.adapter.observeProduction=async()=>({...f.observation(old),...(++reads===3?patch:{})});
  const result=await activateWindowsCandidate(context,f.adapter);
  assert.equal(result.state,'rollback-failed');
  assert.equal(result.reason,'production-restore-unverified');
  assert.equal(result.candidateStopped,true);
 }
});

test('invalid contexts and unsupported platforms hold before checkpointing', async () => {
 for(const patch of [{confirmedHost:''},{targetSha:'short'},{incumbentSha:'A'.repeat(40)}]) {
  const f=fixture(); const result=await activateWindowsCandidate({...context,...patch},f.adapter);
  assert.equal(result.reason,'activation-context-invalid');
  assert.deepEqual(f.calls,[]);
 }
 const f=fixture(); f.adapter.observeHost=async()=>({platform:'linux',host});
 assert.equal((await activateWindowsCandidate(context,f.adapter)).reason,'target-device-mismatch');
 assert.equal(f.calls.includes('checkpoint'),false);
});

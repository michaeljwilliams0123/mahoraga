import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startRuntime } from '../src/runtime.mjs';
const SHA='dfe9df9cb5e48c5db1a58cdc94cf92eb31ef55dc';
const positions=[
 {individualId:'majority-a',conclusion:'deploy',confidence:0.7,evidenceRefs:['majority-a-evidence'],assumptions:[],unknowns:[],dissentTags:[]},
 {individualId:'majority-b',conclusion:'deploy',confidence:0.72,evidenceRefs:['majority-b-evidence'],assumptions:[],unknowns:[],dissentTags:[]},
 {individualId:'minority-rescue',conclusion:'hold',confidence:0.95,evidenceRefs:['minority-evidence'],assumptions:[],unknowns:['causal-gap'],dissentTags:['safety-risk']},
];
test('held-out deliberation traverses supervisor/router and persists empirical receipt', {concurrency:false}, async(t)=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'mhg-cognitive-empirical-'));
 const runtime=await startRuntime({port:0,databaseFile:path.join(root,'runtime.sqlite'),contentVaultMasterKey:Buffer.alloc(32,41),primaryCodexToken:'cognitive-empirical-token-00000000000001',syncCoordinationMailbox:false,repositoryHeadReader:async()=>SHA,authoritativeHeadReader:async()=>SHA,expectedSourceCommit:SHA});
 t.after(async()=>{await runtime.stop();rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});});
 await waitFor(()=>runtime.supervisor.status().find(w=>w.workerId==='cognitive-core')?.readiness.find(r=>r.capability==='cognitive.deliberate')?.providerStatus==='ready');
 const task=runtime.database.submitTask({capability:'cognitive.deliberate',dataClass:'synthetic',requestedMode:'local',executionPlane:'local',idempotencyKey:'empirical-cognitive-deliberation-536',correlationId:'issue-536-minority-rescue',requestedOutcome:'Run held-out minority-rescue challenge.',allowedWorkerIds:['cognitive-core'],policyVersion:'legacy-internal',capabilityInput:{positions}});
 const completed=await waitFor(()=>{const x=runtime.database.getTask(task.id);return x?.status==='completed'?x:null;});
 const receipt=runtime.database.listReceipts(completed.id)[0];
 assert.equal(receipt.capability,'cognitive.deliberate');assert.equal(receipt.outcome,'succeeded');
 assert.equal(receipt.receipt.details.providerEvidence.sourceCommit,SHA);
 assert.equal(receipt.receipt.details.providerEvidence.challengeId,'issue-536-minority-rescue');
 assert.equal(receipt.receipt.details.providerEvidence.routeWorker,'cognitive-core');
 assert.match(receipt.receipt.details.providerEvidence.inputsSha256,/^[a-f0-9]{64}$/);
 assert.equal(receipt.receipt.details.outputEvidence.deliberation.decision,'hold');
 assert.equal(receipt.receipt.details.outputEvidence.deliberation.materialDissent.length>0,true);
 assert.equal(JSON.stringify(receipt).includes('privateEpisodicRefs'),false);
});
async function waitFor(check,timeoutMs=8000){const end=Date.now()+timeoutMs;while(Date.now()<end){const v=await check();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for cognitive empirical receipt.');}

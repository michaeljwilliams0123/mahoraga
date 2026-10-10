import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrokbotAdmission, executeAdmittedGrokbotCapability } from '../src/grokbot-host.ts';
const sha = 'a'.repeat(40);
const task = { id:'task-1',capability:'cognitive.assess',expectedSourceCommit:sha,capabilityInput:{metacognition:{evidenceCoverage:0.9,calibratedConfidence:0.9,knownUnknowns:[],materialConflictCount:0,reversible:true}} };
const authorityDecision = {kind:'authority-decision-v1',decision:'allow',owner:{confirmationRequired:false},request:{capability:task.capability},provider:{id:'cognitive-core',costClass:'deterministic'}};
const provenance = {state:'current',sourceCommit:sha,expectedSourceCommit:sha};
test('host issues task-bound admission and executes a cognitive child', async()=>{
 const admission=createGrokbotAdmission({task,authorityDecision,provenance});
 const result=await executeAdmittedGrokbotCapability(task.capability,task,admission);
 assert.equal(result.assessment.action,'proceed'); assert.ok(result.grokbot.threadId>0);
 assert.equal(result.receiptMetadata.sourceCommit,sha);
 assert.equal(result.grokbot.parentAgentId,'cognitive-core');
});
test('host rejects missing/drifting provenance and denied or wrong authority',()=>{
 for(const evidence of [null,{...provenance,state:'runtime-drift'},{...provenance,sourceCommit:'b'.repeat(40)}]) assert.throws(()=>createGrokbotAdmission({task,authorityDecision,provenance:evidence}),/provenance/);
 for(const decision of [null,{...authorityDecision,decision:'hold'},{...authorityDecision,provider:{id:'other',costClass:'deterministic'}},{...authorityDecision,owner:{confirmationRequired:true}}]) assert.throws(()=>createGrokbotAdmission({task,authorityDecision:decision,provenance}),/authority/);
});
test('IPC admission cannot be reused for a different task, input or source',async()=>{
 const admission=createGrokbotAdmission({task,authorityDecision,provenance});
 for(const changed of [{...task,id:'task-2'},{...task,capabilityInput:{}},{...task,expectedSourceCommit:'b'.repeat(40)}]) await assert.rejects(executeAdmittedGrokbotCapability(task.capability,changed,admission),/admission/);
 await assert.rejects(executeAdmittedGrokbotCapability(task.capability,task,null),/admission/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicMemoryEmbedding, memoryDecayScore, planMemoryPruning } from '../deploy/cloudflare-execution-runtime/memory-engine.ts';

test('deterministic memory embeddings are normalized, stable, and query-sensitive',()=>{
 const first=deterministicMemoryEmbedding('Provider renewal failed closed after the canary expired.');
 const again=deterministicMemoryEmbedding('Provider renewal failed closed after the canary expired.');
 const different=deterministicMemoryEmbedding('A cognitive cycle promoted a durable lesson.');
 assert.equal(first.length,384);assert.deepEqual(first,again);assert.notDeepEqual(first,different);
 const magnitude=Math.sqrt(first.reduce((sum,value)=>sum+value*value,0));
 assert.ok(Math.abs(magnitude-1)<1e-6);
});

test('decay uses hours and clamps utility to the documented zero-to-one range',()=>{
 assert.equal(memoryDecayScore({utilityScore:1,createdAt:0},0),1);
 assert.ok(Math.abs(memoryDecayScore({utilityScore:0.5,createdAt:0},3_600_000)-0.4999500024999167)<1e-12);
 assert.throws(()=>memoryDecayScore({utilityScore:1.1,createdAt:0},0),/memory-utility-invalid/);
 assert.throws(()=>memoryDecayScore({utilityScore:0.5,createdAt:1},0),/memory-created-at-invalid/);
});

test('pruning is two-stage: low-score records are marked first and only mature candidates are deleted',()=>{
 const now=Date.parse('2026-10-06T18:00:00Z');const old=now-365*24*3_600_000;const grace=24*3_600_000;
 const plan=planMemoryPruning([
  {id:'mark',utilityScore:0,createdAt:old,pruneCandidateAt:null},
  {id:'delete',utilityScore:0,createdAt:old,pruneCandidateAt:now-grace},
  {id:'keep',utilityScore:1,createdAt:now,pruneCandidateAt:now-grace},
 ],{now,minRetentionScore:0.15,graceMs:grace});
 assert.deepEqual(plan,{markCandidateIds:['mark'],deleteIds:['delete'],clearCandidateIds:['keep']});
});

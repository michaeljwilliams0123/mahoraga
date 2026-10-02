import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeReadiness, watchRuntimeReadiness } from '../lib/runtime-readiness.ts';
const sha='a'.repeat(40);const now=Date.parse('2026-10-02T01:00:00Z');
const good={status:'ready',sha,durableState:'cloudflare-do-sqlite',observedAt:new Date(now).toISOString()};
test('readiness needs exact published source, durable storage and fresh bounded fields',()=>{
 assert.ok(parseRuntimeReadiness(good,sha,now));
 for(const bad of [{...good,sha:'b'.repeat(40)},{...good,durableState:'memory'},{...good,observedAt:new Date(now-61000).toISOString()},{...good,observedAt:new Date(now+60000).toISOString()},{...good,token:'private'}, {...good,status:'live'}])assert.equal(parseRuntimeReadiness(bad,sha,now),null);
 assert.equal(parseRuntimeReadiness(good,null,now),null);
});
test('polling does not overlap, clears expired ready, pauses hidden views and ignores stop-late results',async()=>{
 let visible=true;let reads=0;let resolve:(v:unknown)=>void=()=>{};let clock=now;
 const timers=new Map<number,{fn:()=>void,delay:number}>();let id=0;const states:string[]=[];
 const watch=watchRuntimeReadiness({expectedSha:sha,now:()=>clock,visible:()=>visible,read:()=>{reads++;return new Promise(r=>{resolve=r;});},emit:s=>states.push(s.phase),schedule:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},cancel:key=>{timers.delete(key);}});
 watch.refresh();watch.refresh();assert.equal(reads,1);resolve(good);await Promise.resolve();await Promise.resolve();assert.equal(states.at(-1),'fresh');
 const expiry=[...timers.values()].find(t=>t.delay===60000);assert.ok(expiry);clock+=60000;expiry.fn();assert.equal(states.at(-1),'stale');
 visible=false;watch.refresh();assert.equal(states.at(-1),'paused');assert.equal(reads,1);
 visible=true;watch.refresh();assert.equal(reads,2);watch.stop();resolve({...good,observedAt:new Date(clock).toISOString()});await Promise.resolve();await Promise.resolve();assert.notEqual(states.at(-1),'fresh');
});

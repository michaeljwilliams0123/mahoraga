import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeReadiness } from '../deploy/cloudflare-owner-gateway/runtime-readiness.ts';
const ready={status:'ready',sha:'a'.repeat(40),durableState:'cloudflare-do-sqlite'};
test('fixed service readiness returns only bounded facts with observation time',async()=>{
 const response=await runtimeReadiness({async fetch(request){assert.equal(new URL(request.url).pathname,'/api/ready');assert.equal(request.method,'GET');assert.equal(request.headers.has('authorization'),false);return Response.json(ready);}});
 assert.equal(response.status,200);const value=await response.json() as Record<string,unknown>;assert.equal(value.sha,ready.sha);assert.equal(Object.keys(value).sort().join(','),'durableState,observedAt,sha,status');
});
test('binding loss, unexpected fields, bad storage and malformed response fail closed',async()=>{
 assert.equal((await runtimeReadiness(undefined)).status,503);
 for(const value of [{...ready,secret:'private'},{...ready,durableState:'memory'},{...ready,sha:'short'},{status:'live'}]){
  const response=await runtimeReadiness({async fetch(){return Response.json(value);}});assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
 }
});
test('binding and response decoding are time bounded without an external fallback',async()=>{
 let signal:AbortSignal|null|undefined;let calls=0;
 const response=await runtimeReadiness({async fetch(request){signal=request.signal;calls++;return new Promise(()=>{});}},10);
 assert.equal(response.status,503);assert.equal(signal?.aborted,true);assert.equal(calls,1);
});
test('oversized upstream body is cancelled and never forwarded',async()=>{
 let cancelled=false;const response=await runtimeReadiness({async fetch(){return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(5000)));},cancel(){cancelled=true;}}));}});
 assert.equal(response.status,503);assert.equal(cancelled,true);
});
test('stalled response body is cancelled at the deadline',async()=>{
 let cancelled=false;
 const response=await runtimeReadiness({async fetch(){return new Response(new ReadableStream({cancel(){cancelled=true;}}));}},10);
 assert.equal(response.status,503);assert.equal(cancelled,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderCloudflareBridgeFrame } from '../deploy/cloudflare-owner-gateway/bridge-frame.ts';
function harness(fetchImpl: typeof fetch, origins: string | readonly string[] = 'https://pages.example') {
 const posts: Record<string, unknown>[] = []; const timers = new Map<number, () => void>(); let next=0;
 let handler: (e: unknown) => Promise<void> = async()=>{};
 const postedOrigins: string[] = [];
 const parent={postMessage(value: Record<string,unknown>,origin:string){assert.ok((typeof origins === 'string' ? [origins] : origins).includes(origin)); postedOrigins.push(origin); posts.push(value);}};
 const script=renderCloudflareBridgeFrame(origins).split('<script>')[1]?.split('</script>')[0]; assert.ok(script);
 runInNewContext(script,{window:{parent,addEventListener(_type:string,fn:typeof handler){handler=fn;}},fetch:fetchImpl,AbortController,TextEncoder,Blob,Error,setTimeout(fn:()=>void){const id=++next;timers.set(id,fn);return id;},clearTimeout(id:number){timers.delete(id);}});
 const send=(data:Record<string,unknown>,origin='https://pages.example',source:unknown=parent)=>handler({data,origin,source});
 const message={protocolVersion:1,requestId:'breq-test-1',type:'bridge.action',action:'capabilities',payload:{}};
 return {send,message,posts,timers,parent,postedOrigins};
}
test('wrong origins, sources and extra request fields never reach the service',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return Response.json({capabilities:[]});});
 await h.send(h.message,'https://other.example');await h.send(h.message,undefined,{});await h.send({...h.message,endpoint:'https://other.example'});
 assert.equal(calls,0);assert.equal(h.posts.length,0);
});
test('Access expiry clears frame authentication and exposes only an owner-auth code',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return new Response('private access page',{status:401});});
 await h.send(h.message);assert.equal(h.posts[0]?.error,'cloud-owner-auth-required');
 await h.send({...h.message,requestId:'breq-test-2',type:'bridge.status',action:undefined,payload:undefined}); // extra keys rejected
 await h.send({protocolVersion:1,requestId:'breq-test-3',type:'bridge.status'});
 assert.equal((h.posts.at(-1)?.result as {authenticated:boolean}).authenticated,false);assert.equal(calls,1);
});
test('stalled response decoding has a deadline, aborts once and never replays',async()=>{
 let calls=0;let signal:AbortSignal|null|undefined;
 const h=harness(async(_input,init)=>{calls++;signal=init?.signal;return {status:200,ok:true,json:()=>new Promise(()=>{})} as Response;});
 const pending=h.send(h.message);await Promise.resolve();for(const timer of h.timers.values())timer();await pending;
 assert.equal(h.posts[0]?.error,'cloud-request-timeout');assert.equal(signal?.aborted,true);assert.equal(calls,1);assert.equal(h.timers.size,0);
});
test('oversized actions and malformed responses return bounded errors',async()=>{
 const h=harness(async()=>Response.json(null));await h.send({...h.message,payload:{content:'x'.repeat(33000)}});
 assert.equal(h.posts[0]?.error,'cloud-action-too-large');await h.send(h.message);assert.equal(h.posts[1]?.error,'cloud-runtime-contract-incompatible');
});

test('configured Cloudflare and Pages parents get replies only at their own validated origins', async () => {
 const origins = ['https://pages.example', 'https://workspace.example'];
 const resolve: Array<(value: Response) => void> = [];
 const h = harness(async () => await new Promise<Response>(done => resolve.push(done)), origins);
 const page = h.send(h.message);
 const cloud = h.send({ ...h.message, requestId: 'breq-test-2' }, origins[1]);
 await h.send(h.message, 'https://workspace.example.attacker.test');
 assert.equal(resolve.length, 2);
 resolve[1]?.(Response.json({ status: 'cloud' })); await cloud;
 resolve[0]?.(Response.json({ status: 'pages' })); await page;
 assert.deepEqual(h.postedOrigins, ['https://workspace.example', 'https://pages.example']);
 assert.equal(h.posts[0]?.requestId, 'breq-test-2');
 assert.equal(h.timers.size, 0);
});

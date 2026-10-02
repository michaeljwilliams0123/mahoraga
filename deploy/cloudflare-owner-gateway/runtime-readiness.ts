type RuntimeBinding = {fetch(request:Request):Promise<Response>};
/** Uses only the fixed Cloudflare service binding, never a browser-selected host or credential. */
export async function runtimeReadiness(binding:RuntimeBinding|undefined,timeoutMs=5000):Promise<Response> {
 const headers={'cache-control':'no-store','content-type':'application/json; charset=utf-8'};
 const unavailable=()=>new Response(JSON.stringify({error:'cloud-readiness-unavailable'}),{status:503,headers});
 if(!binding||typeof binding.fetch!=='function')return unavailable();
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let activeReader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try {
  return await Promise.race([new Promise<Response>(resolve=>{timer=setTimeout(()=>{controller.abort();void activeReader?.cancel().catch(()=>{});resolve(unavailable());},timeoutMs);}), (async()=>{
   const response=await binding.fetch(new Request('https://mahoraga-execution-runtime/api/ready',{signal:controller.signal}));
   if(controller.signal.aborted||!response.ok||!response.body){void response.body?.cancel().catch(()=>{});return unavailable();}
   const reader=response.body.getReader();activeReader=reader;const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>4096){await reader.cancel();return unavailable();}chunks.push(item.value);}}
   finally{activeReader=undefined;reader.releaseLock();}
   if(controller.signal.aborted)return unavailable();
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const value:unknown=JSON.parse(new TextDecoder().decode(bytes));
   if(!value||typeof value!=='object'||Array.isArray(value))return unavailable();
   const o=value as Record<string,unknown>;
   if(Object.keys(o).sort().join(',')!=='durableState,sha,status'||o.status!=='ready'||typeof o.sha!=='string'||!/^[a-f0-9]{40}$/.test(o.sha)||o.durableState!=='cloudflare-do-sqlite')return unavailable();
   return new Response(JSON.stringify({status:'ready',sha:o.sha,durableState:o.durableState,observedAt:new Date().toISOString()}),{headers});
  })()]);
 }catch{return unavailable();}finally{if(timer!==undefined)clearTimeout(timer);}
}

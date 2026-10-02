export type RuntimeReadiness = Readonly<{status:'ready';sha:string;durableState:'cloudflare-do-sqlite';observedAt:string}>;
export function parseRuntimeReadiness(value:unknown,expectedSha:unknown,now=Date.now()):RuntimeReadiness|null {
 if(!Number.isFinite(now)||typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha)||!value||typeof value!=='object'||Array.isArray(value))return null;
 const o=value as Record<string,unknown>;
 if(Object.keys(o).sort().join(',')!=='durableState,observedAt,sha,status'||o.status!=='ready'||o.sha!==expectedSha||o.durableState!=='cloudflare-do-sqlite'||typeof o.observedAt!=='string'||o.observedAt.length>64)return null;
 const time=Date.parse(o.observedAt);if(!Number.isFinite(time)||time>now+5000||time<=now-60000)return null;
 return Object.freeze({status:'ready',sha:expectedSha,durableState:'cloudflare-do-sqlite',observedAt:o.observedAt});
}
export type ReadinessState = Readonly<{phase:'connecting'|'fresh'|'unavailable'|'paused'|'stale';readiness:RuntimeReadiness|null}>;
export type ObservationState<Value> = Readonly<{phase:ReadinessState['phase'];observation:Value|null}>;
/** Read-only, serial polling. Expiry clears Ready even when a request remains pending. */
export function watchRuntimeReadiness<T>(options:{read:()=>Promise<unknown>;expectedSha:unknown;emit:(state:ReadinessState)=>void;visible:()=>boolean;now:()=>number;schedule:(fn:()=>void,ms:number)=>T;cancel:(timer:T)=>void}) {
 return watchRuntimeObservation<RuntimeReadiness,T>({...options,parse:(value,now)=>parseRuntimeReadiness(value,options.expectedSha,now),emit:state=>options.emit({phase:state.phase,readiness:state.observation})});
}
export function watchRuntimeObservation<Value extends {observedAt:string},T>(options:{read:()=>Promise<unknown>;parse:(value:unknown,now:number)=>Value|null;emit:(state:ObservationState<Value>)=>void;visible:()=>boolean;now:()=>number;schedule:(fn:()=>void,ms:number)=>T;cancel:(timer:T)=>void}) {
 let active=true,inFlight=false;let poll:T|undefined,expiry:T|undefined;
 const clear=()=>{if(poll!==undefined)options.cancel(poll);poll=undefined;};
 const emit=(phase:ReadinessState['phase'],observation:Value|null=null)=>{if(active)options.emit({phase,observation});};
 async function refresh() {
  clear();if(!active)return;
  if(!options.visible()){if(expiry!==undefined)options.cancel(expiry);expiry=undefined;emit('paused');return;}
  if(inFlight)return;inFlight=true;
  try {
   const value=await options.read();if(!active)return;
   if(!options.visible()){emit('paused');return;}
   const ready=options.parse(value,options.now());
   if(expiry!==undefined)options.cancel(expiry);expiry=undefined;
   if(ready){emit('fresh',ready);expiry=options.schedule(()=>emit('stale'),Math.max(0,60000-(options.now()-Date.parse(ready.observedAt))));}
   else emit('unavailable');
  }catch{emit(options.visible()?'unavailable':'paused');}
  finally{inFlight=false;if(active&&options.visible())poll=options.schedule(()=>{void refresh();},30000);}
 }
 emit('connecting');void refresh();
 return {refresh:()=>{void refresh();},stop:()=>{active=false;clear();if(expiry!==undefined)options.cancel(expiry);}};
}

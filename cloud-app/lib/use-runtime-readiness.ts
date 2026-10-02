"use client";
import { useEffect, useState } from 'react';
import type { RuntimeRelay } from './runtime-relay';
import { watchRuntimeReadiness, type ReadinessState } from './runtime-readiness';
export function readinessSourceSha(health:unknown):string|null {
 if(!health||typeof health!=='object'||Array.isArray(health))return null;
 const deployment=(health as Record<string,unknown>).deployment;
 if(!deployment||typeof deployment!=='object'||Array.isArray(deployment))return null;
 const sha=(deployment as Record<string,unknown>).commitSha;
 return typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha)?sha:null;
}
export function useRuntimeReadiness(relay:RuntimeRelay|null,expectedSha:string|null,enabled:boolean):ReadinessState {
 const [state,setState]=useState<ReadinessState>({phase:'unavailable',readiness:null});
 useEffect(()=>{
  if(!enabled||!relay?.connected||!expectedSha){setState({phase:'unavailable',readiness:null});return;}
  const watch=watchRuntimeReadiness({expectedSha,read:()=>relay.readiness(),emit:setState,visible:()=>document.visibilityState!=='hidden',now:Date.now,schedule:(fn,ms)=>setTimeout(fn,ms),cancel:clearTimeout});
  document.addEventListener('visibilitychange',watch.refresh);
  return ()=>{document.removeEventListener('visibilitychange',watch.refresh);watch.stop();};
 },[relay,expectedSha,enabled]);
 return state;
}

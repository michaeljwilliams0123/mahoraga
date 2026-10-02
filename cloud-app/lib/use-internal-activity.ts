"use client";
import { useEffect, useRef, useState } from 'react';
import type { RuntimeRelay } from './runtime-relay';
import { internalActivityLabel, parseInternalActivity, type InternalActivity } from './internal-activity';
import { watchRuntimeObservation, type ObservationState } from './runtime-readiness';

export function useInternalActivity(relay: RuntimeRelay | null, sourceSha: string | null, connected: boolean) {
 const [state, setState] = useState<ObservationState<InternalActivity>>({ phase: 'unavailable', observation: null });
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [revision, setRevision] = useState(0);
 const watcher = useRef<{ stop: () => void } | null>(null);
 const generation = useRef(0);
 const controlPending = useRef(false);
 useEffect(() => {
  generation.current++;
  if (!connected || !relay?.connected || !sourceSha) { setState({ phase: 'unavailable', observation: null }); return; }
  const watch = watchRuntimeObservation({ read: () => relay.internalActivity(), parse: (value, now) => parseInternalActivity(value, sourceSha, now),
   emit: setState, visible: () => document.visibilityState !== 'hidden', now: Date.now,
   schedule: (fn, ms) => setTimeout(fn, ms), cancel: clearTimeout });
  watcher.current = watch;
  document.addEventListener('visibilitychange', watch.refresh);
  return () => { generation.current++; watch.stop(); watcher.current = null; document.removeEventListener('visibilitychange', watch.refresh); };
 }, [relay, sourceSha, connected, revision]);
 async function setEnabled(enabled: boolean) {
  if (controlPending.current || busy || !relay?.connected || !connected || !sourceSha || !state.observation) return;
  controlPending.current = true;
  const epoch = generation.current;
  watcher.current?.stop(); setBusy(true); setError(null); setState({ phase: 'connecting', observation: null });
  try {
   const value = parseInternalActivity(await relay.setInternalActivity(enabled), sourceSha);
   if (!value || value.enabled !== enabled) throw new Error('internal-control-unconfirmed');
   if (generation.current === epoch) setState({ phase: 'fresh', observation: value });
  } catch {
   if (generation.current === epoch) { setState({ phase: 'unavailable', observation: null }); setError('The change could not be confirmed. Recheck status before trying again.'); }
  } finally {
   controlPending.current = false; setBusy(false); if (generation.current === epoch) setRevision(value => value + 1);
  }
 }
 const activity = connected && relay?.connected ? state.observation : null;
 return { activity, phase: state.phase, label: internalActivityLabel(activity), busy, error, setEnabled };
}

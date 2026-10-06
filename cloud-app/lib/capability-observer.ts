import type { RuntimeCapability } from './runtime-relay';
export type CapabilityLink = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'polling';
/** `link` and `reconnects` are set only by the SSE-first observer; the polling observer leaves them unset. */
export type CapabilityObservationState = { phase: 'loading' | 'ready' | 'error'; capabilities: RuntimeCapability[]; observedAt: string | null; link?: CapabilityLink; reconnects?: number };
type Transport = { capabilities: () => Promise<RuntimeCapability[]> };
type Scheduler = { schedule: (callback: () => void) => unknown; cancel: (timer: unknown) => void };
export function observeCapabilities(transport: Transport, onState: (state: CapabilityObservationState) => void, scheduler: Scheduler = {
  schedule: callback => setTimeout(callback, 30_000), cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}) {
  let active = true;
  let inFlight = false;
  let timer: unknown;
  function refresh() {
    if (!active || inFlight) return;
    scheduler.cancel(timer);
    inFlight = true;
    onState({ phase: 'loading', capabilities: [], observedAt: null });
    void Promise.resolve().then(() => transport.capabilities()).then(capabilities => {
      if (active) onState({ phase: 'ready', capabilities, observedAt: new Date().toISOString() });
    }).catch(() => {
      if (active) onState({ phase: 'error', capabilities: [], observedAt: null });
    }).finally(() => {
      inFlight = false;
      if (active) timer = scheduler.schedule(refresh);
    });
  }
  refresh();
  return { refresh, stop: () => { active = false; scheduler.cancel(timer); } };
}

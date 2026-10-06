import type { RuntimeCapability } from './runtime-relay';
import type { BridgeCapabilityEvent } from './pages-owner-bridge-client';
import { observeCapabilities, type CapabilityObservationState } from './capability-observer';

/** `sse` (default) | `sse-with-poll-fallback` (NEXT_PUBLIC_MAHORAGA_CAPABILITY_POLL_FALLBACK=fallback) | `poll` (=force; rollback switch). */
export type CapabilityTransportMode = 'sse' | 'sse-with-poll-fallback' | 'poll';
export function capabilityTransportMode(value: string | undefined): CapabilityTransportMode {
  const flag = value?.trim().toLowerCase();
  return flag === 'force' || flag === 'poll' ? 'poll' : flag === 'fallback' ? 'sse-with-poll-fallback' : 'sse';
}

export const HEARTBEAT_TIMEOUT_MS = 35_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** Last-known-good capabilities survive a transport interruption this long before readiness is revoked. */
export const OFFLINE_AFTER_MS = 60_000;
export const POLL_FALLBACK_AFTER_ATTEMPTS = 5;

type Transport = {
  capabilities: () => Promise<RuntimeCapability[]>;
  subscribeCapabilityEvents?: (handler: (event: BridgeCapabilityEvent) => void) => Promise<(() => void) | null>;
};
type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (timer: unknown) => void; now: () => number; random: () => number };
const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  now: () => Date.now(), random: () => Math.random(),
};

export function reconnectDelayMs(attempt: number, random: () => number) {
  return Math.round(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1)) * (0.5 + random() * 0.5));
}

/**
 * SSE-first capability observer: push updates, reconnect with jittered backoff, heartbeat timeout, and an
 * optional polling fallback. Interrupted transport keeps last-known-good capabilities (state `reconnecting`)
 * until OFFLINE_AFTER_MS, then fails closed (`offline`, capabilities cleared).
 */
export function observeCapabilityStream(
  transport: Transport,
  onState: (state: CapabilityObservationState) => void,
  options: { mode?: CapabilityTransportMode; timers?: Timers; heartbeatTimeoutMs?: number } = {},
) {
  const mode = options.mode ?? 'sse';
  const timers = options.timers ?? realTimers;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  let active = true;
  let generation = 0;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: unknown;
  let retry: unknown;
  let offline: unknown;
  let poller: { refresh: () => void; stop: () => void } | null = null;
  let attempts = 0;
  let reconnects = 0;
  let snapshot: RuntimeCapability[] = [];
  let observedAt: string | null = null;
  let disconnectedSince: number | null = null;

  const emitLoading = (link: 'connecting' | 'live' | 'reconnecting') => onState({ phase: 'loading', capabilities: snapshot, observedAt, link, reconnects });
  function teardown() {
    timers.clear(heartbeat);
    const release = unsubscribe;
    unsubscribe = null;
    try { release?.(); } catch { /* releasing a dead subscription is best-effort */ }
  }
  function armHeartbeat() {
    timers.clear(heartbeat);
    heartbeat = timers.set(() => { if (active) disconnected(); }, heartbeatTimeoutMs);
  }
  function startPolling() {
    teardown(); timers.clear(retry); timers.clear(offline);
    poller = observeCapabilities(transport, state => { if (active) onState({ ...state, link: 'polling', reconnects }); });
  }
  function disconnected() {
    teardown();
    attempts += 1;
    reconnects += 1;
    disconnectedSince ??= timers.now();
    if (mode === 'sse-with-poll-fallback' && attempts >= POLL_FALLBACK_AFTER_ATTEMPTS) { startPolling(); return; }
    emitLoading('reconnecting');
    if (offline === undefined || offline === null) {
      offline = timers.set(() => {
        offline = null;
        if (!active || disconnectedSince === null) return;
        snapshot = []; observedAt = null;
        onState({ phase: 'error', capabilities: [], observedAt: null, link: 'offline', reconnects });
      }, Math.max(0, OFFLINE_AFTER_MS - (timers.now() - disconnectedSince)));
    }
    timers.clear(retry);
    retry = timers.set(connect, reconnectDelayMs(attempts, timers.random));
  }
  function connect() {
    if (!active) return;
    teardown(); timers.clear(retry);
    const current = ++generation;
    emitLoading(attempts === 0 && disconnectedSince === null ? 'connecting' : 'reconnecting');
    const handle = (event: BridgeCapabilityEvent) => {
      if (!active || current !== generation) return;
      if (event.event === 'capabilities') {
        attempts = 0; disconnectedSince = null; timers.clear(offline); offline = null;
        snapshot = event.capabilities as RuntimeCapability[];
        observedAt = new Date(timers.now()).toISOString();
        armHeartbeat();
        onState({ phase: 'ready', capabilities: snapshot, observedAt, link: 'live', reconnects });
      } else if (event.event === 'open') { armHeartbeat(); if (disconnectedSince === null) emitLoading('live'); }
      else if (event.event === 'heartbeat') armHeartbeat();
      else if (event.event === 'closed') { teardown(); timers.clear(retry); retry = timers.set(connect, 0); }
      else disconnected();
    };
    const subscribe = transport.subscribeCapabilityEvents;
    if (!subscribe || mode === 'poll') { startPolling(); return; }
    void Promise.resolve().then(() => subscribe.call(transport, handle)).then(release => {
      if (!active || current !== generation) { try { release?.(); } catch { /* stale subscription */ } return; }
      if (release === null) { startPolling(); return; }
      unsubscribe = release;
      armHeartbeat();
    }).catch(() => { if (active && current === generation) disconnected(); });
  }

  connect();
  return {
    refresh() {
      if (!active) return;
      if (poller) { poller.refresh(); return; }
      attempts = 0;
      connect();
    },
    stop() {
      active = false;
      generation += 1;
      teardown();
      timers.clear(retry); timers.clear(offline);
      poller?.stop();
    },
  };
}

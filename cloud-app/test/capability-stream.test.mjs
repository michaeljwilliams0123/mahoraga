import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { deriveExecutionStatus } from '../lib/execution-status.ts';

const dataUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
const lib = async name => stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'));
const streamSource = (await lib('capability-stream')).replace("'./capability-observer'", JSON.stringify(dataUrl(await lib('capability-observer'))));
const { observeCapabilityStream, capabilityTransportMode, reconnectDelayMs, HEARTBEAT_TIMEOUT_MS, OFFLINE_AFTER_MS, POLL_FALLBACK_AFTER_ATTEMPTS } = await import(dataUrl(streamSource));

const tick = () => new Promise(resolve => setImmediate(resolve));
const route = routable => [{ capability: 'assistant.respond', routable, workerIds: [] }];

function fakeTimers() {
  let now = 1_000_000; let id = 0; const pending = new Map();
  return {
    set: (callback, ms) => { pending.set(++id, { callback, at: now + ms }); return id; },
    clear: handle => { pending.delete(handle); },
    now: () => now, random: () => 1,
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]); now = Math.max(now, due[1].at); due[1].callback(); await tick();
      }
      now = target; await tick();
    },
    size: () => pending.size,
  };
}

function fakeTransport({ subscribe = true } = {}) {
  const t = { subscriptions: [], released: 0, polls: 0, failNext: false };
  t.capabilities = async () => { t.polls += 1; return route(true); };
  if (subscribe) t.subscribeCapabilityEvents = async handler => {
    if (t.failNext) { t.failNext = false; throw new Error('private transport detail'); }
    t.subscriptions.push(handler); return () => { t.released += 1; };
  };
  t.emit = event => t.subscriptions.at(-1)(event);
  return t;
}

test('transport mode flag defaults to SSE and exposes fallback and forced-poll rollback switches', () => {
  assert.equal(capabilityTransportMode(undefined), 'sse');
  assert.equal(capabilityTransportMode('fallback'), 'sse-with-poll-fallback');
  assert.equal(capabilityTransportMode('force'), 'poll');
  assert.equal(capabilityTransportMode('junk'), 'sse');
});

test('SSE snapshots move the observer from connecting to live and heartbeats keep it live', async () => {
  const timers = fakeTimers(); const transport = fakeTransport(); const states = [];
  const observer = observeCapabilityStream(transport, s => states.push(s), { timers }); await tick();
  assert.deepEqual(states[0], { phase: 'loading', capabilities: [], observedAt: null, link: 'connecting', reconnects: 0 });
  transport.emit({ event: 'open' });
  transport.emit({ event: 'capabilities', capabilities: route(true) });
  assert.equal(states.at(-1).phase, 'ready'); assert.equal(states.at(-1).link, 'live'); assert.equal(states.at(-1).capabilities[0].routable, true);
  await timers.advance(HEARTBEAT_TIMEOUT_MS - 1); transport.emit({ event: 'heartbeat' });
  await timers.advance(HEARTBEAT_TIMEOUT_MS - 1);
  assert.equal(states.at(-1).link, 'live');
  assert.equal(transport.subscriptions.length, 1);
  observer.stop();
});

test('heartbeat timeout reconnects with backoff, keeps last-known-good, then fails closed offline', async () => {
  const timers = fakeTimers(); const transport = fakeTransport(); const states = [];
  const observer = observeCapabilityStream(transport, s => states.push(s), { timers }); await tick();
  transport.emit({ event: 'capabilities', capabilities: route(true) });
  await timers.advance(HEARTBEAT_TIMEOUT_MS + 1);
  const reconnecting = states.at(-1);
  assert.equal(reconnecting.link, 'reconnecting'); assert.equal(reconnecting.phase, 'loading');
  assert.equal(reconnecting.capabilities[0].routable, true, 'a transport blip is not a provider degradation');
  assert.equal(reconnecting.reconnects, 1);
  assert.equal(transport.released, 1);
  await timers.advance(reconnectDelayMs(1, () => 1) + 1);
  assert.equal(transport.subscriptions.length, 2, 'backoff elapsed: resubscribed');
  await timers.advance(OFFLINE_AFTER_MS);
  assert.deepEqual(states.at(-1), { phase: 'error', capabilities: [], observedAt: null, link: 'offline', reconnects: states.at(-1).reconnects });
  transport.emit({ event: 'capabilities', capabilities: route(false) });
  assert.equal(states.at(-1).link, 'live');
  assert.equal(states.at(-1).phase, 'ready');
  observer.stop();
});

test('stream error events and subscribe failures retry; backoff grows and is capped', async () => {
  assert.ok(reconnectDelayMs(1, () => 1) < reconnectDelayMs(3, () => 1));
  assert.equal(reconnectDelayMs(50, () => 1), 30_000);
  const timers = fakeTimers(); const transport = fakeTransport(); const states = [];
  transport.failNext = true;
  const observer = observeCapabilityStream(transport, s => states.push(s), { timers }); await tick();
  assert.equal(states.at(-1).link, 'reconnecting');
  await timers.advance(2_000);
  assert.equal(transport.subscriptions.length, 1);
  transport.emit({ event: 'error' });
  assert.equal(states.at(-1).reconnects, 2);
  observer.stop();
  assert.equal(timers.size(), 0, 'stop clears every timer');
});

test('server-ended streams reconnect immediately without counting a failure', async () => {
  const timers = fakeTimers(); const transport = fakeTransport(); const states = [];
  const observer = observeCapabilityStream(transport, s => states.push(s), { timers }); await tick();
  transport.emit({ event: 'capabilities', capabilities: route(true) });
  transport.emit({ event: 'closed' });
  await timers.advance(1); await tick();
  assert.equal(transport.subscriptions.length, 2);
  assert.equal(states.at(-1).reconnects, 0);
  observer.stop();
});

test('polling fallback engages after repeated stream failures only when the flag enables it', async () => {
  for (const [mode, expectPolling] of [['sse-with-poll-fallback', true], ['sse', false]]) {
    const timers = fakeTimers(); const transport = fakeTransport(); const states = [];
    const observer = observeCapabilityStream(transport, s => states.push(s), { timers, mode }); await tick();
    for (let i = 0; i < POLL_FALLBACK_AFTER_ATTEMPTS; i++) { transport.emit({ event: 'error' }); await timers.advance(31_000); }
    await tick();
    assert.equal(transport.polls > 0, expectPolling, mode);
    assert.equal(states.some(s => s.link === 'polling'), expectPolling, mode);
    observer.stop();
  }
});

test('forced poll mode and transports without SSE use the polling observer', async () => {
  for (const [transport, mode] of [[fakeTransport(), 'poll'], [fakeTransport({ subscribe: false }), 'sse']]) {
    const states = [];
    const observer = observeCapabilityStream(transport, s => states.push(s), { timers: fakeTimers(), mode }); await tick();
    assert.equal(transport.subscriptions.length, 0);
    assert.equal(states.at(-1).link, 'polling'); assert.equal(states.at(-1).phase, 'ready');
    observer.stop();
  }
});

test('execution status separates transport loss from provider admission', () => {
  const ready = { phase: 'ready', capabilities: [], observedAt: 'x', link: 'live', reconnects: 0 };
  assert.equal(deriveExecutionStatus({ connected: false, observation: null, assistantReady: false }).label, 'Offline');
  assert.equal(deriveExecutionStatus({ connected: true, observation: { ...ready, phase: 'loading', link: 'reconnecting' }, assistantReady: true }).label, 'Reconnecting');
  assert.equal(deriveExecutionStatus({ connected: true, observation: { ...ready, phase: 'error', link: 'offline' }, assistantReady: false }).label, 'Offline');
  assert.equal(deriveExecutionStatus({ connected: true, observation: { ...ready, phase: 'loading' }, assistantReady: false }).label, 'Verifying');
  assert.equal(deriveExecutionStatus({ connected: true, observation: ready, assistantReady: false }).label, 'Provider Standby');
  assert.equal(deriveExecutionStatus({ connected: true, observation: ready, assistantReady: true }).label, 'Idle');
});

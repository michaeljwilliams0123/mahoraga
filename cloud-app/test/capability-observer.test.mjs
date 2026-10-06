import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeCapabilities } from '../lib/capability-observer.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
const route = routable => [{ capability: 'assistant.respond', routable, workerIds: [] }];
test('readiness refresh observes provider recovery without reconnecting', async () => {
  let calls = 0; let scheduled; const states = [];
  const observer = observeCapabilities({ capabilities: async () => route(++calls > 1) }, state => states.push(state), { schedule: fn => { scheduled = fn; return 1; }, cancel: () => {} });
  await tick(); assert.equal(states.at(-1).capabilities[0].routable, false);
  scheduled(); await tick(); assert.equal(states.at(-1).capabilities[0].routable, true);
  observer.stop();
});
test('refresh failure revokes stale readiness and retries stay single flight', async () => {
  let settle; const states = []; let calls = 0;
  const observer = observeCapabilities({ capabilities: () => { calls++; return new Promise((resolve, reject) => { settle = { resolve, reject }; }); } }, state => states.push(state), { schedule: () => 1, cancel: () => {} });
  observer.refresh(); await tick(); assert.equal(calls, 1);
  settle.reject(new Error('private details')); await tick();
  assert.deepEqual(states.at(-1), { phase: 'error', capabilities: [], observedAt: null });
  observer.refresh(); await tick(); observer.stop(); settle.resolve(route(true)); await tick();
  assert.equal(states.at(-1).phase, 'loading');
});

test('a synchronous capability transport failure becomes an unavailable observation', async () => {
 const states = []; let scheduled;
 const observer = observeCapabilities({ capabilities: () => { throw new Error('private transport detail'); } }, state => states.push(state), { schedule: fn => { scheduled = fn; return 1; }, cancel: () => {} });
 await tick();
 assert.deepEqual(states.at(-1), { phase: 'error', capabilities: [], observedAt: null });
 assert.equal(typeof scheduled, 'function');
 observer.stop();
});

test('workspace observes capabilities on the same-origin gateway as well as Pages', async () => {
 const { readFile } = await import('node:fs/promises');
 const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
 const start = source.indexOf('const observer = observeCapabilityStream');
 const effect = source.slice(source.lastIndexOf('useEffect(() => {', start), source.indexOf('function reconnectRuntime', start));
 const observerEffect = effect.slice(0, effect.indexOf('useEffect(() => {', 10));
 assert.doesNotMatch(observerEffect, /health\?\.deployment\?\.provider/);
 assert.match(observerEffect, /!coreReady \|\| !pairedRelay/);
});

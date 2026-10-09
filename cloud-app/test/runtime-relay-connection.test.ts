import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function relayModule(bridgeSource?: string): Promise<typeof import('../lib/runtime-relay.ts')> {
 const url = (s: string) => `data:text/javascript,${encodeURIComponent(s)}`;
 let source = stripTypeScriptTypes(await readFile(new URL('../lib/runtime-relay.ts', import.meta.url), 'utf8'));
 const store = 'export async function clearRelaySession(){}; export async function loadRelaySession(){return null}; export async function saveRelaySession(){}';
 for (const [name, body] of [['relay-session-store', store], ['pages-owner-bridge-client', bridgeSource ?? stripTypeScriptTypes(await readFile(new URL('../lib/pages-owner-bridge-client.ts', import.meta.url), 'utf8'))], ['runtime-http-scope', stripTypeScriptTypes(await readFile(new URL('../lib/runtime-http-scope.ts', import.meta.url), 'utf8'))], ['cloud-inspect-receipt', stripTypeScriptTypes(await readFile(new URL('../lib/cloud-inspect-receipt.ts', import.meta.url), 'utf8'))]]) {
  source = source.replace(`"./${name}"`, JSON.stringify(url(body)));
 }
 return import(url(source));
}
test('same-origin gateway workspace uses the authenticated bridge without a third-party cookie', async t => {
 setup(t);
 const oldWindow = globalThis.window;
 t.after(() => { if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window'); else globalThis.window = oldWindow; });
 Reflect.set(globalThis, 'window', { location: { origin: 'https://gateway.example' } });
 process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN = 'https://gateway.example';
 globalThis.fetch = async () => { throw new Error('same-origin-bridge-must-not-use-session-api'); };
 const { RuntimeRelay } = await relayModule(`
 export function validatePublicBridgeOrigin(value) { return value; }
 export class PagesOwnerBridgeClient {
  async attach() { return 'authenticated'; }
  async call(type,payload) { if(type!=='readiness'||Object.keys(payload).length)throw new Error('unexpected-action');return {status:'ready'}; }
  async disconnect() {}
 }`);
 const relay = new RuntimeRelay();
 await relay.attach();
 assert.equal(relay.transportKind, 'pages-owner-bridge');
 assert.deepEqual(await relay.readiness(), {status:'ready'});
 relay.disconnect();
});

test('Pages readiness uses its authenticated bridge and never fetches the static Pages API', async t => {
 setup(t);
 const oldWindow = globalThis.window;
 t.after(() => { if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window'); else globalThis.window = oldWindow; });
 Reflect.set(globalThis, 'window', { location: { origin: 'https://michaeljwilliams0123.github.io' } });
 process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN = 'https://gateway.example';
 globalThis.fetch = async () => { throw new Error('static-pages-must-not-fetch'); };
 const { RuntimeRelay } = await relayModule(`
 export function validatePublicBridgeOrigin(value) { return value; }
 export class PagesOwnerBridgeClient {
  async attach() { return 'authenticated'; }
  async call(type,payload) { if(type!=='readiness'||Object.keys(payload).length)throw new Error('unexpected-action');return {status:'ready'}; }
  async disconnect() {}
 }`);
 const relay = new RuntimeRelay();
 await relay.attach();assert.equal(relay.transportKind,'pages-owner-bridge');
 assert.deepEqual(await relay.readiness(),{status:'ready'});relay.disconnect();
});
function setup(t: import('node:test').TestContext) {
 const originalFetch = globalThis.fetch; const origin = process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN;
 delete process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN;
 t.after(() => { globalThis.fetch = originalFetch; if (origin === undefined) delete process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN; else process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN = origin; });
}
test('expired action authentication clears connected state without replaying the action', async t => {
 setup(t); let calls = 0;
 globalThis.fetch = async () => { calls++; return calls === 1 ? Response.json({authenticated: true, csrf: 'test-csrf'}) : Response.json({error: 'cloud-owner-auth-required'}, {status: 401}); };
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 await relay.attach(); assert.equal(relay.transportKind, 'same-origin-cloud');
 let disconnects = 0; const unsubscribe = relay.onDisconnected(() => { disconnects++; });
 await assert.rejects(relay.chat({content: 'hello'}), /cloud-owner-auth-required/);
 assert.equal(relay.connected, false); assert.equal(relay.sessionDiagnostic?.code, 'cloud-owner-auth-required'); assert.equal(calls, 2); assert.equal(disconnects, 1);
 unsubscribe(); relay.disconnect();
});
test('failed reattachment cannot retain prior authenticated state', async t => {
 setup(t); let calls = 0;
 globalThis.fetch = async () => ++calls === 1 ? Response.json({authenticated: true, csrf: 'test-csrf'}) : Response.json({authenticated: false}, {status: 503});
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 await relay.attach(); assert.equal(relay.connected, true); assert.equal(await relay.attach(), null); assert.equal(relay.connected, false);
 relay.disconnect();
});
test('disconnect aborts a pending session read and a late response cannot reconnect it', async t => {
 setup(t); let finish: (r: Response) => void = () => {}; let signal: AbortSignal | null | undefined;
 globalThis.fetch = async (_input, init) => { signal = init?.signal; return new Promise<Response>(resolve => { finish = resolve; }); };
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 const pending = relay.attach(); relay.disconnect(); finish(Response.json({authenticated:true, csrf:'test-csrf'}));
 assert.equal(await pending, null); assert.equal(relay.connected, false); assert.equal(signal?.aborted, true);
});

let bridgeFixtureId = 0;
async function delayedBridge(t: import('node:test').TestContext) {
 setup(t);
 const previousWindow = globalThis.window;
 t.after(() => { if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window'); else globalThis.window = previousWindow; });
 Reflect.set(globalThis, 'window', { location: { origin: 'https://workspace.example' } });
 process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN = 'https://gateway.example';
 const bridgeSource = `// fixture ${++bridgeFixtureId}
 export const attaches = [], logins = [], actions = [];
 export function validatePublicBridgeOrigin(value) { return value; }
 export class PagesOwnerBridgeClient {
  attach() { return new Promise((resolve,reject) => attaches.push({resolve,reject})); }
  login() { return new Promise((resolve,reject) => logins.push({resolve,reject})); }
  call() { return new Promise((resolve,reject) => actions.push({resolve,reject})); }
  async disconnect() {}
 }`;
 const fixture = await import(`data:text/javascript,${encodeURIComponent(bridgeSource)}`) as {
  attaches: Deferred[]; logins: Deferred[]; actions: Deferred[];
 };
 const { RuntimeRelay } = await relayModule(bridgeSource);
 return { relay: new RuntimeRelay(), ...fixture };
}
type Deferred = { resolve(value?: unknown): void; reject(error: Error): void };

test('late bridge attach cannot authenticate after owner disconnect', async t => {
 const { relay, attaches } = await delayedBridge(t);
 const attaching = relay.attach(); relay.disconnect();
 attaches[0].resolve('authenticated');
 assert.equal(await attaching, null);
 assert.equal(relay.connected, false); assert.equal(relay.transportKind, 'disconnected');
 assert.equal(relay.sessionDiagnostic, null);
});

test('late bridge PIN login cannot restore authentication after disconnect or revoke', async t => {
 const { relay, attaches, logins } = await delayedBridge(t);
 for (const stop of [() => relay.disconnect(), () => relay.revoke()]) {
  const attaching = relay.attach(); attaches.at(-1)!.resolve('owner-auth-required'); await attaching;
  const login = relay.loginOwnerPin('1234');
  const rejected = assert.rejects(login, /relay-disconnected/);
  await stop(); logins.at(-1)!.resolve(); await rejected;
  assert.equal(relay.connected, false); assert.equal(relay.transportKind, 'disconnected');
 }
});

test('newer attach wins when an older bridge status reply arrives last', async t => {
 const { relay, attaches } = await delayedBridge(t);
 const first = relay.attach(); const second = relay.attach();
 attaches[1].resolve('authenticated'); assert.ok(await second);
 attaches[0].resolve('owner-auth-required'); assert.equal(await first, null);
 assert.equal(relay.connected, true); assert.equal(relay.sessionDiagnostic, null);
 relay.disconnect();
});

test('a delayed old bridge authentication error cannot disconnect the replacement session', async t => {
 const { relay, attaches, actions } = await delayedBridge(t);
 const first = relay.attach(); attaches[0].resolve('authenticated'); await first;
 const action = relay.readiness(); const rejected = assert.rejects(action, /cloud-owner-auth-required/);
 relay.disconnect();
 const second = relay.attach(); attaches[1].resolve('authenticated'); await second;
 actions[0].reject(new Error('cloud-owner-auth-required')); await rejected;
 assert.equal(relay.connected, true); assert.equal(relay.sessionDiagnostic, null);
 assert.equal(actions.length, 1); // An uncertain operation is never replayed.
 relay.disconnect();
});

test('current bridge login authenticates and a current expiry still disconnects it', async t => {
 const { relay, attaches, logins, actions } = await delayedBridge(t);
 const attaching = relay.attach(); attaches[0].resolve('owner-auth-required'); await attaching;
 const login = relay.loginOwnerPin('1234'); logins[0].resolve(); await login;
 assert.equal(relay.connected, true); assert.equal(relay.sessionDiagnostic, null);
 const action = relay.readiness(); const rejected = assert.rejects(action, /cloud-owner-auth-required/);
 actions[0].reject(new Error('cloud-owner-auth-required')); await rejected;
 assert.equal(relay.connected, false); assert.deepEqual(relay.sessionDiagnostic, {code: 'cloud-owner-auth-required'});
 relay.disconnect();
});

test('a late failed bridge attach leaves owner disconnect diagnostics cleared', async t => {
 const { relay, attaches } = await delayedBridge(t);
 const attaching = relay.attach(); relay.disconnect();
 attaches[0].reject(new Error('cloud-session-unreachable'));
 assert.equal(await attaching, null); assert.equal(relay.sessionDiagnostic, null);
});

test('an older same-origin attach cannot overwrite the latest session', async t => {
 setup(t); const requests: Array<(r: Response) => void> = [];
 globalThis.fetch = async () => new Promise(resolve => requests.push(resolve));
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 const first = relay.attach(); const second = relay.attach();
 requests[1](Response.json({authenticated: true, csrf: 'new-csrf'})); await second;
 requests[0](Response.json({authenticated: false}, {status: 401}));
 assert.equal(await first, null); assert.equal(relay.connected, true); assert.equal(relay.sessionDiagnostic, null);
 relay.disconnect();
});

test('an old same-origin action expiry cannot clear a newer authenticated session', async t => {
 setup(t); let finish: (r: Response) => void = () => {};
 globalThis.fetch = async input => String(input) === '/api/runtime/session'
  ? Response.json({authenticated: true, csrf: 'test-csrf'})
  : new Promise(resolve => { finish = resolve; });
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 await relay.attach(); const action = relay.chat({content: 'hello'});
 const rejected = assert.rejects(action, /relay-disconnected/);
 await relay.attach(); finish(Response.json({error: 'cloud-owner-auth-required'}, {status: 401})); await rejected;
 assert.equal(relay.connected, true); assert.equal(relay.sessionDiagnostic, null);
 relay.disconnect();
});

test('malformed capability replies cannot crash the UI or advertise a route', async t => {
 setup(t);
 let payload: unknown;
 globalThis.fetch = async input => String(input) === '/api/runtime/session'
  ? Response.json({ authenticated: true, csrf: 'test-csrf' }) : Response.json({ capabilities: payload });
 const { RuntimeRelay } = await relayModule(); const relay = new RuntimeRelay();
 await relay.attach();
 for (payload of [[null], [{capability:'assistant.respond', routable:'true', workerIds:[]}], [{capability:'cognitive.cycle', routable:true, workerIds:[null]}], [{capability:'cognitive.predict', routable:true, workerIds:[], enabled:'true'}]]) {
  await assert.rejects(relay.capabilities(), /runtime-capabilities-invalid/);
 }
 payload = [{capability:'cognitive.cycle', routable:true, workerIds:[], costClass:'deterministic'}];
 assert.deepEqual(await relay.capabilities(), payload);
 relay.disconnect();
});

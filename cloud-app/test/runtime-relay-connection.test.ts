import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function relayModule(bridgeSource?: string): Promise<typeof import('../lib/runtime-relay.ts')> {
 const url = (s: string) => `data:text/javascript,${encodeURIComponent(s)}`;
 let source = stripTypeScriptTypes(await readFile(new URL('../lib/runtime-relay.ts', import.meta.url), 'utf8'));
 const store = 'export async function clearRelaySession(){}; export async function loadRelaySession(){return null}; export async function saveRelaySession(){}';
 for (const [name, body] of [['relay-session-store', store], ['pages-owner-bridge-client', bridgeSource ?? stripTypeScriptTypes(await readFile(new URL('../lib/pages-owner-bridge-client.ts', import.meta.url), 'utf8'))], ['runtime-http-scope', stripTypeScriptTypes(await readFile(new URL('../lib/runtime-http-scope.ts', import.meta.url), 'utf8'))]]) {
  source = source.replace(`"./${name}"`, JSON.stringify(url(body)));
 }
 return import(url(source));
}
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeHttpScope } from '../lib/runtime-http-scope.ts';

test('deadline covers a stalled response body and aborts the request without replay', async () => {
 const scope = new RuntimeHttpScope(); let signal: AbortSignal | undefined; let calls = 0;
 const request = scope.run(async (current) => { signal = current; calls++; return new Promise(() => {}); }, 10);
 await assert.rejects(request, /cloud-request-timeout/);
 assert.equal(signal?.aborted, true); assert.equal(calls, 1);
});
test('disconnect aborts every pending request and ignores late completion', async () => {
 const scope = new RuntimeHttpScope(); let finish: (v: string) => void = () => {}; let signal: AbortSignal | undefined;
 const request = scope.run((current) => { signal = current; return new Promise<string>(resolve => { finish = resolve; }); }, 500);
 scope.cancel(); finish('late');
 await assert.rejects(request, /relay-disconnected/); assert.equal(signal?.aborted, true);
 assert.equal(await scope.run(async () => 'new session', 500), 'new session');
});
test('successful request clears its deadline and preserves only bounded network diagnostics', async () => {
 const scope = new RuntimeHttpScope(); assert.equal(await scope.run(async () => 42, 500), 42);
 await assert.rejects(scope.run(async () => { throw new Error('private network detail'); }, 500), /^Error: cloud-session-unreachable$/);
});

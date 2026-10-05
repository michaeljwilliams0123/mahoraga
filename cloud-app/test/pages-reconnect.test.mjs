import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribePagesReconnect } from '../lib/pages-reconnect.ts';
test('sign-in return and network recovery request one fresh authenticated connection', () => {
 const window = new EventTarget(); const document = new EventTarget(); document.visibilityState = 'hidden';
 let calls = 0; const stop = subscribePagesReconnect(() => calls++, { window, document });
 window.dispatchEvent(new Event('focus')); assert.equal(calls, 0);
 document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
 window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); assert.equal(calls, 1);
 stop(); window.dispatchEvent(new Event('online')); assert.equal(calls, 1);
});

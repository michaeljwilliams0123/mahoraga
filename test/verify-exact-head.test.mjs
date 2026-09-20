import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExactHead, fetchCurrentMainSha } from '../scripts/verify-exact-head.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const ok = (status, body = { object: { sha } }) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('exact head accepts only checkout = verified = main', () => {
  assert.deepEqual(assertExactHead({ checkedOutSha: sha, verifiedSha: sha, currentMainSha: sha }), { checkedOutSha: sha, verifiedSha: sha, currentMainSha: sha });
});
for (const [name, input] of Object.entries({
  'verified differs from checkout': { checkedOutSha: other, verifiedSha: sha, currentMainSha: sha },
  'verified differs from current main': { checkedOutSha: sha, verifiedSha: sha, currentMainSha: other },
})) test(name + ' fails closed', () => assert.throws(() => assertExactHead(input), { code: 'stale-verified-main' }));

test('401 and 403 fail without retry', async () => {
  for (const status of [401, 403]) await assert.rejects(fetchCurrentMainSha({ repository: 'owner/repo', token: 'token', fetchImpl: async () => ok(status) }), { code: 'exact-head-api-auth-' + status });
});
test('404 fails without retry', async () => assert.rejects(fetchCurrentMainSha({ repository: 'owner/repo', token: 'token', fetchImpl: async () => ok(404) }), { code: 'exact-head-api-not-found' }));
test('5xx exhausts bounded retries', async () => {
  let calls = 0;
  await assert.rejects(fetchCurrentMainSha({ repository: 'owner/repo', token: 'token', attempts: 3, fetchImpl: async () => { calls += 1; return ok(503); } }), { code: 'exact-head-retry-exhausted' });
  assert.equal(calls, 3);
});
test('network timeout exhausts bounded retries', async () => {
  let calls = 0;
  await assert.rejects(fetchCurrentMainSha({ repository: 'owner/repo', token: 'token', attempts: 2, fetchImpl: async (_url, { signal }) => { calls += 1; return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); }, timeoutMs: 1 }), { code: 'exact-head-retry-exhausted' });
  assert.equal(calls, 2);
});
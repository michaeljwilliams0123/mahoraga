import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredWorkspaceOrigins } from '../deploy/cloudflare-owner-gateway/workspace-origins.ts';
// @ts-expect-error Existing gateway remains JavaScript migration debt.
import gateway from '../deploy/cloudflare-owner-gateway/worker.mjs';
const pages = 'https://michaeljwilliams0123.github.io';
const cloud = 'https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev';
test('workspace origins preserve Pages and admit only an explicitly configured exact Cloudflare origin', () => {
 assert.deepEqual(configuredWorkspaceOrigins({}), [pages]);
 assert.deepEqual(configuredWorkspaceOrigins({ MAHORAGA_WORKSPACE_ORIGIN: cloud }), [pages, cloud]);
 assert.deepEqual(configuredWorkspaceOrigins({ MAHORAGA_WORKSPACE_ORIGIN: pages }), [pages]);
 for (const value of ['*','http://insecure.example','https://owner:secret@cloud.example','https://cloud.example/path','https://cloud.example?token=x','https://cloud.example#x','https://cloud.example\nX-Injected: yes', [], null, '']) {
  assert.equal(configuredWorkspaceOrigins({ MAHORAGA_WORKSPACE_ORIGIN: value }), null);
 }
});
test('gateway serves the dual-origin frame only behind existing Access and exact owner identity', async () => {
 const env = { MAHORAGA_CLOUD_OWNER_ID: 'owner@example.com', MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: 'x'.repeat(64), MAHORAGA_WORKSPACE_ORIGIN: cloud };
 const request = new Request('https://gateway.example/api/runtime/pages-bridge/frame');
 const ctx = { access: { getIdentity: async () => ({ email: 'owner@example.com' }) } };
 assert.equal((await gateway.fetch(request, env, {})).status, 403);
 assert.equal((await gateway.fetch(request, env, { access: { getIdentity: async () => ({ email: 'other@example.com' }) } })).status, 401);
 const good = await gateway.fetch(request, env, ctx);
 assert.equal(good.status, 200);
 assert.ok(good.headers.get('content-security-policy')?.includes(`frame-ancestors ${pages} ${cloud} https://gateway.example`));
 assert.equal((await gateway.fetch(request, { ...env, MAHORAGA_WORKSPACE_ORIGIN: '*' }, ctx)).status, 503);
 const direct = new Request('https://gateway.example/api/runtime/pages-bridge/action', { method: 'POST', headers: { origin: cloud }, body: '{}' });
 assert.equal((await gateway.fetch(direct, env, ctx)).status, 403);
});

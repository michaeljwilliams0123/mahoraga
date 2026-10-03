import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceSecurityHeaders, verifiedWorkspacePublication, validateWorkspaceCandidate } from '../scripts/cloudflare-workspace-proof.ts';
const sha = 'a'.repeat(40);
const run = () => ({ name: 'Deploy and Accept Exact Main on Cloudflare', path: '.github/workflows/cloudflare-execution-runtime.yml', status: 'completed', conclusion: 'success',
 head_sha: sha, head_branch: 'main', head_repository: { full_name: 'michaeljwilliams0123/mahoraga' }, actor: { login: 'github-actions[bot]' }, event: 'workflow_run' });
test('workspace publication requires completed canonical cloud acceptance, not renewal or PR verification', () => {
 assert.equal(verifiedWorkspacePublication(run(), sha).sourceSha, sha);
 assert.equal(verifiedWorkspacePublication({ ...run(), actor: { login: 'michaeljwilliams0123' }, event: 'workflow_dispatch' }, sha).sourceSha, sha);
 for (const override of [{ event: 'schedule' }, { event: 'pull_request' }, { actor: { login: 'michaeljwilliams0123' }, event: ['workflow_run'] }, { event: 'workflow_dispatch' }, { name: 'Verify Mahoraga' }, { conclusion: 'failure' }, { status: 'in_progress' }, { head_branch: 'feature/work' }, { head_repository: { full_name: 'attacker/repo' } }, { actor: { login: 'collaborator' } }, { path: '.github/workflows/other.yml' }]) assert.throws(() => verifiedWorkspacePublication({ ...run(), ...override }, sha));
 assert.throws(() => verifiedWorkspacePublication(run(), 'b'.repeat(40)));
});
test('static headers permit only the configured bridge, protect the shell, and avoid stale health metadata', () => {
 const headers = workspaceSecurityHeaders('https://gateway.example');
 assert.match(headers, /frame-src https:\/\/gateway.example/);
 assert.match(headers, /frame-ancestors 'none'/); assert.match(headers, /X-Content-Type-Options: nosniff/);
 assert.match(headers, /\/api\/health.json\n  Cache-Control: no-store/);
 assert.doesNotMatch(headers, /ai-gateway.vercel|frame-src \*/);
 for (const value of ['https://user:secret@gateway.example', 'https://gateway.example\nX-Injected: yes', 'http://gateway.example']) assert.throws(() => workspaceSecurityHeaders(value));
});
test('candidate proof checks exact static source and bridge security without granting execution authority', () => {
 const health = { product: 'Mahoraga', deployment: { provider: 'cloudflare-workers', environment: 'candidate', commitSha: sha, promotion: 'unverified-cloudflare-static' } };
 const headers = new Headers({ server: 'cloudflare', 'cf-ray': 'opaque-edge', 'content-type': 'text/html', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': workspaceSecurityHeaders().split('Content-Security-Policy: ')[1]?.split('\n')[0] ?? '' });
 const html = '<script src="/_next/static/app.js"></script>';
 assert.equal(validateWorkspaceCandidate({ sha, html, health, headers }).status, 'verified-candidate');
 const conflicting = new Headers(headers); conflicting.set('content-security-policy', `frame-src *; ${headers.get('content-security-policy')}`);
 assert.throws(() => validateWorkspaceCandidate({ sha, html, health, headers: conflicting }));
 for (const override of [{ html: '<meta http-equiv="refresh" content="0">' }, { health: { ...health, deployment: { ...health.deployment, commitSha: 'b'.repeat(40) } } }, { headers: new Headers() }]) assert.throws(() => validateWorkspaceCandidate({ sha, html, health, headers, ...override }));
});


test('Cloudflare export writes native asset security headers; Pages retains its separate export', async () => {
 const { mkdtemp, readFile, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 // @ts-expect-error Existing static builder remains bounded JavaScript migration debt.
 const { writePagesStaticHealth } = await import('../scripts/build-pages-static.mjs');
 const root = await mkdtemp(join(tmpdir(), 'mahoraga-cloud-headers-'));
 try {
  await writePagesStaticHealth(join(root, 'cloud'), { MAHORAGA_STATIC_EXPORT_TARGET: 'cloudflare' });
  assert.equal(await readFile(join(root, 'cloud', 'public', '_headers'), 'utf8'), workspaceSecurityHeaders());
  await writePagesStaticHealth(join(root, 'pages'), {});
  await assert.rejects(readFile(join(root, 'pages', 'public', '_headers')), { code: 'ENOENT' });
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('workspace workflow waits for accepted runtime, rejects renewal paths, and preserves exact-main source checks', async () => {
 const { readFile } = await import('node:fs/promises');
 const workflow = await readFile(new URL('../.github/workflows/cloudflare-workspace-candidate.yml', import.meta.url), 'utf8');
 assert.match(workflow, /workflow_call:\s*\n\s*inputs:\s*\n\s*verified_sha:\s*\n\s*required: true\s*\n\s*type: string/);
 assert.doesNotMatch(workflow, /workflow_run:/);
 assert.ok(workflow.includes("github.workflow_ref == 'michaeljwilliams0123/mahoraga/.github/workflows/cloudflare-execution-runtime.yml@refs/heads/main'"));
 assert.ok(workflow.includes('run: node scripts/cloudflare-workspace-proof.ts caller'));
 assert.ok(workflow.includes('VERIFIED_SHA: ${{ inputs.verified_sha || github.sha }}'));
 const caller = await readFile(new URL('../.github/workflows/cloudflare-execution-runtime.yml', import.meta.url), 'utf8');
 const lane = caller.slice(caller.indexOf('  workspace-candidate:'), caller.indexOf('  deploy-accept:'));
 assert.match(lane, /needs: deploy-accept/); assert.match(lane, /if: needs.deploy-accept.result == 'success'/);
 assert.match(lane, /uses: \.\/\.github\/workflows\/cloudflare-workspace-candidate.yml/);
 assert.match(lane, /verified_sha:.*workflow_run.head_sha.*github.sha/);
 assert.equal((workflow.match(/run: node scripts\/verify-exact-head.mjs/g) ?? []).length, 2);
 assert.ok(workflow.indexOf('cloudflare-workspace-proof.ts accept') > workflow.indexOf('Deploy static UI candidate'));
 assert.ok(workflow.indexOf('npm run typecheck && npm run test') < workflow.indexOf('Build the root-path workspace candidate'));
 assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN: https:\/\/mahoraga-owner-gateway/);
 assert.doesNotMatch(workflow, /event == 'schedule'|pull_request_target|runs-on:.*self-hosted/);
});

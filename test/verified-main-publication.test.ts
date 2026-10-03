import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedMainPublication } from '../scripts/verified-main-publication.ts';

const sha = 'a'.repeat(40);
const run = () => ({ name: 'Verify Mahoraga', path: '.github/workflows/verify.yml', status: 'completed', conclusion: 'success',
 head_sha: sha, head_branch: 'main', head_repository: { full_name: 'michaeljwilliams0123/mahoraga' },
 actor: { login: 'github-actions[bot]' }, event: 'workflow_dispatch' });
test('publication accepts only canonical successful main verification with permitted actors and events', () => {
 for (const event of ['push', 'workflow_dispatch']) {
  assert.equal(verifiedMainPublication({ ...run(), event }, sha).sourceSha, sha);
  assert.equal(verifiedMainPublication({ ...run(), actor: { login: 'michaeljwilliams0123' }, event }, sha).sourceSha, sha);
 }
});
test('publication denies foreign, stale, failed, PR, ambiguous and malformed verification', () => {
 for (const override of [
  { head_repository: { full_name: 'attacker/mahoraga' } }, { head_branch: 'feature/work' },
  { name: 'Other workflow' }, { path: '.github/workflows/other.yml' }, { status: 'in_progress' }, { conclusion: 'failure' },
  { event: 'pull_request' }, { event: 'schedule' }, { actor: { login: 'collaborator' } },
  { actor: { login: ['github-actions[bot]'] } }, { head_sha: 'bad' }, { head_sha: ['a'.repeat(40)] },
 ]) assert.throws(() => verifiedMainPublication({ ...run(), ...override }, sha), /verified-main-publication-denied/);
 for (const value of [null, [], 'run', {}]) assert.throws(() => verifiedMainPublication(value, sha), /verified-main-publication-denied/);
 assert.throws(() => verifiedMainPublication(run(), 'b'.repeat(40)), /verified-main-publication-denied/);
});

test('publication CLI validates a bounded event file without dumping private event fields', async () => {
 const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { fileURLToPath } = await import('node:url');
 const { spawnSync } = await import('node:child_process');
 const directory = await mkdtemp(join(tmpdir(), 'mahoraga-publication-'));
 try {
  const eventPath = join(directory, 'event.json');
  const invoke = (overrides: Record<string, string> = {}) => spawnSync(process.execPath,
   [fileURLToPath(new URL('../scripts/verified-main-publication.ts', import.meta.url))],
   { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'michaeljwilliams0123/mahoraga', GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: eventPath, VERIFIED_SHA: sha, ...overrides } });
  await writeFile(eventPath, JSON.stringify({ workflow_run: run(), unrelatedPrivateField: 'private-marker' }));
  const accepted = invoke(); assert.equal(accepted.status, 0); assert.equal(JSON.parse(accepted.stdout).sourceSha, sha);
  assert.doesNotMatch(accepted.stdout + accepted.stderr, /private-marker/);
  for (const override of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'attacker/repo' }, { VERIFIED_SHA: 'b'.repeat(40) }]) assert.notEqual(invoke(override).status, 0);
  await writeFile(eventPath, ' '.repeat(1024 * 1024 + 1));
  const oversized = invoke(); assert.notEqual(oversized.status, 0); assert.match(oversized.stderr, /verified-main-publication-denied/);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

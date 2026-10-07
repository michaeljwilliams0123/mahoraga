import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedWorkspaceCaller, verifiedWorkspaceStaticCaller } from '../scripts/cloudflare-workspace-proof.ts';

const sha = 'a'.repeat(40);
const context = () => ({ repository: 'michaeljwilliams0123/mahoraga',
 workflowRef: 'michaeljwilliams0123/mahoraga/.github/workflows/cloudflare-execution-runtime.yml@refs/heads/main',
 eventName: 'workflow_run', actor: 'github-actions[bot]', sourceSha: sha,
 event: { workflow_run: { name: 'Verify Mahoraga', path: '.github/workflows/verify.yml', status: 'completed', conclusion: 'success',
  head_sha: sha, head_branch: 'main', head_repository: { full_name: 'michaeljwilliams0123/mahoraga' }, actor: { login: 'github-actions[bot]' }, event: 'push' } } });
test('paired publisher accepts only the canonical caller after its runtime acceptance dependency', () => {
 for (const actor of ['michaeljwilliams0123', 'github-actions[bot]']) for (const event of ['push', 'workflow_dispatch']) {
  const value = context(); value.event.workflow_run.actor.login = actor; value.event.workflow_run.event = event;
  assert.equal(verifiedWorkspaceCaller(value, sha).sourceSha, sha);
 }
 assert.equal(verifiedWorkspaceCaller({ ...context(), eventName: 'workflow_dispatch', actor: 'michaeljwilliams0123', event: {} }, sha).sourceSha, sha);
});
test('paired publisher rejects foreign callers, renewal, PRs, stale source and malformed context', () => {
 for (const override of [{ repository: 'attacker/repo' }, { workflowRef: context().workflowRef.replace('main', 'feature/work') },
  { workflowRef: context().workflowRef.replace('cloudflare-execution-runtime', 'other') }, { workflowRef: [context().workflowRef] },
  { eventName: 'schedule' }, { eventName: 'pull_request' }, { sourceSha: 'b'.repeat(40) }, { actor: 'other' },
  { eventName: 'workflow_dispatch', actor: 'github-actions[bot]' }, { eventName: 'workflow_dispatch', actor: 'other' }]) {
  assert.throws(() => verifiedWorkspaceCaller({ ...context(), ...override }, sha));
 }
 for (const override of [{ conclusion: 'failure' }, { status: 'in_progress' }, { name: 'Other workflow' },
  { path: '.github/workflows/other.yml' }, { head_branch: 'feature/work' }, { head_sha: 'b'.repeat(40) },
  { head_repository: { full_name: 'attacker/repo' } }, { actor: { login: 'other' } }, { event: 'schedule' }, { event: ['push'] }]) {
  const value = context(); assert.throws(() => verifiedWorkspaceCaller({ ...value, event: { workflow_run: { ...value.event.workflow_run, ...override } } }, sha));
 }
 for (const value of [null, [], {}, 'caller']) assert.throws(() => verifiedWorkspaceCaller(value, sha));
 assert.throws(() => verifiedWorkspaceCaller(context(), 'bad'));
});

test('standalone verified-main UI publisher cannot self-grant execution authority', () => {
 const allowed = { ...context(), workflowRef: 'michaeljwilliams0123/mahoraga/.github/workflows/cloudflare-workspace-candidate.yml@refs/heads/main' };
 assert.deepEqual(verifiedWorkspaceStaticCaller(allowed, sha), {
  sourceSha: sha, sourceEvent: 'push', trustSource: 'verified-main-static-only', executionAuthorityGranted: false,
 });
 for (const override of [{ workflowRef: context().workflowRef }, { eventName: 'workflow_dispatch' }, { actor: 'other' },
  { sourceSha: 'b'.repeat(40) }, { repository: 'attacker/repo' }]) {
  assert.throws(() => verifiedWorkspaceStaticCaller({ ...allowed, ...override }, sha));
 }
 for (const override of [{ conclusion: 'failure' }, { status: 'queued' }, { head_branch: 'feature' },
  { head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { path: '.github/workflows/other.yml' },
  { actor: { login: 'unknown' } }]) {
  assert.throws(() => verifiedWorkspaceStaticCaller({ ...allowed, event: { workflow_run: { ...allowed.event.workflow_run, ...override } } }, sha));
 }
});
test('caller CLI keeps private event fields out of receipts and bounds its input', async () => {
 const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
 const { spawnSync } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
 const directory = await mkdtemp(join(tmpdir(), 'mahoraga-workspace-caller-'));
 try {
  const eventPath = join(directory, 'event.json'), value = context();
  const invoke = (override: Record<string, string> = {}) => spawnSync(process.execPath,
   [fileURLToPath(new URL('../scripts/cloudflare-workspace-proof.ts', import.meta.url)), 'caller'], {
    encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: value.repository, GITHUB_WORKFLOW_REF: value.workflowRef,
     GITHUB_EVENT_NAME: value.eventName, GITHUB_ACTOR: value.actor, GITHUB_SHA: sha, VERIFIED_SHA: sha,
     GITHUB_EVENT_PATH: eventPath, ...override } });
  await writeFile(eventPath, JSON.stringify({ ...value.event, privateField: 'private-marker' }));
  const accepted = invoke(); assert.equal(accepted.status, 0); assert.equal(JSON.parse(accepted.stdout).sourceSha, sha);
  assert.doesNotMatch(accepted.stdout + accepted.stderr, /private-marker/);
  assert.notEqual(invoke({ GITHUB_WORKFLOW_REF: 'attacker/workflow' }).status, 0);
  await writeFile(eventPath, 'private-marker: invalid json');
  const malformed = invoke(); assert.notEqual(malformed.status, 0);
  assert.doesNotMatch(malformed.stdout + malformed.stderr, /private-marker/);
  await writeFile(eventPath, ' '.repeat(1024 * 1024 + 1));
  assert.notEqual(invoke().status, 0);
 } finally { await rm(directory, { recursive: true, force: true }); }
});

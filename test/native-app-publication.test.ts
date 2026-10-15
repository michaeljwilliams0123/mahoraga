import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedMainPublication } from '../scripts/verified-main-publication.ts';
import { verifiedWorkspaceCaller, verifiedWorkspacePublication, verifiedWorkspaceStaticCaller } from '../scripts/cloudflare-workspace-proof.ts';

const sha = 'a'.repeat(40);
const actor = 'mahoraga-native-pr-operator[bot]';
const verification = () => ({ name: 'Verify Mahoraga', path: '.github/workflows/verify.yml',
 status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: sha,
 head_repository: { full_name: 'michaeljwilliams0123/mahoraga' }, actor: { login: actor }, event: 'push' });
const caller = () => ({ sourceSha: sha, repository: 'michaeljwilliams0123/mahoraga', actor,
 workflowRef: 'michaeljwilliams0123/mahoraga/.github/workflows/cloudflare-execution-runtime.yml@refs/heads/main',
 eventName: 'workflow_run', event: { workflow_run: verification() } });

test('native App publication retains every exact-source verification boundary', () => {
 assert.equal(verifiedMainPublication(verification(), sha).trustSource, 'canonical-verification-event');
 for (const override of [
  { event: 'workflow_dispatch' }, { event: 'pull_request' }, { event: 'schedule' },
  { actor: { login: 'mahoraga-native-pr-operator' } }, { actor: { login: `${actor}-other` } },
  { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' },
  { head_repository: { full_name: 'attacker/mahoraga' } },
  { name: 'Other' }, { path: '.github/workflows/other.yml' },
  { status: 'in_progress' }, { conclusion: 'failure' },
 ]) {
  const value = { ...verification(), ...override };
  assert.throws(() => verifiedMainPublication(value, sha));
  assert.throws(() => verifiedWorkspaceCaller({ ...caller(), event: { workflow_run: value } }, sha));
 }
});

test('native App paired and static callers preserve separate publication claims', () => {
 assert.equal(verifiedWorkspaceCaller(caller(), sha).trustSource, 'accepted-runtime-job');
 const staticCaller = { ...caller(),
  workflowRef: 'michaeljwilliams0123/mahoraga/.github/workflows/cloudflare-workspace-candidate.yml@refs/heads/main' };
 assert.deepEqual(verifiedWorkspaceStaticCaller(staticCaller, sha), {
  sourceSha: sha, sourceEvent: 'push', trustSource: 'verified-main-static-only', executionAuthorityGranted: false,
 });
 for (const override of [{ eventName: 'workflow_dispatch' }, { repository: 'attacker/mahoraga' },
  { sourceSha: 'b'.repeat(40) }, { actor: `${actor}-other` }]) {
  assert.throws(() => verifiedWorkspaceCaller({ ...caller(), ...override }, sha));
  assert.throws(() => verifiedWorkspaceStaticCaller({ ...staticCaller, ...override }, sha));
 }
});

test('native App completed deployment proof cannot authorize manual, failed or stale publication', () => {
 const publication = { ...verification(), name: 'Deploy and Accept Exact Main on Cloudflare',
  path: '.github/workflows/cloudflare-execution-runtime.yml', event: 'workflow_run' };
 assert.equal(verifiedWorkspacePublication(publication, sha).actor, actor);
 for (const override of [{ event: 'workflow_dispatch' }, { event: 'push' }, { event: 'pull_request' },
  { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'b'.repeat(40) },
  { head_branch: 'feature' }, { head_repository: { full_name: 'attacker/mahoraga' } },
  { actor: { login: `${actor}-other` } }, { path: '.github/workflows/other.yml' }]) {
  assert.throws(() => verifiedWorkspacePublication({ ...publication, ...override }, sha));
 }
});

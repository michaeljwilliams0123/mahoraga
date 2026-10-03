import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedMainPublication } from '../scripts/verified-main-publication.ts';

const sha = 'a'.repeat(40);
const run = (overrides: Record<string, unknown> = {}) => ({
 id: 456789,
 name: 'Verify Mahoraga',
 path: '.github/workflows/verify.yml',
 status: 'completed',
 conclusion: 'success',
 head_sha: sha,
 head_branch: 'main',
 head_repository: { full_name: 'michaeljwilliams0123/mahoraga' },
 actor: { login: 'github-actions[bot]' },
 event: 'workflow_dispatch',
 ...overrides,
});
const receipt = (overrides: Record<string, unknown> = {}) => ({
 schemaVersion: 1,
 kind: 'verified-main-publication-v1',
 repository: 'michaeljwilliams0123/mahoraga',
 sourceWorkflow: 'Autonomous Integration',
 sourceWorkflowPath: '.github/workflows/autonomous-integration.yml',
 sourceRunId: '123456',
 sourceArtifactId: '789012',
 pullRequest: 966,
 candidateHeadSha: 'b'.repeat(40),
 mergedSha: sha,
 verifyRunId: '456789',
 ...overrides,
});

test('publication keeps owner and bot-push authority while bot dispatch requires trusted receipt', () => {
 for (const event of ['push', 'workflow_dispatch']) {
  assert.equal(verifiedMainPublication(run({ actor: { login: 'michaeljwilliams0123' }, event }), sha).sourceSha, sha);
 }
 assert.equal(verifiedMainPublication(run({ event: 'push' }), sha).sourceSha, sha);
 assert.throws(() => verifiedMainPublication(run(), sha), /verified-main-publication-receipt-invalid/);
 const accepted = verifiedMainPublication(run(), sha, receipt());
 assert.equal(accepted.sourceSha, sha);
 assert.equal(accepted.trustSource, 'autonomous-integration-receipt');
 assert.equal(accepted.publicationReceipt?.sourceRunId, '123456');
});

test('publication rejects malformed or mismatched trusted bot receipts', () => {
 for (const badReceipt of [
  receipt({ repository: 'attacker/mahoraga' }),
  receipt({ sourceWorkflow: 'Other Workflow' }),
  receipt({ sourceWorkflowPath: '.github/workflows/other.yml' }),
  receipt({ sourceRunId: '0' }),
  receipt({ sourceArtifactId: 'bad' }),
  receipt({ pullRequest: 0 }),
  receipt({ candidateHeadSha: 'bad' }),
  receipt({ mergedSha: 'c'.repeat(40) }),
  receipt({ verifyRunId: '999999' }),
 ]) assert.throws(() => verifiedMainPublication(run(), sha, badReceipt), /verified-main-publication-receipt-invalid/);
});

test('publication denies foreign, stale, failed, PR, ambiguous and malformed verification', () => {
 for (const override of [
  { head_repository: { full_name: 'attacker/mahoraga' }, actor: { login: 'michaeljwilliams0123' } },
  { head_branch: 'feature/work', actor: { login: 'michaeljwilliams0123' } },
  { name: 'Other workflow', actor: { login: 'michaeljwilliams0123' } },
  { path: '.github/workflows/other.yml', actor: { login: 'michaeljwilliams0123' } },
  { status: 'in_progress', actor: { login: 'michaeljwilliams0123' } },
  { conclusion: 'failure', actor: { login: 'michaeljwilliams0123' } },
  { event: 'pull_request', actor: { login: 'michaeljwilliams0123' } },
  { event: 'schedule', actor: { login: 'michaeljwilliams0123' } },
  { actor: { login: 'collaborator' }, event: 'push' },
  { actor: { login: ['github-actions[bot]'] }, event: 'push' },
  { head_sha: 'bad', actor: { login: 'michaeljwilliams0123' } },
  { head_sha: ['a'.repeat(40)], actor: { login: 'michaeljwilliams0123' } },
 ]) assert.throws(() => verifiedMainPublication(run(override), sha), /verified-main-publication-denied/);
 for (const value of [null, [], 'run', {}]) assert.throws(() => verifiedMainPublication(value, sha), /verified-main-publication-denied/);
 assert.throws(() => verifiedMainPublication(run({ actor: { login: 'michaeljwilliams0123' } }), 'b'.repeat(40)), /verified-main-publication-denied/);
});

test('publication CLI validates a bounded receipt without dumping private event fields', async () => {
 const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { fileURLToPath } = await import('node:url');
 const { spawnSync } = await import('node:child_process');
 const directory = await mkdtemp(join(tmpdir(), 'mahoraga-publication-'));
 try {
  const eventPath = join(directory, 'event.json');
  const receiptPath = join(directory, 'receipt.json');
  const invoke = (overrides: Record<string, string> = {}) => spawnSync(process.execPath,
   [fileURLToPath(new URL('../scripts/verified-main-publication.ts', import.meta.url))],
   { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'michaeljwilliams0123/mahoraga', GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: eventPath, VERIFIED_SHA: sha, VERIFIED_MAIN_PUBLICATION_RECEIPT: receiptPath, ...overrides } });
  await writeFile(eventPath, JSON.stringify({ workflow_run: run(), unrelatedPrivateField: 'private-marker' }));
  await writeFile(receiptPath, JSON.stringify(receipt()));
  const accepted = invoke();
  assert.equal(accepted.status, 0);
  assert.equal(JSON.parse(accepted.stdout).sourceSha, sha);
  assert.doesNotMatch(accepted.stdout + accepted.stderr, /private-marker/);

  const missingReceipt = invoke({ VERIFIED_MAIN_PUBLICATION_RECEIPT: '' });
  assert.notEqual(missingReceipt.status, 0);
  assert.match(missingReceipt.stderr, /verified-main-publication-receipt-invalid/);
  for (const override of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'attacker/repo' }, { VERIFIED_SHA: 'b'.repeat(40) }]) {
   assert.notEqual(invoke(override).status, 0);
  }
  await writeFile(eventPath, ' '.repeat(1024 * 1024 + 1));
  const oversized = invoke();
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /verified-main-publication-denied/);
 } finally {
  await rm(directory, { recursive: true, force: true });
 }
});


test('publication workflows keep jq artifact predicates portable', async () => {
 const { readFile } = await import('node:fs/promises');
 const workflowPaths = [
  '../.github/workflows/verify.yml',
  '../.github/workflows/pages.yml',
  '../.github/workflows/release.yml',
  '../.github/workflows/cloudflare-execution-runtime.yml',
 ];
 for (const relativePath of workflowPaths) {
  const content = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(content, /select\\(\\.name == \\$name && \\.expired == false\\)/);
  assert.match(content, /select\\(\\.name == \\$name and \\.expired == false\\)/);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/branch-retention-audit.ts', import.meta.url));
for (const scenario of ['stale', 'dirty'] as const) {
 test(`retention audit rejects ${scenario} source before remote inventory`, () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mahoraga-branch-audit-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
   git('init'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.invalid');
   writeFileSync(join(cwd, 'source.txt'), 'initial'); git('add', 'source.txt'); git('commit', '-m', 'initial');
   const first = git('rev-parse', 'HEAD');
   git('update-ref', 'refs/remotes/origin/main', first);
   writeFileSync(join(cwd, 'source.txt'), 'changed');
   if (scenario === 'stale') { git('add', 'source.txt'); git('commit', '-m', 'different head'); }
   // No origin or gh is installed in this fixture. The source precondition must
   // fail before either is consulted, without reflecting file contents.
   const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
   assert.notEqual(result.status, 0);
   assert.match(result.stderr, new RegExp(`branch-audit-${scenario === 'stale' ? 'source-sha-stale' : 'worktree-dirty'}`));
   assert.doesNotMatch(result.stderr, /does not appear to be a git repository|not found|changed.*initial/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
 });
}

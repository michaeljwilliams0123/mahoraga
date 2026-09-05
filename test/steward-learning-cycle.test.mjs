import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createChildAgentManifest } from '../src/agent-foundry.mjs';
import { createAgentFeat } from '../src/agent-feat-ledger.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('learning script writes stable state, feat, and foundry reports from deterministic input', () => {
  const script = path.join(root, 'scripts/steward-learning-cycle.mjs');
  assert.equal(existsSync(script), true, 'learning script must exist');
  const dir = mkdtempSync(path.join(tmpdir(), 'mahoraga-learning-'));
  const inputPath = path.join(dir, 'input.json');
  const outputPath = path.join(dir, 'state.json');
  const featOutputPath = path.join(dir, 'feats.json');
  const foundryOutputPath = path.join(dir, 'foundry.json');
  const child = createChildAgentManifest({
    agentId: 'mahoraga-code-guardian', parentAgentId: 'mahoraga-steward', role: 'code-guardian', mission: 'Repair code.', capabilities: ['regression-repair'], privileges: ['github-read'],
  }, { createdAt: '2026-09-05T06:00:00.000Z' });
  const feat = createAgentFeat({
    agentId: 'mahoraga-code-guardian', capability: 'regression-repair', outcome: 'success', summary: 'Repair passed.', evidence: ['test:test/x.test.mjs'],
  }, { learnedAt: '2026-09-05T06:10:00.000Z' });
  writeFileSync(inputPath, JSON.stringify({ parentAgentId: 'mahoraga-steward', agents: [child], feats: [feat], gaps: [] }));
  const args = [script, '--input', inputPath, '--output', outputPath, '--feat-output', featOutputPath, '--foundry-output', foundryOutputPath];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: root });
  assert.equal(first.status, 0, first.stderr);
  const firstState = readFileSync(outputPath, 'utf8');
  const second = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: root });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(outputPath, 'utf8'), firstState);
  assert.equal(JSON.parse(readFileSync(featOutputPath, 'utf8')).feats.length, 1);
  assert.equal(JSON.parse(readFileSync(foundryOutputPath, 'utf8')).plannedCount, 0);
});

test('two-hour workflow exists, is deterministic, and never references a metered OpenAI route', () => {
  const workflowPath = path.join(root, '.github/workflows/steward-two-hour-learning.yml');
  assert.equal(existsSync(workflowPath), true, 'two-hour workflow must exist');
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /cron:\s*['"]17 \*\/2 \* \* \*['"]/);
  assert.match(workflow, /node scripts\/steward-learning-cycle\.mjs/);
  assert.match(workflow, /node scripts\/steward-agent-foundry\.mjs/);
  assert.match(workflow, /feature\/sovereign-steward-learning-/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.doesNotMatch(workflow, /openai\.com|OPENAI_API_KEY|process\.env\.OPENAI/i);
  assert.doesNotMatch(workflow, /git push origin main|git push[^\n]*HEAD:main/i);
});

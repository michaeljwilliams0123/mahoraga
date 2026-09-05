import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createChildAgentManifest, planChildAgents } from '../src/agent-foundry.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('agent foundry script permanently applies planned children without duplicating them', () => {
  const script = path.join(root, 'scripts/steward-agent-foundry.mjs');
  assert.equal(existsSync(script), true, 'foundry script must exist');
  const dir = mkdtempSync(path.join(tmpdir(), 'mahoraga-foundry-'));
  const registryPath = path.join(dir, 'registry.json');
  const plansPath = path.join(dir, 'plans.json');
  const appliedPath = path.join(dir, 'applied.json');
  const existing = createChildAgentManifest({
    agentId: 'mahoraga-code-guardian', parentAgentId: 'mahoraga-steward', role: 'code-guardian', mission: 'Repair code.', capabilities: ['regression-repair'], privileges: [],
  }, { createdAt: '2026-09-05T06:00:00.000Z' });
  const plans = planChildAgents({
    parentAgentId: 'mahoraga-steward', existingAgents: [existing],
    gaps: [{ id: 'primary-codex-builder', state: 'open', priority: 'medium', summary: 'Builder gap.', dependency: 'Create a specialist.' }],
    createdAt: '2026-09-05T06:30:00.000Z',
  });
  writeFileSync(registryPath, JSON.stringify({ schemaVersion: 1, parentAgentId: 'mahoraga-steward', agents: [existing] }));
  writeFileSync(plansPath, JSON.stringify({ schemaVersion: 1, plannedCount: plans.length, plans }));
  const args = [script, '--registry', registryPath, '--plans', plansPath, '--applied-output', appliedPath];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: root });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).nextAction, 'apply-foundry');
  assert.equal(JSON.parse(readFileSync(registryPath, 'utf8')).agents.length, 2);
  assert.equal(JSON.parse(readFileSync(appliedPath, 'utf8')).createdAgentIds[0], 'mahoraga-primary-codex-builder-specialist');
  const second = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: root });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(readFileSync(registryPath, 'utf8')).agents.length, 2);
});

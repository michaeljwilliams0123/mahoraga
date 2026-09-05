import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try { subject = await import('../src/agent-foundry.mjs'); } catch {}

test('child manifests always inherit permanent self-update, zero-credit, shared-feat, and platform-auth boundaries', () => {
  assert.equal(typeof subject.createChildAgentManifest, 'function');
  const child = subject.createChildAgentManifest({
    agentId: 'mahoraga-browser-specialist',
    parentAgentId: 'mahoraga-steward',
    role: 'browser-specialist',
    mission: 'Own signed browser-session diagnostics and bounded repair.',
    capabilities: ['signed-browser-session'],
    privileges: ['github-read', 'github-pr-write'],
  }, { createdAt: '2026-09-05T06:00:00.000Z' });
  assert.equal(child.permanent, true);
  assert.equal(child.selfUpdate, true);
  assert.equal(child.zeroCredit, true);
  assert.equal(child.sharedFeatLedger, true);
  assert.equal(child.ownerApprovalRequired, false);
  assert.equal(child.platformAuthorizationRequired, true);
});

test('foundry plans children only for actionable uncovered gaps', () => {
  assert.equal(typeof subject.planChildAgents, 'function');
  const existing = [subject.createChildAgentManifest({
    agentId: 'mahoraga-code-guardian', parentAgentId: 'mahoraga-steward', role: 'code-guardian', mission: 'Code repair.', capabilities: ['primary-codex-builder'], privileges: [],
  }, { createdAt: '2026-09-05T06:00:00.000Z' })];
  const plans = subject.planChildAgents({
    parentAgentId: 'mahoraga-steward',
    existingAgents: existing,
    gaps: [
      { id: 'primary-codex-builder', state: 'open', priority: 'medium', summary: 'Builder gap', dependency: 'Need execution contract.' },
      { id: 'signed-browser-session', state: 'unverified', priority: 'high', summary: 'Browser gap', dependency: 'Need signed session proof.' },
      { id: 'local-reasoner', state: 'blocked', priority: 'medium', summary: 'Local model blocked', dependency: 'Need live Windows proof.' },
      { id: 'workspace-agent-cloud', state: 'optional', priority: 'low', summary: 'Optional cloud worker', dependency: 'Optional.' },
    ],
    createdAt: '2026-09-05T06:00:00.000Z',
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].gapId, 'signed-browser-session');
  assert.equal(plans[0].manifest.zeroCredit, true);
  assert.equal(plans[0].manifest.ownerApprovalRequired, false);
});

test('foundry applies planned children to the permanent registry idempotently', () => {
  assert.equal(typeof subject.applyAgentFoundryPlans, 'function');
  const existing = subject.createChildAgentManifest({
    agentId: 'mahoraga-code-guardian', parentAgentId: 'mahoraga-steward', role: 'code-guardian', mission: 'Code repair.', capabilities: ['regression-repair'], privileges: [],
  }, { createdAt: '2026-09-05T06:00:00.000Z' });
  const plan = subject.planChildAgents({
    parentAgentId: 'mahoraga-steward', existingAgents: [existing],
    gaps: [{ id: 'primary-codex-builder', state: 'open', priority: 'medium', summary: 'Builder needs execution.', dependency: 'Create a bounded builder specialist.' }],
    createdAt: '2026-09-05T06:30:00.000Z',
  })[0];
  const once = subject.applyAgentFoundryPlans({ schemaVersion: 1, parentAgentId: 'mahoraga-steward', agents: [existing] }, [plan]);
  assert.equal(once.agents.length, 2);
  assert.equal(once.agents[1].agentId, 'mahoraga-primary-codex-builder-specialist');
  const twice = subject.applyAgentFoundryPlans(once, [plan]);
  assert.deepEqual(twice, once);
});

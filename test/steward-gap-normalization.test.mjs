import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStewardGapAudit } from '../src/steward-gap-normalization.mjs';
import { runGrowthCompoundingLoop } from '../src/growth-compounding-loop.mjs';

const NOW = '2026-09-07T07:00:00.000Z';

function gap(id, state, priority = 'high') {
  return {
    id,
    state,
    priority,
    summary: `${id} needs attention.`,
    dependency: 'live-runtime-evidence',
  };
}

test('blocked runtime gaps become unverified compounding work while optional gaps stay optional', () => {
  const gaps = normalizeStewardGapAudit([
    gap('signed-browser-session', 'blocked', 'high'),
    gap('local-reasoner', 'blocked', 'medium'),
    gap('github-copilot-worker', 'optional', 'low'),
  ]);
  assert.deepEqual(gaps.map(({ id, state }) => ({ id, state })), [
    { id: 'github-copilot-worker', state: 'optional' },
    { id: 'local-reasoner', state: 'unverified' },
    { id: 'signed-browser-session', state: 'unverified' },
  ]);

  const growth = runGrowthCompoundingLoop({
    gaps,
    now: NOW,
    memoryRecords: [],
    existingObjectives: [],
    existingUnits: [],
    agents: [],
    feats: [],
  });
  assert.deepEqual(growth.objectives.map((objective) => objective.objectiveId), [
    'obj-signed-browser-session',
    'obj-local-reasoner',
  ]);
  assert.equal(growth.objectives.some((objective) => objective.objectiveId === 'obj-github-copilot-worker'), false);
});

test('gap normalization is deterministic, bounded, and never upgrades optional or closed work', () => {
  const input = [
    gap('z-optional', 'optional', 'low'),
    gap('a-blocked', 'blocked', 'critical'),
    gap('m-closed', 'closed', 'high'),
    gap('b-open', 'open', 'high'),
    gap('c-unverified', 'unverified', 'medium'),
  ];
  const first = normalizeStewardGapAudit(input);
  const second = normalizeStewardGapAudit([...input].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(({ id, state }) => [id, state]), [
    ['a-blocked', 'unverified'],
    ['b-open', 'open'],
    ['c-unverified', 'unverified'],
    ['m-closed', 'closed'],
    ['z-optional', 'optional'],
  ]);
  assert.throws(() => normalizeStewardGapAudit(new Array(1025).fill(gap('duplicate-gap', 'blocked'))), /steward-gap-audit-too-large/);
});

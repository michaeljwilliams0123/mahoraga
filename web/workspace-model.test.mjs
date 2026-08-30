import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendObjective,
  applyToolEvidence,
  createBrowserApproval,
  createWorkspaceState,
  deriveLayout,
  deriveMergeState,
  releaseTimeline
} from './workspace-model.mjs';

test('multi-turn conversation preserves ordered continuity', () => {
  let state = createWorkspaceState();
  state = appendObjective(state, { prompt: 'Analyze a complex dataset', lane: 'codex' }, { id: 'objective-1', now: '2026-08-30T00:00:00.000Z' });
  state = appendObjective(state, { prompt: 'Now compare anomalies by cohort', lane: 'actions' }, { id: 'objective-2', now: '2026-08-30T00:01:00.000Z' });
  assert.deepEqual(state.messages.map((message) => message.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(state.objectives[1].prompt, 'Now compare anomalies by cohort');
  assert.equal(state.nodes.length, 8);
  assert.match(state.announcements.at(-1), /Objective added/);
});

test('pending, running, and failed tool evidence is explicit', () => {
  let state = appendObjective(createWorkspaceState(), { prompt: 'Verify repository' }, { id: 'objective-7' });
  assert.equal(state.nodes.find((item) => item.id === 'dispatch-7').state, 'pending');
  state = applyToolEvidence(state, { nodeId: 'dispatch-7', status: 'running', evidence: 'Workflow run 41' });
  assert.equal(state.nodes.find((item) => item.id === 'dispatch-7').state, 'running');
  state = applyToolEvidence(state, { nodeId: 'dispatch-7', status: 'failed', evidence: 'Workflow run 41 exited 1' });
  assert.equal(state.nodes.find((item) => item.id === 'dispatch-7').evidence, 'Workflow run 41 exited 1');
  assert.match(state.announcements.at(-1), /failed/i);
});

test('graph links objective through plan, dispatch, and verification', () => {
  const state = appendObjective(createWorkspaceState(), { prompt: 'Improve interface' }, { id: 'objective-9' });
  assert.deepEqual(state.nodes.map((item) => item.parent), [null, 'goal-9', 'plan-9', 'dispatch-9']);
});

test('automatic merge state never guesses', () => {
  assert.deepEqual(deriveMergeState([], true), { state: 'not-enabled', count: 0, detail: 'No open PR exposes auto_merge' });
  assert.equal(deriveMergeState([{ auto_merge: { merge_method: 'squash' } }], true).state, 'enabled');
  assert.equal(deriveMergeState([], false).state, 'unknown');
});

test('browser approval binds exact target instruction and data class without claiming execution', () => {
  const approval = createBrowserApproval({
    target: 'https://github.com/michaeljwilliams0123/mahoraga/actions',
    instruction: 'Inspect the latest verification run.',
    dataClass: 'repository-public-metadata'
  });
  assert.equal(approval.executionState, 'not-executed');
  assert.equal(approval.target, 'https://github.com/michaeljwilliams0123/mahoraga/actions');
  assert.throws(() => createBrowserApproval({ target: 'javascript:alert(1)', instruction: 'go', dataClass: 'public' }));
});

test('desktop, compact, and mobile layout breakpoints remain deterministic', () => {
  assert.equal(deriveLayout(1440), 'desktop');
  assert.equal(deriveLayout(800), 'compact');
  assert.equal(deriveLayout(390), 'mobile');
});

test('release timeline exposes rollback boundary truthfully', () => {
  assert.equal(releaseTimeline([], true).rollback, 'not-ready');
  assert.equal(releaseTimeline([], false).rollback, 'unknown');
  const result = releaseTimeline([{ tag_name: 'v3.6.0', prerelease: false }], true);
  assert.equal(result.rollback, 'device-private');
  assert.match(result.evidence, /checkpoint/);
});

export function createWorkspaceState() {
  return { objectives: [], messages: [], nodes: [], announcements: [] };
}

export function appendObjective(state, input, { now = new Date().toISOString(), id = 'objective-1' } = {}) {
  if (!state || !Array.isArray(state.messages) || typeof input?.prompt !== 'string' || !input.prompt.trim()) throw new TypeError('workspace-objective-invalid');
  const objective = {
    id,
    prompt: input.prompt.trim(),
    title: input.prompt.trim().length > 72 ? input.prompt.trim().slice(0, 69) + '…' : input.prompt.trim(),
    lane: input.lane || 'codex',
    returnMode: input.returnMode || 'pull-request',
    createdAt: now
  };
  const suffix = id.replace('objective-', '');
  return {
    ...state,
    objectives: [...state.objectives, objective],
    messages: [
      ...state.messages,
      { role: 'user', text: objective.prompt, at: now, objectiveId: id },
      { role: 'assistant', text: 'Objective bounded; authenticated dispatch is pending.', at: now, objectiveId: id }
    ],
    nodes: [
      ...state.nodes,
      node('goal-' + suffix, id, 'objective', objective.title, 'ready', null, 'Session memory only'),
      node('plan-' + suffix, id, 'plan', 'Bound scope and success criteria', 'completed', 'goal-' + suffix, 'Derived in session'),
      node('dispatch-' + suffix, id, 'dispatch', laneLabel(objective.lane), 'pending', 'plan-' + suffix, 'Awaiting authenticated submission'),
      node('verify-' + suffix, id, 'verification', 'Repository verification', 'pending', 'dispatch-' + suffix, 'No workflow linked')
    ],
    announcements: [...state.announcements, 'Objective added. Review the plan or continue through GitHub.']
  };
}

export function applyToolEvidence(state, evidence) {
  if (!state || typeof evidence?.nodeId !== 'string' || !['pending', 'running', 'completed', 'failed'].includes(evidence.status)) throw new TypeError('workspace-tool-evidence-invalid');
  let found = false;
  const nodes = state.nodes.map((item) => {
    if (item.id !== evidence.nodeId) return item;
    found = true;
    return { ...item, state: evidence.status, evidence: evidence.evidence || 'No evidence supplied' };
  });
  if (!found) throw new TypeError('workspace-node-not-found');
  const message = evidence.status === 'failed' ? 'Tool failed. Review its repository evidence.' : 'Tool state changed to ' + evidence.status + '.';
  return { ...state, nodes, announcements: [...state.announcements, message] };
}

export function deriveMergeState(pulls, apiAvailable = true) {
  if (!apiAvailable) return { state: 'unknown', detail: 'No API evidence' };
  const enabled = (pulls || []).filter((pull) => pull?.auto_merge);
  return enabled.length
    ? { state: 'enabled', count: enabled.length, detail: 'Derived from open pull requests' }
    : { state: 'not-enabled', count: 0, detail: 'No open PR exposes auto_merge' };
}

export function createBrowserApproval({ target, instruction, dataClass }) {
  if (!/^https:\/\//.test(target || '') || !String(instruction || '').trim() || !/^[a-z0-9-]+$/.test(dataClass || '')) throw new TypeError('workspace-browser-approval-invalid');
  return Object.freeze({ target, instruction: instruction.trim(), dataClass, executionState: 'not-executed', reason: 'provider-signal-unavailable' });
}

export function deriveLayout(width) {
  if (!Number.isFinite(width) || width <= 0) throw new TypeError('workspace-viewport-invalid');
  return width <= 560 ? 'mobile' : width <= 900 ? 'compact' : 'desktop';
}

export function releaseTimeline(releases, apiAvailable = true) {
  if (!apiAvailable) return { releases: [], rollback: 'unknown', evidence: 'Release API unavailable' };
  if (!Array.isArray(releases) || releases.length === 0) return { releases: [], rollback: 'not-ready', evidence: 'No published release evidence' };
  return {
    releases: releases.map((item) => ({ tag: item.tag_name, channel: item.prerelease ? 'beta' : 'stable', state: 'published' })),
    rollback: 'device-private',
    evidence: 'Release published; local checkpoint and health check remain device-private'
  };
}

function node(id, objectiveId, kind, title, state, parent, evidence) {
  return { id, objectiveId, kind, title, state, parent, evidence };
}
function laneLabel(value) {
  return ({ codex: 'Codex cloud', actions: 'Deterministic Actions', desktop: 'Desktop relay' })[value] || 'Unavailable';
}

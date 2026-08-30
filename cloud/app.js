const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const GITHUB = 'https://github.com/' + REPOSITORY;
const API = 'https://api.github.com/repos/' + REPOSITORY;
const ISSUE_TEMPLATE = GITHUB + '/issues/new?template=codex-cloud-task.yml';
const $ = (id) => document.getElementById(id);

const state = {
  activeView: 'chat',
  objectives: [],
  messages: [],
  nodes: [],
  repository: null,
  pulls: [],
  runs: [],
  releases: [],
  selectedNode: null,
  refreshedAt: null
};

const titles = { chat: 'Conversation', graph: 'Task graph', activity: 'Live activity', systems: 'Systems', updates: 'Updates' };

document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.panel)));
document.querySelectorAll('[data-open-chat]').forEach((button) => button.addEventListener('click', () => { showView('chat'); $('prompt').focus(); }));
document.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', refresh));
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('prompt').value = button.dataset.prompt; resizeComposer(); $('prompt').focus(); }));
$('new-chat').addEventListener('click', newObjective);
$('menu').addEventListener('click', () => $('rail').classList.toggle('open'));
$('refresh').addEventListener('click', refresh);
$('composer').addEventListener('submit', submitObjective);
$('messages').addEventListener('click', async (event) => {
  const link = event.target.closest('[data-dispatch-objective]');
  if (!link) return;
  const objective = state.objectives.find((item) => item.id === link.dataset.dispatchObjective);
  if (!objective) return;
  try { await navigator.clipboard.writeText(objective.prompt); announce('Task copied. Paste it into the authenticated GitHub form.'); }
  catch { announce('Clipboard unavailable. Copy the task from the conversation before continuing.'); }
});
$('prompt').addEventListener('input', resizeComposer);
$('prompt').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    $('composer').requestSubmit();
  }
});
$('graph-canvas').addEventListener('click', (event) => {
  const node = event.target.closest('[data-node-id]');
  if (node) selectNode(node.dataset.nodeId);
});
$('browser-request').addEventListener('click', () => $('approval-dialog').showModal());
$('record-approval').addEventListener('click', () => {
  announce('Browser intent recorded. No browser action was executed because no provider signal is available.');
  toast('Approval recorded without execution');
});

function showView(name) {
  if (!Object.hasOwn(titles, name)) return;
  state.activeView = name;
  document.querySelectorAll('[data-view]').forEach((view) => view.classList.toggle('active', view.dataset.view === name));
  document.querySelectorAll('[data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === name));
  $('view-title').textContent = titles[name];
  $('rail').classList.remove('open');
  if (name === 'graph') renderGraph();
  if (name === 'activity') renderActivity();
}

function newObjective() {
  state.objectives = [];
  state.messages = [];
  state.nodes = [];
  state.selectedNode = null;
  $('welcome').classList.remove('hidden');
  renderMessages();
  renderHistory();
  renderGraph();
  announce('Started a new objective');
  showView('chat');
  $('prompt').focus();
}

function submitObjective(event) {
  event.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  const lane = $('lane').value;
  const returnMode = $('return-mode').value;
  const objective = {
    id: 'objective-' + Date.now(),
    title: prompt.length > 72 ? prompt.slice(0, 69) + '…' : prompt,
    prompt,
    lane,
    returnMode,
    createdAt: new Date().toISOString()
  };
  state.objectives.push(objective);
  state.messages.push({ role: 'user', text: prompt, at: objective.createdAt });
  state.messages.push({
    role: 'assistant',
    text: 'I formed this into a bounded repository objective. The execution graph is ready, but no model or browser action has been claimed yet. Continue through GitHub to authenticate the dispatch and preserve review evidence.',
    at: new Date().toISOString(),
    objectiveId: objective.id
  });
  addObjectiveGraph(objective);
  $('prompt').value = '';
  resizeComposer();
  renderMessages();
  renderHistory();
  renderGraph();
  announce('Objective added. Review the plan or continue through GitHub.');
}

function addObjectiveGraph(objective) {
  const suffix = objective.id.split('-').at(-1);
  state.nodes.push(
    { id: 'goal-' + suffix, objectiveId: objective.id, kind: 'objective', title: objective.title, state: 'ready', evidence: 'Session memory only', parent: null },
    { id: 'plan-' + suffix, objectiveId: objective.id, kind: 'plan', title: 'Bound scope and success criteria', state: 'completed', evidence: 'Derived in this browser session', parent: 'goal-' + suffix },
    { id: 'dispatch-' + suffix, objectiveId: objective.id, kind: 'dispatch', title: laneLabel(objective.lane), state: 'pending', evidence: 'Awaiting authenticated GitHub submission', parent: 'plan-' + suffix },
    { id: 'verify-' + suffix, objectiveId: objective.id, kind: 'verification', title: 'Repository verification', state: 'pending', evidence: 'No workflow run linked yet', parent: 'dispatch-' + suffix }
  );
  $('graph-count').textContent = String(state.nodes.length);
}

function renderMessages() {
  let thread = $('messages').querySelector('.thread');
  if (!thread) {
    thread = document.createElement('div');
    thread.className = 'thread';
    $('messages').append(thread);
  }
  thread.innerHTML = state.messages.map((message) => {
    if (message.role === 'user') return '<article class="message user"><div class="bubble"><p>' + escapeHtml(message.text) + '</p><small>' + time(message.at) + '</small></div></article>';
    const objective = state.objectives.find((item) => item.id === message.objectiveId);
    const link = objective ? issueLink(objective) : GITHUB + '/issues/new';
    return '<article class="message assistant"><div class="avatar">M</div><div class="bubble"><p>' + escapeHtml(message.text) + '</p><div class="evidence"><b>Next action</b><span>Lane: ' + escapeHtml(laneLabel(objective?.lane)) + ' · Return: ' + escapeHtml(objective?.returnMode || 'pull-request') + '</span><a href="' + escapeHtml(link) + '">Continue authenticated dispatch ↗</a></div><small>' + time(message.at) + '</small></div></article>';
  }).join('');
  $('welcome').classList.toggle('hidden', state.messages.length > 0);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function renderHistory() {
  $('history-list').innerHTML = state.objectives.length
    ? state.objectives.slice().reverse().map((item) => '<button type="button" data-history-id="' + item.id + '">' + escapeHtml(item.title) + '</button>').join('')
    : '<p>No objectives yet</p>';
}

function renderGraph() {
  if (!state.nodes.length) {
    $('graph-canvas').innerHTML = '<p class="empty">Add an objective to create the first graph.</p>';
    $('graph-count').textContent = '0';
    return;
  }
  const kinds = ['objective', 'plan', 'dispatch', 'verification'];
  $('graph-canvas').innerHTML = '<div class="graph-layer">' + kinds.map((kind) => {
    const nodes = state.nodes.filter((node) => node.kind === kind);
    return '<div class="graph-column">' + nodes.map((node) => '<button type="button" class="graph-node ' + escapeHtml(node.state) + (state.selectedNode === node.id ? ' selected' : '') + '" data-node-id="' + node.id + '"><b>' + escapeHtml(node.title) + '</b><small>' + escapeHtml(label(node.kind)) + '</small><span class="node-state">' + escapeHtml(node.state) + '</span></button>').join('') + '</div>';
  }).join('') + '</div>';
  $('graph-count').textContent = String(state.nodes.length);
}

function selectNode(id) {
  const node = state.nodes.find((item) => item.id === id);
  if (!node) return;
  state.selectedNode = id;
  $('node-detail').innerHTML = '<dl><dt>Type</dt><dd>' + escapeHtml(label(node.kind)) + '</dd><dt>State</dt><dd>' + escapeHtml(node.state) + '</dd><dt>Evidence</dt><dd>' + escapeHtml(node.evidence) + '</dd><dt>Parent</dt><dd>' + escapeHtml(node.parent || 'Root objective') + '</dd></dl>';
  renderGraph();
}

async function refresh() {
  setRepoState('checking', 'Connecting', 'GitHub status is loading');
  const results = await Promise.allSettled([
    getJson(API),
    getJson(API + '/pulls?state=open&per_page=20'),
    getJson(API + '/actions/runs?per_page=20'),
    github('/releases?per_page=12')
  ]);
  if (results[0].status === 'fulfilled') {
    state.repository = results[0].value;
    setRepoState('ready', 'GitHub connected', (state.repository.private ? 'Private' : 'Public') + ' repository · ' + state.repository.default_branch);
    $('github-status').textContent = 'Active';
    $('github-status').className = 'badge active';
    $('github-evidence').textContent = 'Verified via GitHub API at ' + new Date().toLocaleTimeString();
  } else {
    state.repository = null;
    setRepoState('failed', 'GitHub unavailable', 'No repository API evidence');
    $('github-status').textContent = 'Unavailable';
    $('github-status').className = 'badge failed';
    $('github-evidence').textContent = 'GitHub API request failed; status is not inferred.';
  }
  state.pulls = results[1].status === 'fulfilled' ? results[1].value : [];
  state.runs = results[2].status === 'fulfilled' ? results[2].value.workflow_runs || [] : [];
  state.releases = results[3].status === 'fulfilled' ? results[3].value : [];
  state.refreshedAt = new Date().toISOString();
  renderActivity();
  renderSystems();
  renderUpdates();
  announce(state.repository ? 'Repository evidence refreshed' : 'Repository refresh failed');
}

function renderActivity() {
  const running = state.runs.filter((run) => run.status !== 'completed');
  const failed = state.runs.filter((run) => run.conclusion && !['success', 'neutral', 'skipped'].includes(run.conclusion));
  $('open-prs').textContent = state.repository ? String(state.pulls.length) : '—';
  $('running-tools').textContent = state.repository ? String(running.length) : '—';
  $('failed-tools').textContent = state.repository ? String(failed.length) : '—';
  $('run-count').textContent = state.repository ? String(running.length) : '—';

  const mergeEnabled = state.pulls.filter((pull) => pull.auto_merge);
  if (!state.repository) {
    $('merge-state').textContent = 'Unknown';
    $('merge-detail').textContent = 'No API evidence';
  } else if (mergeEnabled.length) {
    $('merge-state').textContent = String(mergeEnabled.length) + ' enabled';
    $('merge-detail').textContent = 'Derived from open pull requests';
  } else {
    $('merge-state').textContent = 'Not enabled';
    $('merge-detail').textContent = 'No open PR exposes auto_merge';
  }

  $('activity-list').innerHTML = state.runs.length ? state.runs.slice(0, 10).map((run) => {
    const status = run.status === 'completed' ? (run.conclusion || 'completed') : run.status;
    return '<a class="list-item" href="' + escapeHtml(run.html_url) + '"><span><b>' + escapeHtml(run.name) + '</b><small>' + escapeHtml(run.event) + ' · ' + time(run.updated_at) + '</small></span><i class="badge ' + escapeHtml(status) + '">' + escapeHtml(status) + '</i></a>';
  }).join('') : '<p class="empty">' + (state.repository ? 'No workflow runs returned.' : 'Workflow evidence unavailable.') + '</p>';

  $('pr-list').innerHTML = state.pulls.length ? state.pulls.map((pull) => '<a class="list-item" href="' + escapeHtml(pull.html_url) + '"><span><b>#' + pull.number + ' ' + escapeHtml(pull.title) + '</b><small>' + escapeHtml(pull.user.login) + ' · updated ' + time(pull.updated_at) + '</small></span><i class="badge ' + (pull.draft ? 'pending' : 'active') + '">' + (pull.draft ? 'draft' : 'open') + '</i></a>').join('') : '<p class="empty">' + (state.repository ? 'No open return candidates.' : 'Pull-request evidence unavailable.') + '</p>';
}

function renderSystems() {
  const relay = state.runs.find((run) => run.name === 'Validate Destiny Codex Relay');
  const badge = $('codex-status');
  if (!state.repository) {
    badge.textContent = 'Not verified';
    badge.className = 'badge unavailable';
  } else if (relay?.conclusion === 'success') {
    badge.textContent = 'Relay verified';
    badge.className = 'badge success';
  } else if (relay) {
    badge.textContent = relay.status === 'completed' ? (relay.conclusion || 'unknown') : relay.status;
    badge.className = 'badge ' + (relay.conclusion || relay.status);
  } else {
    badge.textContent = 'No recent signal';
    badge.className = 'badge unavailable';
  }
}

function renderUpdates() {
  $('rollback-state').textContent = state.releases.length
    ? 'Rollback readiness: policy declared; device checkpoint is private'
    : 'Rollback readiness: no published release evidence';
  $('release-list').innerHTML = state.releases.length ? state.releases.map((release) => '<a class="list-item" href="' + escapeHtml(release.html_url) + '"><i></i><span><b>' + escapeHtml(release.name || release.tag_name) + '</b><small>' + (release.prerelease ? 'Beta' : 'Stable') + ' · published ' + time(release.published_at) + '</small></span><span class="badge success">published</span></a>').join('') : '<p class="empty">' + (state.repository ? 'No releases published.' : 'Release evidence unavailable.') + '</p>';
}

function issueLink() {
  return ISSUE_TEMPLATE;
}

function github(path) { return getJson(API + path); }

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('GitHub request failed: ' + response.status);
  return response.json();
}

function setRepoState(kind, title, detail) {
  $('repo-dot').className = kind;
  $('repo-label').textContent = title;
  $('repo-detail').textContent = detail;
}
function resizeComposer() { const input = $('prompt'); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
function announce(message) { $('live-region').textContent = ''; window.setTimeout(() => { $('live-region').textContent = message; }, 10); }
function toast(message) { const element = $('toast'); element.textContent = message; element.className = 'show'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.className = ''; }, 3000); }
function laneLabel(value) { return ({ codex: 'Codex cloud', actions: 'Deterministic Actions', desktop: 'Desktop relay' })[value] || 'Unavailable'; }
function time(value) { return value ? new Date(value).toLocaleString() : 'unknown'; }
function label(value) { return String(value || '').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }

renderMessages();
renderHistory();
renderGraph();
refresh();
window.setInterval(() => { if (!document.hidden) refresh(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

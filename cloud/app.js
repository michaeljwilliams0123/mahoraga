const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const GITHUB = `https://github.com/${REPOSITORY}`;
const API = `https://api.github.com/repos/${REPOSITORY}`;
const $ = (id) => document.getElementById(id);

const state = {
  repository: null, commit: null, issues: [], pulls: [], runs: [], releases: [], messages: [],
  connection: 'staged',
};

const skillPrompts = {
  repository: 'Review the repository and implement the highest-value improvement.',
  ui: 'Improve the Mahoraga conversation interface and verify it in the browser.',
  testing: 'Run complete verification, diagnose failures, and fix the root cause.',
  security: 'Review security and privacy boundaries, then fix verified weaknesses.',
  release: 'Prepare the next verified release with rollback evidence.',
  auto: 'Choose the fastest healthy execution path for this request.',
};

document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => {
  if (button.classList.contains('new-task')) startNewConversation();
  showView(button.dataset.viewTarget);
}));
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => setPrompt(button.dataset.prompt)));
document.querySelectorAll('[data-new-cloud-task]').forEach((button) => button.addEventListener('click', () => {
  startNewConversation();
  showView('workspace');
}));
document.querySelectorAll('[data-skill-preset]').forEach((button) => button.addEventListener('click', () => {
  setPrompt(skillPrompts[button.dataset.skillPreset] || skillPrompts.auto);
  showView('workspace');
}));
$('task-text').addEventListener('input', () => {
  resizeComposer();
  renderClassificationPreview();
});
$('conversation-composer').addEventListener('submit', submitConversation);
$('refresh').addEventListener('click', () => refreshCloudState(true));
document.querySelector('.mobile-nav').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

function showView(name) {
  const target = document.querySelector(`[data-view="${name}"]`);
  if (!target) return;
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view === target));
  document.querySelectorAll('.nav-list [data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name));
  $('page-title').textContent = name[0].toUpperCase() + name.slice(1);
  document.querySelector('.sidebar').classList.remove('open');
  location.hash = name;
}

function classifyTask(value) {
  const text = String(value || '').toLowerCase();
  if (/security|privacy|credential|threat|vulnerab|audit/.test(text)) return { id: 'assurance', label: 'Security and assurance', lane: 'evidence-first' };
  if (/test|verify|validation|check|failure|broken/.test(text)) return { id: 'verification', label: 'Testing and verification', lane: 'deterministic-fast' };
  if (/release|deploy|publish|version|rollback/.test(text)) return { id: 'release', label: 'Release engineering', lane: 'verified-release' };
  if (/interface|frontend|workspace|page|layout|design|accessib/.test(text)) return { id: 'experience', label: 'Interface and experience', lane: 'implementation' };
  if (/mailbox|dataverse|copilot|microsoft|workspace agent/.test(text)) return { id: 'connector', label: 'Connector readiness', lane: 'provider-probe' };
  return { id: 'repository', label: 'Repository engineering', lane: 'implementation' };
}

function submitConversation(event) {
  event.preventDefault();
  const input = $('task-text');
  const content = input.value.trim();
  if (!content) {
    input.focus();
    return;
  }
  const classification = classifyTask(content);
  appendMessage('user', content);
  state.messages.push({ role: 'user', classification: classification.id });
  input.value = '';
  resizeComposer();
  renderClassificationPreview();
  appendMessage(
    'assistant',
    `Classified as ${classification.label}. Authenticated execution bridge is not connected, so this message remains only in this tab and has not been dispatched.`,
    { label: classification.lane, state: 'staged' },
  );
  state.messages.push({ role: 'assistant', classification: classification.id, dispatched: false });
  toast('Message classified instantly · execution bridge staged');
}

function appendMessage(role, content, metadata = {}) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  if (role === 'assistant') {
    const icon = document.createElement('img');
    icon.src = './mark.svg'; icon.alt = ''; icon.width = 28; icon.height = 28;
    article.append(icon);
  }
  const body = document.createElement('div');
  const author = document.createElement('strong');
  author.textContent = role === 'user' ? 'You' : 'Mahoraga';
  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  body.append(author, paragraph);
  if (metadata.label) {
    const status = document.createElement('span');
    status.className = `message-state ${metadata.state || ''}`;
    status.textContent = metadata.label;
    body.append(status);
  }
  article.append(body);
  $('conversation-thread').append(article);
  article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return article;
}

function setPrompt(value) {
  $('task-text').value = value || '';
  resizeComposer();
  renderClassificationPreview();
  $('task-text').focus();
}

function startNewConversation() {
  const thread = $('conversation-thread');
  while (thread.children.length > 1) thread.lastElementChild.remove();
  state.messages = [];
  setPrompt('');
}

function renderClassificationPreview() {
  const value = $('task-text').value.trim();
  $('classification-preview').textContent = value ? classifyTask(value).label : 'Auto';
}

async function refreshCloudState(manual = false) {
  if (manual) $('refresh').disabled = true;
  const responses = await Promise.allSettled([
    github('/'), github('/commits/main'), github('/issues?state=all&per_page=30'),
    github('/pulls?state=open&per_page=30'), github('/actions/runs?per_page=12'), github('/releases?per_page=12'),
  ]);
  if (responses[0].status === 'fulfilled') state.repository = responses[0].value;
  if (responses[1].status === 'fulfilled') state.commit = responses[1].value;
  if (responses[2].status === 'fulfilled') state.issues = responses[2].value.filter((item) => !item.pull_request && /^\[(?:CODEX|MAHORAGA)\]/.test(item.title));
  if (responses[3].status === 'fulfilled') state.pulls = responses[3].value;
  if (responses[4].status === 'fulfilled') state.runs = responses[4].value.workflow_runs || [];
  if (responses[5].status === 'fulfilled') state.releases = responses[5].value;
  renderCloudState(responses.every((item) => item.status === 'fulfilled'));
  if (manual) { $('refresh').disabled = false; toast('Cloud status refreshed'); }
}

async function github(path) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/vnd.github+json' }, referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`github-${response.status}`);
  return response.json();
}

function renderCloudState(complete) {
  const available = Boolean(state.repository);
  $('repo-dot').className = available ? 'ready' : complete ? 'error' : '';
  $('repo-state').textContent = available ? 'Repository telemetry live' : 'Repository telemetry unavailable';
  $('repo-detail').textContent = available ? `${state.repository.visibility} repository · conversation bridge staged` : 'Open GitHub for authenticated repository state';
  $('github-visibility').textContent = available ? `${capitalize(state.repository.visibility)} · read-only telemetry connected` : 'Status is unavailable; open GitHub to authenticate.';
  $('metric-tasks').textContent = String(state.issues.filter((item) => item.state === 'open').length);
  $('metric-prs').textContent = String(state.pulls.length);
  $('metric-sha').textContent = state.commit?.sha?.slice(0, 7) || 'Private';
  $('metric-sha-time').textContent = state.commit ? `Updated ${relativeTime(state.commit.commit.committer.date)}` : 'Open GitHub for current revision';
  const latestRun = state.runs[0];
  $('metric-run').textContent = latestRun ? (latestRun.conclusion || latestRun.status) : 'Private';
  $('metric-run-time').textContent = latestRun ? `${latestRun.name} · ${relativeTime(latestRun.updated_at)}` : 'Open GitHub Actions for status';
  $('activity-count').textContent = String(state.issues.filter((item) => item.state === 'open').length + state.pulls.length);
  $('approval-count').textContent = String(state.pulls.length);
  renderRows('task-list', state.issues.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · updated ${relativeTime(item.updated_at)}`, state: issueState(item) })));
  renderRows('run-list', state.runs.slice(0, 10).map((run) => ({ href: run.html_url, title: run.name, detail: `${run.event} · ${relativeTime(run.updated_at)}`, state: run.conclusion || run.status })));
  renderRows('approval-list', state.pulls.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · updated ${relativeTime(item.updated_at)}`, state: item.draft ? 'draft' : 'review' })));
  const latestRelease = state.releases[0];
  $('release-latest').textContent = latestRelease?.tag_name || 'None';
  $('release-latest-time').textContent = latestRelease ? `${latestRelease.prerelease ? 'Beta' : 'Stable'} · ${relativeTime(latestRelease.published_at)}` : 'Owner-started only';
  renderRows('release-list', state.releases.map((release) => ({ href: release.html_url, title: release.name || release.tag_name, detail: `${release.prerelease ? 'beta' : 'stable'} · ${relativeTime(release.published_at)}`, state: release.draft ? 'draft' : 'attested' })));
}

function renderRows(id, rows) {
  const container = $(id);
  if (!container) return;
  container.replaceChildren(...(rows.length ? rows.map((row) => {
    const link = document.createElement('a'); link.className = 'activity-row'; link.href = row.href;
    const title = document.createElement('strong'); title.textContent = row.title;
    const detail = document.createElement('span'); detail.textContent = row.detail;
    const badge = document.createElement('b'); badge.textContent = row.state; badge.className = row.state;
    link.append(title, detail, badge); return link;
  }) : [emptyRow()]));
}

function emptyRow() {
  const item = document.createElement('p');
  item.className = 'empty';
  item.textContent = 'No public activity is available.';
  return item;
}

function resizeComposer() {
  const input = $('task-text');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 190)}px`;
}

function relativeTime(value) {
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function capitalize(value) { return value ? value[0].toUpperCase() + value.slice(1) : 'Unknown'; }
function issueState(issue) {
  const lane = issue.labels.find((label) => labelName(label).startsWith('lane:'));
  return lane ? labelName(lane).replace('lane:', '') : issue.state;
}
function labelName(label) { return typeof label === 'string' ? label : label?.name || ''; }
function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

const initialView = location.hash.slice(1);
showView(document.querySelector(`[data-view="${initialView}"]`) ? initialView : 'workspace');
refreshCloudState();

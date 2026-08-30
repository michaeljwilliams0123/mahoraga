const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const GITHUB = `https://github.com/${REPOSITORY}`;
const API = `https://api.github.com/repos/${REPOSITORY}`;
const ISSUE_TEMPLATE = `${GITHUB}/issues/new?template=codex-cloud-task.yml`;
const CONTROL_ACTION = `${GITHUB}/actions/workflows/chromebook-control-plane.yml`;
const RELEASE_ACTION = `${GITHUB}/actions/workflows/release.yml`;
const $ = (id) => document.getElementById(id);

const state = { repository: null, commit: null, issues: [], pulls: [], runs: [], releases: [], draft: '' };

document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget)));
document.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click', () => {
  $('task-text').value = button.dataset.quick;
  $('tool-profile').value = button.dataset.tool || 'auto';
  $('execution-lane').value = button.dataset.lane || 'codex';
  resizeComposer();
  $('task-text').focus();
}));
document.querySelectorAll('[data-new-cloud-task]').forEach((button) => button.addEventListener('click', () => showView('workspace')));
document.querySelectorAll('[data-skill-preset]').forEach((button) => button.addEventListener('click', () => selectSkill(button.dataset.skillPreset, button.dataset.lane)));
$('task-text').addEventListener('input', resizeComposer);
$('task-draft').addEventListener('submit', (event) => { event.preventDefault(); prepareHandoff(); });
$('attachment-help').addEventListener('click', () => prepareHandoff(true));
$('continue-github').addEventListener('click', () => openGithubTask());
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
  $('repo-state').textContent = available ? 'GitHub connected' : 'Open GitHub to continue';
  $('repo-detail').textContent = available ? `${state.repository.visibility} repository · read-only page` : 'Private repositories require GitHub sign-in';
  $('github-visibility').textContent = available ? `${capitalize(state.repository.visibility)} · authenticated mutations stay on github.com` : 'Status is hidden when the repository is private; open GitHub to authenticate.';
  $('metric-tasks').textContent = String(state.issues.filter((item) => item.state === 'open').length);
  $('metric-prs').textContent = String(state.pulls.length);
  $('metric-sha').textContent = state.commit?.sha?.slice(0, 7) || 'Private';
  $('metric-sha-time').textContent = state.commit ? `Updated ${relativeTime(state.commit.commit.committer.date)}` : 'Open GitHub for current revision';
  const latestRun = state.runs[0];
  $('metric-run').textContent = latestRun ? (latestRun.conclusion || latestRun.status) : 'Private';
  $('metric-run-time').textContent = latestRun ? `${latestRun.name} · ${relativeTime(latestRun.updated_at)}` : 'Open GitHub Actions for status';
  $('activity-count').textContent = String(state.issues.filter((item) => item.state === 'open').length + state.pulls.length);
  const pending = state.issues.filter((item) => item.state === 'open' && !item.labels.some((label) => labelName(label) === 'mahoraga:dispatched'));
  $('approval-count').textContent = String(pending.length);
  renderRows('task-list', state.issues.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · updated ${relativeTime(item.updated_at)}`, state: issueState(item) })));
  renderRows('run-list', state.runs.slice(0, 10).map((run) => ({ href: run.html_url, title: run.name, detail: `${run.event} · ${relativeTime(run.updated_at)}`, state: run.conclusion || run.status })));
  renderRows('approval-list', pending.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · submitted ${relativeTime(item.created_at)}`, state: 'approval' })));
  const latestRelease = state.releases[0];
  $('release-latest').textContent = latestRelease?.tag_name || 'None';
  $('release-latest-time').textContent = latestRelease ? `${latestRelease.prerelease ? 'Beta' : 'Stable'} · ${relativeTime(latestRelease.published_at)}` : 'Owner-started only';
  renderRows('release-list', state.releases.map((release) => ({ href: release.html_url, title: release.name || release.tag_name, detail: `${release.prerelease ? 'beta' : 'stable'} · ${relativeTime(release.published_at)}`, state: release.draft ? 'draft' : 'attested' })));
}

function renderRows(id, rows) {
  $(id).replaceChildren(...(rows.length ? rows.map((row) => {
    const link = document.createElement('a'); link.className = 'activity-row'; link.href = row.href;
    const title = document.createElement('strong'); title.textContent = row.title;
    const detail = document.createElement('span'); detail.textContent = row.detail;
    const badge = document.createElement('b'); badge.textContent = row.state; badge.className = row.state;
    link.append(title, detail, badge); return link;
  }) : [emptyRow()]));
}

function emptyRow() { const item = document.createElement('p'); item.className = 'empty'; item.textContent = 'No public activity is available. Open GitHub to view authenticated repository state.'; return item; }

function prepareHandoff(attachmentsOnly = false) {
  state.draft = $('task-text').value.trim();
  const lane = $('execution-lane').value;
  $('dispatch-command').textContent = lane === 'desktop' ? '/mahoraga dispatch desktop mahoraga' : lane === 'codex' ? '/mahoraga dispatch codex' : 'No model command — run the selected Action';
  $('dialog-title').textContent = attachmentsOnly ? 'Attach securely in GitHub' : 'Continue task in GitHub';
  $('copy-state').textContent = state.draft ? 'Your task text will be copied to the clipboard.' : 'The authenticated GitHub task form will open.';
  $('continue-github').textContent = lane === 'actions' ? 'Open deterministic Action ↗' : 'Open authenticated task form ↗';
  $('handoff-dialog').showModal();
}

async function openGithubTask() {
  const lane = $('execution-lane').value;
  const draft = state.draft;
  if (draft) {
    try { await navigator.clipboard.writeText(draft); toast('Task copied — paste it into the Bounded task field'); }
    catch { toast('Clipboard permission was blocked; copy the task before continuing'); return; }
  }
  if (lane === 'actions') {
    const action = $('tool-profile').value === 'release' ? RELEASE_ACTION : CONTROL_ACTION;
    location.assign(action);
    return;
  }
  const title = state.draft ? `[MAHORAGA] ${state.draft.split(/\s+/).slice(0, 9).join(' ').slice(0, 72)}` : '[MAHORAGA] ';
  location.assign(`${ISSUE_TEMPLATE}&title=${encodeURIComponent(title)}`);
}

function selectSkill(skill, lane) {
  $('tool-profile').value = skill || 'auto';
  $('execution-lane').value = lane || 'codex';
  showView('workspace');
  $('task-text').focus();
  toast(`${$('tool-profile').selectedOptions[0].textContent} skill selected`);
}

function resizeComposer() { const input = $('task-text'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 170)}px`; }
function relativeTime(value) { const seconds = Math.round((Date.now() - Date.parse(value)) / 1000); if (!Number.isFinite(seconds)) return 'unknown'; if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function capitalize(value) { return value ? value[0].toUpperCase() + value.slice(1) : 'Unknown'; }
function issueState(issue) { const lane = issue.labels.find((label) => labelName(label).startsWith('lane:')); return lane ? labelName(lane).replace('lane:', '') : issue.state === 'open' ? 'approval' : issue.state; }
function labelName(label) { return typeof label === 'string' ? label : label?.name || ''; }
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 3600); }

const initialView = location.hash.slice(1);
showView(document.querySelector(`[data-view="${initialView}"]`) ? initialView : 'workspace');
refreshCloudState();

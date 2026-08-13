const $ = (id) => document.getElementById(id);
const state = { status: null, tasks: [], conversations: [], improvements: [], diagnostics: null, activeView: 'overview' };

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const post = (url, body = {}, headers = {}) => api(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

async function refresh(quiet = true) {
  try {
    const [status, taskData, conversationData, improvementData, diagnostics] = await Promise.all([
      api('/api/status'), api('/api/tasks'), api('/api/conversations'), api('/api/improvements'), api('/api/diagnostics'),
    ]);
    Object.assign(state, { status, tasks: taskData.tasks, conversations: conversationData.conversations, improvements: improvementData.improvements, diagnostics });
    render();
    $('health').textContent = 'Runtime healthy';
    $('last-refresh').textContent = `Live ${new Date().toLocaleTimeString()}`;
    if (!quiet) notify('Control Center refreshed');
  } catch (error) {
    $('health').textContent = 'Runtime unavailable';
    $('version').textContent = 'The cockpit could not reach the supervisor.';
    $('last-refresh').textContent = 'Disconnected';
    if (!quiet) notify(error.message, 'error');
  }
}

function render() {
  const { status, tasks, conversations, improvements, diagnostics } = state;
  $('version').textContent = `${status.product} ${status.version} · Control Center ${status.versions.controlCenter} · ${status.phase}`;
  $('mode').textContent = status.autonomyMode.toUpperCase();
  $('workers').textContent = status.workers.filter((worker) => ['healthy', 'busy'].includes(worker.status)).length;
  $('queued').textContent = status.taskCounts.queued + status.taskCounts.running + status.taskCounts.verifying;
  $('improvements').textContent = status.improvementsAwaitingUser + status.taskCounts.waiting_for_user;
  $('failed').textContent = status.taskCounts.failed;
  $('worker-summary').textContent = `${status.workers.length} supervised processes`;
  $('worker-list').innerHTML = status.workers.map(workerCompact).join('') || empty('Workers are starting.');
  $('connection-list').innerHTML = status.connections.slice(0, 5).map(connectionCompact).join('');
  $('task-list').innerHTML = tasks.length ? tasks.slice(0, 10).map(taskRow).join('') : empty('No tasks yet.');
  $('task-list-full').innerHTML = tasks.length ? tasks.map(taskCard).join('') : empty('No tasks yet.');
  $('worker-control-list').innerHTML = status.workers.map(workerCard).join('') || empty('Workers are starting.');
  $('connection-control-list').innerHTML = status.connections.map(connectionCard).join('');
  renderCapabilityOptions();
  renderConversations(conversations);
  $('improvement-list').innerHTML = improvements.length ? improvements.map(improvementCard).join('') : empty('No improvement candidates recorded.');
  $('diagnostic-summary').innerHTML = [
    metric('EVENTS', diagnostics.events.length, 'Recent durable records'),
    metric('WORKER STATES', diagnostics.workers.length, 'Persisted supervisor state'),
    metric('WAITING', status.taskCounts.waiting_for_user, 'Needs your discourse'),
    metric('RECOVERY', status.repairPolicy.enabled ? 'ON' : 'OFF', 'Operational self-healing'),
  ].join('');
  $('event-list').innerHTML = diagnostics.events.length ? diagnostics.events.map(eventRow).join('') : empty('No diagnostic events.');
}

function renderCapabilityOptions() {
  const select = $('task-capability');
  const selected = select.value;
  const available = state.status.capabilities.filter((item) => item.enabled);
  select.innerHTML = available.map((item) => `<option value="${escapeHtml(item.capability)}">${escapeHtml(item.capability)} · ${escapeHtml(item.workerLabel)}</option>`).join('');
  if (available.some((item) => item.capability === selected)) select.value = selected;
  syncDataClass();
}

function renderConversations(conversations) {
  $('conversation-summary').textContent = `${conversations.length} durable thread(s)`;
  const select = $('conversation-select');
  const selected = select.dataset.next || select.value;
  select.innerHTML = '<option value="">New assignment</option>' + conversations.map((conversation) => `<option value="${conversation.id}">${escapeHtml(conversation.title)}</option>`).join('');
  if (conversations.some((conversation) => conversation.id === selected)) select.value = selected;
  delete select.dataset.next;
  loadConversation().catch((error) => notify(error.message, 'error'));
}

function workerCompact(worker) {
  return `<div class="worker"><div><b>${escapeHtml(worker.label || label(worker.workerId))} · ${escapeHtml(worker.version)}</b><small>PID ${worker.pid} · ${worker.currentTaskId ? `Task ${escapeHtml(worker.currentTaskId)}` : 'Idle'} · ${worker.capabilities.map(escapeHtml).join(' · ')}</small></div><small class="badge ${escapeHtml(worker.status)}">${escapeHtml(worker.status)}</small></div>`;
}

function connectionCompact(connection) {
  return `<div class="connection"><div><b>${escapeHtml(label(connection.id))}</b><small>${escapeHtml(connection.endpointClass)} · ${escapeHtml(connection.authenticationState)}</small></div><small class="badge ${connection.error ? 'disabled' : 'ready'}">${escapeHtml(connection.state)}</small></div>`;
}

function taskRow(task) {
  return `<div class="task-row"><b>${escapeHtml(task.capability)}</b><span>${escapeHtml(task.assignedWorker || 'unassigned')}</span><small class="badge ${escapeHtml(task.status)}">${escapeHtml(task.status)}</small><span>${formatTime(task.updatedAt)}</span></div>`;
}

function taskCard(task) {
  const retry = ['failed', 'waiting', 'cancelled'].includes(task.status) ? `<button data-task-action="retry" data-task-id="${task.id}">Retry</button>` : '';
  const cancel = ['queued', 'claimed', 'running', 'verifying', 'waiting', 'waiting_for_user'].includes(task.status) ? `<button class="danger" data-task-action="cancel" data-task-id="${task.id}">Cancel</button>` : '';
  const input = task.status === 'waiting_for_user' ? `<button data-task-action="input" data-task-id="${task.id}">Respond</button>` : '';
  return `<article class="control-card task-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(task.priority)} · ${escapeHtml(task.executionPlane)}</p><h3>${escapeHtml(task.capability)}</h3></div><span class="badge ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></div><p>${escapeHtml(task.requestedOutcome || task.capability)}</p><small>${escapeHtml(task.id)} · attempts ${task.attemptCount}/${task.maximumAttempts} · ${formatTime(task.updatedAt)}</small>${task.errorCode ? `<p class="error-text">${escapeHtml(task.errorCode)}</p>` : ''}<div class="card-actions">${input}${retry}${cancel}</div></article>`;
}

function workerCard(worker) {
  return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">PID ${worker.pid}</p><h3>${escapeHtml(worker.label)}</h3></div><span class="badge ${escapeHtml(worker.status)}">${escapeHtml(worker.status)}</span></div><p>${worker.capabilities.map(escapeHtml).join(' · ')}</p><small>Heartbeat ${formatTime(worker.lastHeartbeatAt)} · Restarts ${worker.restartCount}</small><div class="card-actions"><button data-worker-action="probe" data-worker-id="${worker.workerId}">Run probe</button><button class="danger" data-worker-action="restart" data-worker-id="${worker.workerId}">Restart process</button></div></article>`;
}

function connectionCard(connection) {
  const probe = connection.capabilities.find((capability) => state.status.capabilities.some((item) => item.enabled && item.capability === capability));
  return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(connection.endpointClass)}</p><h3>${escapeHtml(label(connection.id))}</h3></div><span class="badge ${connection.error ? 'disabled' : 'ready'}">${escapeHtml(connection.state)}</span></div><p>${escapeHtml(connection.notes || '')}</p><small>Auth: ${escapeHtml(connection.authenticationState)}${connection.lastSuccessfulCheck ? ` · Checked ${formatTime(connection.lastSuccessfulCheck)}` : ''}</small>${connection.error ? `<p class="error-text">${escapeHtml(connection.error)}</p>` : ''}<div class="card-actions">${probe ? `<button data-quick-capability="${escapeHtml(probe)}">Run ${escapeHtml(probe)}</button>` : '<button disabled>No local probe available</button>'}</div></article>`;
}

function improvementCard(improvement) {
  const actions = improvement.status === 'proposed' ? `<div class="card-actions"><button data-improvement-decision="approved" data-improvement-id="${improvement.id}">Approve</button><button class="danger" data-improvement-decision="rejected" data-improvement-id="${improvement.id}">Reject</button></div>` : '';
  return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${formatTime(improvement.createdAt)}</p><h3>${escapeHtml(improvement.title)}</h3></div><span class="badge ${escapeHtml(improvement.status)}">${escapeHtml(improvement.status)}</span></div><p>${escapeHtml(improvement.summary)}</p>${improvement.testSummary ? `<small>${escapeHtml(improvement.testSummary)}</small>` : ''}${actions}</article>`;
}

function eventRow(event) {
  return `<div class="event-row"><span>${event.sequence}</span><b>${escapeHtml(event.eventType)}</b><code>${escapeHtml(event.subjectId)}</code><small>${formatTime(event.timestamp)}</small></div>`;
}

function metric(title, value, caption) { return `<article><small>${title}</small><strong>${value}</strong><p>${caption}</p></article>`; }
function empty(message) { return `<p class="empty">${escapeHtml(message)}</p>`; }

async function dispatchCapability(capability, outcome = null) {
  const metadata = state.status.capabilities.find((item) => item.enabled && item.capability === capability);
  if (!metadata) throw new Error(`${capability} has no enabled worker`);
  const dataClass = metadata.dataClasses[0];
  const result = await post('/api/tasks', { capability, dataClass, requestedMode: state.status.autonomyMode, priority: 'high', requestedOutcome: outcome || `Run ${capability}`, initialMessage: outcome || `Run ${capability}`, idempotencyKey: `ui-${capability}-${Date.now()}` });
  notify(`Dispatched ${capability}`);
  await refresh();
  return result.task;
}

async function loadConversation() {
  const id = $('conversation-select').value;
  $('conversation-title').disabled = Boolean(id);
  if (!id) { $('conversation-messages').innerHTML = empty('Start an assignment thread to preserve context while you are away.'); return; }
  const data = await api(`/api/conversations/${id}/messages`);
  $('conversation-messages').innerHTML = data.messages.map((message) => `<div class="message ${escapeHtml(message.role)}"><b>${escapeHtml(message.role)}${message.requiresResponse ? ' · response requested' : ''}</b><p>${escapeHtml(message.content)}</p><small>${formatTime(message.createdAt)}</small></div>`).join('') || empty('No messages.');
}

function showView(name) {
  state.activeView = name;
  document.querySelectorAll('[data-page]').forEach((page) => page.classList.toggle('active', page.dataset.page === name));
  document.querySelectorAll('nav [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  const subtitles = { overview: 'Live command, recovery, and assignment operations.', tasks: 'Dispatch, retry, cancel, and answer durable work.', workers: 'Control each isolated execution process.', connections: 'See what is live, degraded, staged, or blocked.', assignments: 'Keep context and conversation available while you are away.', improvements: 'Review self-improvement candidates before activation.', diagnostics: 'Trace every action through the durable event ledger.' };
  $('page-subtitle').textContent = subtitles[name] || subtitles.overview;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncDataClass() {
  const capability = $('task-capability').value;
  const metadata = state.status?.capabilities.find((item) => item.capability === capability);
  if (!metadata) return;
  const select = $('task-data-class');
  [...select.options].forEach((option) => { option.disabled = !metadata.dataClasses.includes(option.value); });
  if (!metadata.dataClasses.includes(select.value)) select.value = metadata.dataClasses[0];
}

document.querySelector('nav').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) showView(button.dataset.view); });
document.body.addEventListener('click', async (event) => {
  const refreshButton = event.target.closest('[data-refresh]');
  if (refreshButton) return refresh(false);
  const quick = event.target.closest('[data-quick-capability]');
  if (quick) return runAction(quick, () => dispatchCapability(quick.dataset.quickCapability));
  const taskButton = event.target.closest('[data-task-action]');
  if (taskButton) return runAction(taskButton, async () => {
    const { taskAction: action, taskId: id } = taskButton.dataset;
    if (action === 'input') {
      const content = window.prompt('Your response for Mahoraga:');
      if (!content) return;
      await post(`/api/tasks/${id}/input`, { content });
    } else await post(`/api/tasks/${id}/${action}`);
    notify(`Task ${action} accepted`); await refresh();
  });
  const workerButton = event.target.closest('[data-worker-action]');
  if (workerButton) return runAction(workerButton, async () => { await post(`/api/workers/${workerButton.dataset.workerId}/${workerButton.dataset.workerAction}`); notify(`Worker ${workerButton.dataset.workerAction} accepted`); await refresh(); });
  const decision = event.target.closest('[data-improvement-decision]');
  if (decision) return runAction(decision, async () => { const id = decision.dataset.improvementId; await post(`/api/improvements/${id}/decision`, { decision: decision.dataset.improvementDecision }, { 'x-mahoraga-approval': id }); notify(`Improvement ${decision.dataset.improvementDecision}`); await refresh(); });
});

$('health-task').addEventListener('click', (event) => runAction(event.currentTarget, () => dispatchCapability('system.health', 'Verify the full local runtime is responsive')));
$('task-capability').addEventListener('change', syncDataClass);
$('task-form').addEventListener('submit', (event) => { event.preventDefault(); runAction(event.submitter, async () => { const capability = $('task-capability').value; const outcome = $('task-outcome').value.trim() || `Run ${capability}`; await post('/api/tasks', { capability, dataClass: $('task-data-class').value, requestedMode: state.status.autonomyMode, priority: $('task-priority').value, requestedOutcome: outcome, initialMessage: outcome, idempotencyKey: `ui-command-${Date.now()}` }); $('task-outcome').value = ''; notify(`Dispatched ${capability}`); await refresh(); }); });
$('conversation-select').addEventListener('change', loadConversation);
$('conversation-form').addEventListener('submit', (event) => { event.preventDefault(); runAction(event.submitter, async () => { const select = $('conversation-select'); const content = $('conversation-message').value.trim(); if (!content) return; if (select.value) await post(`/api/conversations/${select.value}/messages`, { content, role: 'user' }); else { const title = $('conversation-title').value.trim() || content.slice(0, 80); const created = await post('/api/conversations', { title, initialMessage: content }); select.dataset.next = created.conversation.id; } $('conversation-message').value = ''; await refresh(); notify('Assignment discourse saved'); }); });
$('improvement-form').addEventListener('submit', (event) => { event.preventDefault(); runAction(event.submitter, async () => { await post('/api/improvements', { title: $('improvement-title').value.trim(), summary: $('improvement-summary').value.trim() }); event.currentTarget.reset(); notify('Improvement candidate recorded'); await refresh(); }); });

async function runAction(button, action) { if (button) button.disabled = true; try { await action(); } catch (error) { notify(error.message, 'error'); } finally { if (button) button.disabled = false; } }
function notify(message, kind = 'success') { const toast = $('toast'); toast.textContent = message; toast.className = kind; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.className = ''; }, 3500); }
function formatTime(value) { return value ? new Date(value).toLocaleString() : 'never'; }
function label(value) { return String(value).split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' '); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

showView('overview');
refresh(false);
setInterval(() => refresh(true), 5000);

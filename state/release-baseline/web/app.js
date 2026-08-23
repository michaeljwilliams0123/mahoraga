const $ = (id) => document.getElementById(id);
const state = { status: null, coordination: null, tasks: [], conversations: [], improvements: [], diagnostics: null, messages: [], activeConversation: readConversationHash(), activeView: 'chat', sending: false };

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const post = (url, body = {}, headers = {}) => api(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function refresh(quiet = true) {
  try {
    const [status, coordination, taskData, conversationData, improvementData, diagnostics] = await Promise.all([
      api('/api/status'), api('/api/coordination'), api('/api/tasks'), api('/api/conversations'), api('/api/improvements'), api('/api/diagnostics'),
    ]);
    Object.assign(state, { status, coordination, tasks: taskData.tasks, conversations: conversationData.conversations, improvements: improvementData.improvements, diagnostics });
    if (state.activeConversation && !state.conversations.some((item) => item.id === state.activeConversation)) state.activeConversation = null;
    state.messages = state.activeConversation ? (await api(`/api/conversations/${state.activeConversation}/messages`)).messages : [];
    render();
    if (!quiet) notify('Workspace refreshed');
  } catch (error) {
    $('runtime-state').textContent = 'Runtime unavailable';
    notify(error.message, 'error');
  }
}

function render() {
  renderRuntime(); renderSidebar(); renderChat(); renderCapabilities(); renderTasks(); renderCoordination(); renderWorkers(); renderCapabilityRegistry(); renderConnections(); renderImprovements(); renderDiagnostics();
}

function renderRuntime() {
  const healthy = state.status.workers.filter((worker) => ['healthy', 'busy'].includes(worker.status)).length;
  $('runtime-state').textContent = `Runtime healthy · ${healthy}/${state.status.workers.length}`;
  $('runtime-version').textContent = state.status.versions.controlCenter;
  $('autonomy-pill').textContent = state.status.autonomyMode.toUpperCase();
  $('worker-pill').textContent = `${healthy} workers`;
  $('metric-workers').textContent = healthy;
  $('metric-active').textContent = state.status.taskCounts.queued + state.status.taskCounts.running + state.status.taskCounts.verifying;
  $('metric-waiting').textContent = state.status.taskCounts.waiting_for_user + state.status.improvementsAwaitingUser;
  $('metric-failed').textContent = state.status.taskCounts.failed;
}

function renderSidebar() {
  const query = $('conversation-search').value.trim().toLowerCase();
  const conversations = state.conversations.filter((item) => !query || item.title.toLowerCase().includes(query));
  $('conversation-list').innerHTML = conversations.length ? conversations.map((item) => `<button class="conversation-item ${item.id === state.activeConversation ? 'active' : ''}" data-conversation-id="${item.id}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</button>`).join('') : '<p class="muted">No matching chats.</p>';
}

function renderChat() {
  const conversation = state.conversations.find((item) => item.id === state.activeConversation);
  $('chat-title').textContent = conversation?.title || 'New chat';
  $('chat-subtitle').textContent = conversation ? `Updated ${formatTime(conversation.updatedAt)}` : 'Durable local conversation';
  $('welcome').classList.toggle('hidden', state.messages.length > 0 || Boolean(conversation));
  const pending = state.activeConversation && state.tasks.some((task) => task.conversationId === state.activeConversation && ['queued', 'claimed', 'running', 'verifying'].includes(task.status));
  $('chat-messages').innerHTML = state.messages.map(messageHtml).join('') + (pending ? '<div class="message-row assistant"><span class="avatar">M</span><div class="message-body"><div class="typing"><i></i><i></i><i></i></div></div></div>' : '');
  $('composer-status').textContent = pending ? 'Mahoraga is working...' : 'Durable conversation';
  $('send-message').disabled = state.sending;
  requestAnimationFrame(() => { const scroll = $('chat-scroll'); if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 500 || state.sending) scroll.scrollTop = scroll.scrollHeight; });
}

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : message.role === 'system' ? 'system' : 'assistant';
  if (role === 'user') return `<div class="message-row user"><div class="message-body"><p>${escapeHtml(message.content)}</p><span class="message-meta">${formatTime(message.createdAt)}</span></div></div>`;
  return `<div class="message-row ${role}"><span class="avatar">${role === 'system' ? '!' : 'M'}</span><div class="message-body"><p>${escapeHtml(message.content)}</p><span class="message-meta">${role === 'system' ? 'System' : 'Mahoraga'} · ${formatTime(message.createdAt)}</span></div></div>`;
}

function renderCapabilities() {
  const enabled = state.status.capabilities.filter((item) => item.enabled);
  const tool = $('chat-tool'); const selectedTool = tool.value || 'auto';
  tool.innerHTML = '<option value="auto">Auto</option>' + enabled.map((item) => `<option value="${escapeHtml(item.capability)}">${escapeHtml(toolLabel(item.capability))}</option>`).join('');
  tool.value = enabled.some((item) => item.capability === selectedTool) ? selectedTool : 'auto';
  const task = $('task-capability'); const selectedTask = task.value;
  task.innerHTML = enabled.map((item) => `<option value="${escapeHtml(item.capability)}">${escapeHtml(item.capability)} · ${escapeHtml(item.workerLabel)}</option>`).join('');
  if (enabled.some((item) => item.capability === selectedTask)) task.value = selectedTask;
  syncDataClass();
}

function renderTasks() { $('task-list').innerHTML = state.tasks.length ? state.tasks.slice(0, 50).map(taskCard).join('') : '<p class="muted">No tasks yet.</p>'; }
function taskCard(task) {
  const retry = ['failed', 'waiting', 'cancelled'].includes(task.status) ? `<button data-task-action="retry" data-task-id="${task.id}">Retry</button>` : '';
  const cancel = ['queued', 'claimed', 'running', 'verifying', 'waiting', 'waiting_for_user'].includes(task.status) ? `<button class="danger" data-task-action="cancel" data-task-id="${task.id}">Cancel</button>` : '';
  const input = task.status === 'waiting_for_user' ? `<button data-task-action="input" data-task-id="${task.id}">Respond</button>` : '';
  return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(task.priority)} · ${escapeHtml(task.executionPlane)}</p><h3>${escapeHtml(task.capability)}</h3></div><span class="badge ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></div><p>${escapeHtml(task.requestedOutcome || task.capability)}</p><small>${escapeHtml(task.id)} · attempts ${task.attemptCount}/${task.maximumAttempts} · ${formatTime(task.updatedAt)}</small>${task.errorCode ? `<p class="error-text">${escapeHtml(task.errorCode)}</p>` : ''}<div class="card-actions">${input}${retry}${cancel}</div></article>`;
}

function renderCoordination() {
  const coordination = state.coordination;
  if (!coordination) return;
  $('coord-total').textContent = coordination.counts.total;
  $('coord-ready').textContent = coordination.counts.ready;
  $('coord-active').textContent = coordination.counts.returned + coordination.counts.validating;
  $('coord-validated').textContent = coordination.counts.validated;
  $('coord-state').textContent = coordination.state;
  $('coord-state').className = `badge ${coordination.state === 'validated' ? 'ready' : coordination.state === 'return-detected' ? 'verifying' : 'queued'}`;
  $('coord-updated').textContent = coordination.latestActivityAt ? `Latest activity ${formatTime(coordination.latestActivityAt)}` : 'No mailbox activity yet';
  $('coord-policy').textContent = coordination.privacy.chatAccess === false && coordination.privacy.credentialsIncluded === false
    ? 'Repository metadata only · no chats, credentials, browser data, personal files, or model output.'
    : 'Coordination privacy policy is not in its expected fail-closed state.';
  $('coordination-list').innerHTML = coordination.assignments.length
    ? coordination.assignments.map(coordinationCard).join('')
    : '<p class="muted">No coordination assignments have been imported.</p>';
}

function coordinationCard(assignment) {
  const status = assignment.status.toLowerCase();
  const pathSummary = assignment.allowedPaths.length ? assignment.allowedPaths.join(', ') : 'No implementation paths';
  const returnEvidence = assignment.returnCommit
    ? `<small>Return ${escapeHtml(assignment.returnCommit.slice(0, 12))}${assignment.verificationState ? ` · verification ${escapeHtml(assignment.verificationState)}` : ''}</small>`
    : `<small>Expected base ${escapeHtml(assignment.expectedBaseCommit.slice(0, 12))} · checked ${formatTime(assignment.lastObservation)}</small>`;
  return `<article class="control-card coordination-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(assignment.source)} · ${escapeHtml(assignment.taskArea)}</p><h3>${escapeHtml(assignment.title)}</h3></div><span class="badge ${escapeHtml(status)}">${escapeHtml(assignment.status)}</span></div><p>${escapeHtml(assignment.expectedTask)}</p><div class="assignment-detail"><span>Authority</span><b>Authorized bidirectional controller</b><span>Allowed paths</span><b>${escapeHtml(pathSummary)}</b></div>${returnEvidence}<div class="card-actions"><button data-copy-branch="${escapeHtml(assignment.returnBranch)}">Copy return branch</button></div></article>`;
}

function renderWorkers() { $('worker-list').innerHTML = state.status.workers.map((worker) => `<article class="control-card"><div class="card-head"><div><p class="eyebrow">PID ${worker.pid}</p><h3>${escapeHtml(worker.label)}</h3></div><span class="badge ${escapeHtml(worker.status)}">${escapeHtml(worker.status)}</span></div><p>${worker.capabilities.map(escapeHtml).join(' · ')}</p><small>Heartbeat ${formatTime(worker.lastHeartbeatAt)} · Restarts ${worker.restartCount}</small><div class="card-actions"><button data-worker-action="probe" data-worker-id="${worker.workerId}">Run probe</button><button class="danger" data-worker-action="restart" data-worker-id="${worker.workerId}">Restart</button></div></article>`).join(''); }

function renderCapabilityRegistry() {
  $('capability-list').innerHTML = state.status.capabilities.map((item) => {
    const runnable = item.enabled && !['crashed', 'hung', 'quarantined', 'stopped', 'disabled'].includes(item.availability);
    const fallbacks = item.fallbackWorkerIds.length ? item.fallbackWorkerIds.map(label).join(', ') : 'None';
    return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(item.interfaceType)} · ${escapeHtml(item.costClass)}</p><h3>${escapeHtml(item.capability)}</h3></div><span class="badge ${escapeHtml(item.availability)}">${escapeHtml(item.availability)}</span></div><p>${escapeHtml(item.workerLabel)} · ${escapeHtml(item.permissionClass)}</p><small>Reliability ${item.reliability}% · ${item.requiresAttendedDesktop ? 'Attended desktop required' : 'Can run unattended'} · Fallback: ${escapeHtml(fallbacks)}</small><div class="card-actions"><button data-capability-action="${escapeHtml(item.capability)}" ${runnable ? '' : 'disabled'}>Run capability</button></div></article>`;
  }).join('');
}

function renderConnections() { $('connection-list').innerHTML = state.status.connections.map((connection) => { const probe = connection.capabilities.find((capability) => state.status.capabilities.some((item) => item.enabled && item.capability === capability)); return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(connection.endpointClass)}</p><h3>${escapeHtml(label(connection.id))}</h3></div><span class="badge ${connection.error ? 'disabled' : 'ready'}">${escapeHtml(connection.state)}</span></div><p>${escapeHtml(connection.notes || '')}</p><small>Auth: ${escapeHtml(connection.authenticationState)}${connection.lastSuccessfulCheck ? ` · Checked ${formatTime(connection.lastSuccessfulCheck)}` : ''}</small>${connection.error ? `<p class="error-text">${escapeHtml(connection.error)}</p>` : ''}<div class="card-actions">${probe ? `<button data-capability-action="${escapeHtml(probe)}">Run ${escapeHtml(probe)}</button>` : '<button disabled>No local probe</button>'}</div></article>`; }).join(''); }

function renderImprovements() { $('improvement-list').innerHTML = state.improvements.length ? state.improvements.map((item) => { const actions = item.status === 'proposed' ? `<div class="card-actions"><button data-improvement-decision="approved" data-improvement-id="${item.id}">Approve</button><button class="danger" data-improvement-decision="rejected" data-improvement-id="${item.id}">Reject</button></div>` : ''; return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${formatTime(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3></div><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.summary)}</p>${actions}</article>`; }).join('') : '<p class="muted">No improvement candidates.</p>'; }
function renderDiagnostics() { $('event-list').innerHTML = state.diagnostics.events.map((event) => `<div class="event-row"><span>${event.sequence}</span><b>${escapeHtml(event.eventType)}</b><code>${escapeHtml(event.subjectId)}</code><small>${formatTime(event.timestamp)}</small></div>`).join(''); }

async function sendChat(content, forcedCapability = null) {
  content = content.trim(); if (!content || state.sending) return;
  state.sending = true; $('chat-input').value = ''; resizeComposer(); renderChat();
  try {
    let conversationId = state.activeConversation;
    if (!conversationId) {
      const created = await post('/api/conversations', { title: content.slice(0, 72), initialMessage: content });
      conversationId = created.conversation.id; state.activeConversation = conversationId; writeConversationHash(conversationId);
    } else await post(`/api/conversations/${conversationId}/messages`, { content, role: 'user' });
    const selected = forcedCapability || $('chat-tool').value;
    const capability = selected === 'auto' ? autoRoute(content) : selected;
    const metadata = state.status.capabilities.find((item) => item.enabled && item.capability === capability);
    if (!metadata) throw new Error(`${capability} has no enabled worker`);
    await post('/api/tasks', { capability, dataClass: metadata.dataClasses[0], requestedMode: state.status.autonomyMode, priority: 'high', requestedOutcome: content, conversationId, idempotencyKey: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    await refresh();
  } catch (error) { notify(error.message, 'error'); }
  finally { state.sending = false; renderChat(); $('chat-input').focus(); }
}

function autoRoute(content) {
  const text = content.toLowerCase();
  if (/browser|chrome|web page|website/.test(text)) return /test|verify|smoke|open/.test(text) ? 'browser.smoke' : 'browser.status';
  if (/repository|repo|github|\bgit\b|source code/.test(text)) return 'repository.inspect';
  if (/repair|recover|recovery|self-heal|baseline/.test(text)) return 'repair.scan';
  if (/manifest|configuration|config/.test(text)) return 'manifest.validate';
  if (/health|runtime|system status|working|online/.test(text)) return 'system.health';
  return 'assistant.respond';
}

function showView(name) { state.activeView = name; document.querySelectorAll('[data-page]').forEach((page) => page.classList.toggle('active', page.dataset.page === name)); document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name)); }
function selectConversation(id) { state.activeConversation = id; writeConversationHash(id); showView('chat'); refresh(); }
function newChat() { state.activeConversation = null; state.messages = []; writeConversationHash(null); showView('chat'); renderChat(); $('chat-input').focus(); }
function syncDataClass() { const metadata = state.status?.capabilities.find((item) => item.capability === $('task-capability').value); if (!metadata) return; const select = $('task-data-class'); [...select.options].forEach((option) => { option.disabled = !metadata.dataClasses.includes(option.value); }); if (!metadata.dataClasses.includes(select.value)) select.value = metadata.dataClasses[0]; }

$('new-chat').addEventListener('click', newChat);
$('conversation-search').addEventListener('input', renderSidebar);
$('conversation-list').addEventListener('click', (event) => { const button = event.target.closest('[data-conversation-id]'); if (button) selectConversation(button.dataset.conversationId); });
document.querySelector('.workspace-nav').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) showView(button.dataset.view); });
$('chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendChat($('chat-input').value); });
$('chat-input').addEventListener('input', resizeComposer);
$('chat-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('chat-form').requestSubmit(); } });
document.querySelector('.suggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-suggestion]'); if (button) sendChat(button.dataset.suggestion, button.dataset.capability); });
$('task-capability').addEventListener('change', syncDataClass);
$('task-form').addEventListener('submit', (event) => runForm(event, async () => { const capability = $('task-capability').value; const outcome = $('task-outcome').value.trim() || `Run ${capability}`; await dispatch(capability, outcome, $('task-priority').value, $('task-data-class').value); $('task-outcome').value = ''; }));
$('improvement-form').addEventListener('submit', (event) => { const form = event.currentTarget; runForm(event, async () => { await post('/api/improvements', { title: $('improvement-title').value.trim(), summary: $('improvement-summary').value.trim() }); form.reset(); notify('Improvement candidate recorded'); await refresh(); }); });

document.body.addEventListener('click', async (event) => {
  const refreshButton = event.target.closest('[data-refresh]'); if (refreshButton) return runButton(refreshButton, () => refresh(false));
  const capabilityButton = event.target.closest('[data-capability-action]'); if (capabilityButton) return runButton(capabilityButton, () => dispatch(capabilityButton.dataset.capabilityAction, `Run ${capabilityButton.dataset.capabilityAction}`));
  const taskButton = event.target.closest('[data-task-action]'); if (taskButton) return runButton(taskButton, async () => { const { taskAction: action, taskId: id } = taskButton.dataset; if (action === 'input') { const content = window.prompt('Your response for Mahoraga:'); if (!content) return; await post(`/api/tasks/${id}/input`, { content }); } else await post(`/api/tasks/${id}/${action}`); notify(`Task ${action} accepted`); await refresh(); });
  const workerButton = event.target.closest('[data-worker-action]'); if (workerButton) return runButton(workerButton, async () => { await post(`/api/workers/${workerButton.dataset.workerId}/${workerButton.dataset.workerAction}`); notify(`Worker ${workerButton.dataset.workerAction} accepted`); await refresh(); });
  const decision = event.target.closest('[data-improvement-decision]'); if (decision) return runButton(decision, async () => { const id = decision.dataset.improvementId; await post(`/api/improvements/${id}/decision`, { decision: decision.dataset.improvementDecision }, { 'x-mahoraga-approval': id }); notify(`Improvement ${decision.dataset.improvementDecision}`); await refresh(); });
  const copyBranch = event.target.closest('[data-copy-branch]'); if (copyBranch) return runButton(copyBranch, async () => { await navigator.clipboard.writeText(copyBranch.dataset.copyBranch); notify('Return branch copied'); });
});

async function dispatch(capability, outcome, priority = 'high', dataClass = null) { const metadata = state.status.capabilities.find((item) => item.enabled && item.capability === capability); if (!metadata) throw new Error(`${capability} has no enabled worker`); await post('/api/tasks', { capability, dataClass: dataClass || metadata.dataClasses[0], requestedMode: state.status.autonomyMode, priority, requestedOutcome: outcome, initialMessage: outcome, idempotencyKey: `workspace-${Date.now()}-${Math.random().toString(16).slice(2)}` }); notify(`Dispatched ${capability}`); await refresh(); }
async function runButton(button, action) { button.disabled = true; try { await action(); } catch (error) { notify(error.message, 'error'); } finally { button.disabled = false; } }
async function runForm(event, action) { event.preventDefault(); return runButton(event.submitter, action); }
function resizeComposer() { const input = $('chat-input'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; }
function notify(message, kind = 'success') { const toast = $('toast'); toast.textContent = message; toast.className = `show ${kind === 'error' ? 'error' : ''}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.className = ''; }, 3500); }
function readConversationHash() { return /^#con-[a-f0-9-]+$/.test(location.hash) ? location.hash.slice(1) : null; }
function writeConversationHash(id) { history.replaceState(null, '', id ? `#${id}` : location.pathname); }
function toolLabel(capability) { return ({ 'assistant.respond': 'Conversation', 'system.health': 'System health', 'manifest.validate': 'Validate manifest', 'repository.status': 'Repository status', 'repository.inspect': 'Inspect repository', 'repository.history': 'Repository history', 'repository.verify': 'Verify repository', 'repair.scan': 'Scan recovery', 'repair.apply': 'Apply recovery', 'browser.status': 'Browser status', 'browser.smoke': 'Browser smoke' })[capability] || capability; }
function formatTime(value) { return value ? new Date(value).toLocaleString() : 'never'; }
function label(value) { return String(value).split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' '); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

showView('chat'); refresh(false); setInterval(() => refresh(true), 2500);

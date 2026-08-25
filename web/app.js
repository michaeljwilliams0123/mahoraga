const $ = (id) => document.getElementById(id);
const VIEWS = new Set(['chat', 'tasks', 'coordination', 'workers', 'capabilities', 'connections', 'improvements', 'diagnostics']);
const CONTROL_CENTER_API_PROTOCOL = 1;
const SECTION_REQUESTS = [
  ['coordination', '/api/coordination', (value) => value],
  ['tasks', '/api/tasks', (value) => value.tasks ?? []],
  ['conversations', '/api/conversations', (value) => value.conversations ?? []],
  ['improvements', '/api/improvements', (value) => value.improvements ?? []],
  ['diagnostics', '/api/diagnostics', (value) => value],
];
const RUNTIME_ACTIONS = '.suggestions button, #chat-input, #chat-tool, #send-message, #attach-files, #attachment-input, #task-form input, #task-form select, #task-form button, #improvement-form input, #improvement-form button, [data-capability-action], [data-task-action], [data-worker-action], [data-improvement-decision]';
const state = { status: null, coordination: null, tasks: [], conversations: [], improvements: [], diagnostics: { workers: [], events: [] }, messages: [], pendingAttachments: [], uploading: false, queuedFiles: 0, uploadQueue: Promise.resolve(), sectionErrors: {}, compatible: false, activeConversation: readConversationHash(), activeView: readView(), sending: false, refreshing: false };

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
const post = (url, body = {}, headers = {}) => {
  requireCompatibleRuntime();
  return api(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
};

function requireCompatibleRuntime() {
  if (!state.compatible) throw new Error('Runtime update required. Restart Mahoraga after activating the matching release.');
}

function assertCompatibleStatus(status) {
  const contract = status?.controlCenterApi;
  if (contract?.protocolVersion !== CONTROL_CENTER_API_PROTOCOL || contract.runtimeVersion !== status.version || contract.controlCenterVersion !== status.versions?.controlCenter) throw new Error('Runtime update required. Restart Mahoraga after activating the matching release.');
}

async function refresh(quiet = true) {
  if (state.refreshing) return;
  state.refreshing = true;
  const wasCompatible = state.compatible;
  try {
    const status = await api('/api/status');
    assertCompatibleStatus(status);
    state.compatible = true;
    state.status = status;
    const results = await Promise.allSettled(SECTION_REQUESTS.map(([, url]) => api(url)));
    const sectionErrors = {};
    results.forEach((result, index) => {
      const [name, , select] = SECTION_REQUESTS[index];
      if (result.status === 'fulfilled') state[name] = select(result.value);
      else sectionErrors[name] = result.reason.message;
    });
    if (state.activeConversation && !state.conversations.some((item) => item.id === state.activeConversation)) state.activeConversation = null;
    if (state.activeConversation) {
      try { state.messages = (await api(`/api/conversations/${state.activeConversation}/messages`)).messages ?? []; }
      catch (error) { sectionErrors.messages = error.message; }
    } else state.messages = [];
    state.sectionErrors = sectionErrors;
    document.querySelector('.status-dot').classList.remove('offline');
    render();
    if (!quiet) {
      const unavailable = Object.keys(sectionErrors);
      notify(unavailable.length ? `Runtime healthy; unavailable: ${unavailable.join(', ')}` : 'Workspace refreshed', unavailable.length ? 'error' : 'success');
    }
  } catch (error) {
    state.compatible = false;
    state.status = null;
    state.sectionErrors = { runtime: error.message };
    $('runtime-state').textContent = error.status === 401 ? 'Local session required' : error.message.includes('update required') ? 'Runtime update required' : 'Runtime unavailable';
    $('runtime-version').textContent = '--';
    $('worker-pill').textContent = '0 workers';
    $('composer-status').textContent = error.status === 401 ? 'Run scripts/open-control-center.ps1' : 'Runtime connection required';
    document.querySelector('.status-dot').classList.add('offline');
    setInteractionsEnabled(false);
    if (!quiet || wasCompatible) notify(error.message, 'error');
  } finally { state.refreshing = false; }
}

function setInteractionsEnabled(enabled) {
  document.querySelectorAll(RUNTIME_ACTIONS).forEach((element) => {
    if (!enabled) {
      if (!element.disabled) element.dataset.runtimeGate = 'true';
      element.disabled = true;
    } else if (element.dataset.runtimeGate === 'true') {
      element.disabled = false;
      delete element.dataset.runtimeGate;
    }
  });
}

function render() {
  renderRuntime(); renderSidebar(); renderChat(); renderCapabilities(); renderTasks(); renderCoordination(); renderGithubAssurance(); renderWorkers(); renderCapabilityRegistry(); renderExpertSkills(); renderConnections(); renderImprovements(); renderDiagnostics(); setInteractionsEnabled(state.compatible);
}

function renderRuntime() {
  const healthy = state.status.workers.filter((worker) => ['healthy', 'busy'].includes(worker.status)).length;
  $('runtime-state').textContent = `Runtime healthy · ${healthy}/${state.status.workers.length}`;
  if (Object.keys(state.sectionErrors).length > 0) $('runtime-state').textContent += ' · degraded';
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
  renderPendingAttachments();
  $('composer-status').textContent = state.queuedFiles ? `Securing ${state.queuedFiles} file${state.queuedFiles === 1 ? '' : 's'} locally...` : pending ? 'Mahoraga is working...' : state.pendingAttachments.length ? `${state.pendingAttachments.length} file${state.pendingAttachments.length === 1 ? '' : 's'} ready` : 'Durable conversation';
  $('send-message').disabled = state.sending || state.queuedFiles > 0;
  requestAnimationFrame(() => { const scroll = $('chat-scroll'); if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 500 || state.sending) scroll.scrollTop = scroll.scrollHeight; });
}

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : message.role === 'system' ? 'system' : 'assistant';
  const attachments = messageAttachmentsHtml(message.attachments ?? []);
  if (role === 'user') return `<div class="message-row user"><div class="message-body"><p>${escapeHtml(message.content)}</p>${attachments}<span class="message-meta">${formatTime(message.createdAt)}</span></div></div>`;
  return `<div class="message-row ${role}"><span class="avatar">${role === 'system' ? '!' : 'M'}</span><div class="message-body"><p>${escapeHtml(message.content)}</p>${attachments}<span class="message-meta">${role === 'system' ? 'System' : 'Mahoraga'} · ${formatTime(message.createdAt)}</span></div></div>`;
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
  const runner = coordination.runner;
  $('coord-runner').textContent = runner.configured
    ? `Outbound runner configured${runner.lastRunAt ? ` · last poll ${formatTime(runner.lastRunAt)}` : ' · awaiting first recorded poll'}${runner.lastOutcome?.status ? ` · ${runner.lastOutcome.status}` : ''}`
    : 'Outbound runner is not configured in this checkout.';
  $('coordination-list').innerHTML = coordination.assignments.length
    ? coordination.assignments.map(coordinationCard).join('')
    : '<p class="muted">No coordination assignments have been imported.</p>';
}

function renderGithubAssurance() {
  const coordination = state.coordination;
  if (!coordination) return;
  const authority = coordination.authority;
  const automation = coordination.automation;
  const lease = authority.integration.activeLease;
  const cards = [
    ['Controller authority', authority.equalPrimaryCapability && authority.integration.concurrentHolders === 1 ? 'Equal · lease guarded' : 'Review needed', 'Local and cloud Primary have equal capability; one bounded lease coordinates integration.'],
    ['Integration lease', lease ? `${label(lease.controllerId)} · held` : 'Available', lease ? `Expires ${formatTime(lease.expiresAt)} · ${lease.paths.length} path area${lease.paths.length === 1 ? '' : 's'}.` : 'No Primary currently holds the persisted integration lease.'],
    ['Action supply chain', automation.actionReferences === 'immutable-commit-sha' ? 'SHA pinned' : 'Review needed', 'Remote GitHub Actions are fixed to immutable commit identifiers.'],
    ['Model spend boundary', automation.modelInvocation === 'explicit-task-only' ? 'Explicit only' : 'Review needed', 'CI, security scans, dependency updates, and idle polling do not invoke a model.'],
    ['Network boundary', coordination.transport.outboundOnly ? 'Outbound only' : 'Review needed', 'The Windows runner polls GitHub; no inbound tunnel or public localhost listener is required.'],
  ];
  $('assurance-updated').textContent = `Policy snapshot ${formatTime(coordination.generatedAt)}`;
  $('github-assurance-list').innerHTML = cards.map(([title, value, summary]) => `<article><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(summary)}</p></article>`).join('');
}

function coordinationCard(assignment) {
  const status = assignment.status.toLowerCase();
  const verification = assignment.verificationState ? ` · verification ${escapeHtml(assignment.verificationState)}` : '';
  return `<article class="control-card coordination-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(assignment.source)} · ${escapeHtml(assignment.taskArea)}</p><h3>${escapeHtml(assignment.assignmentId)}</h3></div><span class="badge ${escapeHtml(status)}">${escapeHtml(assignment.status)}</span></div><p>Bounded repository assignment with a verified return branch.</p><div class="assignment-detail"><span>Authority</span><b>Primary validates and integrates the Secondary return</b><span>Updated</span><b>${formatTime(assignment.updatedAt)}</b></div><small>${escapeHtml(assignment.returnBranch)}${verification}</small><div class="card-actions"><button data-copy-branch="${escapeHtml(assignment.returnBranch)}">Copy return branch</button></div></article>`;
}

function renderWorkers() { $('worker-list').innerHTML = state.status.workers.map((worker) => `<article class="control-card"><div class="card-head"><div><p class="eyebrow">PID ${worker.pid}</p><h3>${escapeHtml(worker.label)}</h3></div><span class="badge ${escapeHtml(worker.status)}">${escapeHtml(worker.status)}</span></div><p>${worker.capabilities.map(escapeHtml).join(' · ')}</p><small>Heartbeat ${formatTime(worker.lastHeartbeatAt)} · Restarts ${worker.restartCount}</small><div class="card-actions"><button data-worker-action="probe" data-worker-id="${worker.workerId}">Run probe</button><button class="danger" data-worker-action="restart" data-worker-id="${worker.workerId}">Restart</button></div></article>`).join(''); }

function renderCapabilityRegistry() {
  $('capability-list').innerHTML = state.status.capabilities.map((item) => {
    const runnable = item.enabled && !['crashed', 'hung', 'quarantined', 'stopped', 'disabled'].includes(item.availability);
    const fallbacks = item.fallbackWorkerIds.length ? item.fallbackWorkerIds.map(label).join(', ') : 'None';
    return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(item.interfaceType)} · ${escapeHtml(item.costClass)}</p><h3>${escapeHtml(item.capability)}</h3></div><span class="badge ${escapeHtml(item.availability)}">${escapeHtml(item.availability)}</span></div><p>${escapeHtml(item.workerLabel)} · ${escapeHtml(item.permissionClass)}</p><small>Reliability ${item.reliability}% · ${item.requiresAttendedDesktop ? 'Attended desktop required' : 'Can run unattended'} · Fallback: ${escapeHtml(fallbacks)}</small><div class="card-actions"><button data-capability-action="${escapeHtml(item.capability)}" ${runnable ? '' : 'disabled'}>Run capability</button></div></article>`;
  }).join('');
}

function renderExpertSkills() {
  const skills = state.status.expertSkills ?? [];
  $('expert-skill-list').innerHTML = skills.length ? skills.map((item) => `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(item.domain)}</p><h3>${escapeHtml(item.title)}</h3></div><span class="badge ready">evidence-led</span></div><p>${escapeHtml(item.summary)}</p><small>${escapeHtml((item.activationTerms ?? []).join(' · '))}</small><div class="card-actions"><button disabled>${item.credentialClaim === false ? 'Method profile · no credential claim' : 'Review profile'}</button></div></article>`).join('') : '<p class="muted">No expert method profiles are loaded.</p>';
}

function renderConnections() { $('connection-list').innerHTML = state.status.connections.map((connection) => { const probe = connection.capabilities.find((capability) => state.status.capabilities.some((item) => item.enabled && item.capability === capability)); return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${escapeHtml(connection.endpointClass)}</p><h3>${escapeHtml(label(connection.id))}</h3></div><span class="badge ${connection.error ? 'disabled' : 'ready'}">${escapeHtml(connection.state)}</span></div><p>${escapeHtml(connection.notes || '')}</p><small>Auth: ${escapeHtml(connection.authenticationState)}${connection.lastSuccessfulCheck ? ` · Checked ${formatTime(connection.lastSuccessfulCheck)}` : ''}</small>${connection.error ? `<p class="error-text">${escapeHtml(connection.error)}</p>` : ''}<div class="card-actions">${probe ? `<button data-capability-action="${escapeHtml(probe)}">Run ${escapeHtml(probe)}</button>` : '<button disabled>No local probe</button>'}</div></article>`; }).join(''); }

function renderImprovements() { $('improvement-list').innerHTML = state.improvements.length ? state.improvements.map((item) => { const actions = item.status === 'proposed' ? `<div class="card-actions"><button data-improvement-decision="approved" data-improvement-id="${item.id}">Approve</button><button class="danger" data-improvement-decision="rejected" data-improvement-id="${item.id}">Reject</button></div>` : ''; return `<article class="control-card"><div class="card-head"><div><p class="eyebrow">${formatTime(item.createdAt)}</p><h3>${escapeHtml(item.title)}</h3></div><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(item.summary)}</p>${actions}</article>`; }).join('') : '<p class="muted">No improvement candidates.</p>'; }
function renderDiagnostics() { $('event-list').innerHTML = state.diagnostics.events.map((event) => `<div class="event-row"><span>${event.sequence}</span><b>${escapeHtml(event.eventType)}</b><code>${escapeHtml(event.subjectId)}</code><small>${formatTime(event.timestamp)}</small></div>`).join(''); }

async function sendChat(content, forcedCapability = null) {
  if (!state.compatible) return notify('Runtime update required. Restart Mahoraga after activating the matching release.', 'error');
  content = content.trim();
  const attachments = [...state.pendingAttachments];
  if ((!content && attachments.length === 0) || state.sending || state.queuedFiles > 0) return;
  if (!content) content = `Analyze ${attachments.map((item) => item.name).join(', ')}`;
  state.sending = true; $('chat-input').value = ''; resizeComposer(); renderChat();
  try {
    const attachmentIds = attachments.map((item) => item.id);
    let conversationId = state.activeConversation;
    if (!conversationId) {
      const created = await post('/api/conversations', { title: content.slice(0, 72), initialMessage: content, attachmentIds });
      conversationId = created.conversation.id; state.activeConversation = conversationId; writeConversationHash(conversationId);
    } else await post(`/api/conversations/${conversationId}/messages`, { content, role: 'user', attachmentIds });
    const selected = forcedCapability || $('chat-tool').value;
    const intent = selected === 'auto' ? autoRoute(content, attachments) : selected;
    if (!state.status.capabilities.some((item) => item.enabled && item.capability === intent)) throw new Error(`${intent} has no enabled worker`);
    await post('/api/tasks', { intent, priority: 'high', requestedOutcome: content, conversationId, idempotencyKey: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}` });
    state.pendingAttachments = [];
    await refresh();
  } catch (error) { notify(error.message, 'error'); }
  finally { state.sending = false; renderChat(); $('chat-input').focus(); }
}

function autoRoute(content, attachments = []) {
  const text = content.toLowerCase();
  if (attachments.length) return 'artifact.inspect';
  if (isMicrosoftWorkUrl(text)) return state.status?.capabilities.some((item) => item.enabled && item.capability === 'm365.reason') ? 'm365.reason' : 'provider.gap';
  if (/\bbrowser\b|\bchrome\b|\bweb page\b|\bwebsite\b/.test(text)) return /\btest\b|\bverify\b|\bsmoke\b|\bopen\b/.test(text) ? 'browser.smoke' : 'browser.status';
  if (/\brepository\b|\brepo\b|\bgithub\b|\bgit\b|\bsource code\b/.test(text)) return 'repository.inspect';
  if (/repair|recover|recovery|self-heal|baseline/.test(text)) return 'repair.scan';
  if (/manifest|configuration|config/.test(text)) return 'manifest.validate';
  if (/health|runtime|system status|working|online/.test(text)) return 'system.health';
  return 'assistant.respond';
}


function isMicrosoftWorkUrl(content) {
  return /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*sharepoint\.com(?:[\/:?#]|$)|(?:https?:\/\/)?(?:www\.)?(?:onedrive\.live\.com|1drv\.ms)(?:[\/:?#]|$)/i.test(content);
}

function inferDataClass(content, attachments, supported) {
  if ((isMicrosoftWorkUrl(content) || /\benterprise\b/i.test(content)) && supported.includes('enterprise')) return 'enterprise';
  if (attachments.length && supported.includes('local-only')) return 'local-only';
  return supported[0];
}

function filesFromClipboard(clipboardData) {
  const files = [];
  for (const item of clipboardData?.items ?? []) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  for (const file of clipboardData?.files ?? []) {
    if (!files.some((item) => item === file || `${item.name}:${item.size}:${item.type}:${item.lastModified}` === `${file.name}:${file.size}:${file.type}:${file.lastModified}`)) files.push(file);
  }
  return files;
}

function enqueueFiles(fileList, source) {
  if (!state.compatible) return notify('Runtime update required. Restart Mahoraga after activating the matching release.', 'error');
  const available = Math.max(0, 20 - state.pendingAttachments.length - state.queuedFiles);
  const files = [...fileList].slice(0, available);
  if (!files.length) return notify(available ? 'No files were available to attach.' : 'A maximum of 20 files can be attached.', 'error');
  state.queuedFiles += files.length;
  renderChat();
  state.uploadQueue = state.uploadQueue
    .then(() => uploadFiles(files, source))
    .finally(() => { state.queuedFiles -= files.length; renderChat(); });
}
async function uploadFiles(fileList, source) {
  if (!state.compatible) return;
  const files = [...fileList];
  if (!files.length) return;
  state.uploading = true; renderChat();
  let uploaded = 0;
  const failures = [];
  for (const file of files) {
    try {
      const response = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-mahoraga-file-name': encodeURIComponent(file.name || `pasted-${Date.now()}.bin`), 'x-mahoraga-file-source': source },
        body: file,
      });
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      state.pendingAttachments.push(data.artifact);
      uploaded += 1;
    } catch (error) {
      failures.push(`${file.name || 'clipboard item'}: ${error.message}`);
    }
  }
  if (uploaded) notify(`${uploaded} file${uploaded === 1 ? '' : 's'} ready for Mahoraga`);
  if (failures.length) notify(failures.join('; '), 'error');
  state.uploading = false; renderChat();
}

async function removePendingAttachment(id) {
  const index = state.pendingAttachments.findIndex((item) => item.id === id);
  if (index < 0) return;
  try { await api(`/api/artifacts/${id}`, { method: 'DELETE' }); }
  catch (error) { if (error.message !== 'artifact-in-use') return notify(error.message, 'error'); }
  state.pendingAttachments.splice(index, 1); renderChat();
}

function renderPendingAttachments() {
  $('attachment-preview').innerHTML = state.pendingAttachments.map((item) => `<span class="attachment-chip"><b>${escapeHtml(item.name)}</b><small>${formatBytes(item.sizeBytes)}</small><button type="button" data-remove-attachment="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">×</button></span>`).join('');
}
function messageAttachmentsHtml(attachments) {
  if (!attachments.length) return '';
  return `<div class="message-attachments">${attachments.map((item) => { const preview = /^(?:image\/(?:png|jpeg|gif|webp|avif))$/.test(item.mimeType) ? `<img src="/api/artifacts/${escapeHtml(item.id)}/content" alt="${escapeHtml(item.name)}">` : ''; return `<a class="message-attachment" href="/api/artifacts/${escapeHtml(item.id)}/content" target="_blank" rel="noopener">${preview}<span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.mimeType)} · ${formatBytes(item.sizeBytes)}</small></span></a>`; }).join('')}</div>`;
}
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

function showView(name, persist = true) { state.activeView = name; document.querySelectorAll('[data-page]').forEach((page) => page.classList.toggle('active', page.dataset.page === name)); document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name)); if (persist) writeView(name); }
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
$('chat-input').addEventListener('paste', (event) => { const files = filesFromClipboard(event.clipboardData); if (files.length) { event.preventDefault(); enqueueFiles(files, 'clipboard'); } });
$('attach-files').addEventListener('click', () => $('attachment-input').click());
$('attachment-input').addEventListener('change', (event) => { const files = [...event.target.files]; event.target.value = ''; enqueueFiles(files, 'picker'); });
$('chat-form').addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('drag-active'); });
$('chat-form').addEventListener('dragleave', (event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drag-active'); });
$('chat-form').addEventListener('drop', (event) => { event.preventDefault(); event.currentTarget.classList.remove('drag-active'); enqueueFiles(event.dataTransfer?.files ?? [], 'drop'); });
$('attachment-preview').addEventListener('click', (event) => { const button = event.target.closest('[data-remove-attachment]'); if (button) removePendingAttachment(button.dataset.removeAttachment); });
document.querySelector('.suggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-suggestion]'); if (button) sendChat(button.dataset.suggestion, button.dataset.capability); });
$('task-capability').addEventListener('change', syncDataClass);
$('task-form').addEventListener('submit', (event) => runForm(event, async () => { const capability = $('task-capability').value; const outcome = $('task-outcome').value.trim() || `Run ${capability}`; await dispatch(capability, outcome, $('task-priority').value); $('task-outcome').value = ''; }));
$('improvement-form').addEventListener('submit', (event) => { const form = event.currentTarget; runForm(event, async () => { await post('/api/improvements', { title: $('improvement-title').value.trim(), summary: $('improvement-summary').value.trim() }); form.reset(); notify('Improvement candidate recorded'); await refresh(); }); });

document.body.addEventListener('click', async (event) => {
  const refreshButton = event.target.closest('[data-refresh]'); if (refreshButton) return runButton(refreshButton, () => refresh(false));
  const capabilityButton = event.target.closest('[data-capability-action]'); if (capabilityButton) return runButton(capabilityButton, () => dispatch(capabilityButton.dataset.capabilityAction, `Run ${capabilityButton.dataset.capabilityAction}`));
  const taskButton = event.target.closest('[data-task-action]'); if (taskButton) return runButton(taskButton, async () => { const { taskAction: action, taskId: id } = taskButton.dataset; if (action === 'input') { const content = window.prompt('Your response for Mahoraga:'); if (!content) return; await post(`/api/tasks/${id}/input`, { content }); } else await post(`/api/tasks/${id}/${action}`); notify(`Task ${action} accepted`); await refresh(); });
  const workerButton = event.target.closest('[data-worker-action]'); if (workerButton) return runButton(workerButton, async () => { await post(`/api/workers/${workerButton.dataset.workerId}/${workerButton.dataset.workerAction}`); notify(`Worker ${workerButton.dataset.workerAction} accepted`); await refresh(); });
  const decision = event.target.closest('[data-improvement-decision]'); if (decision) return runButton(decision, async () => { const id = decision.dataset.improvementId; await post(`/api/improvements/${id}/decision`, { decision: decision.dataset.improvementDecision }, { 'x-mahoraga-approval': id }); notify(`Improvement ${decision.dataset.improvementDecision}`); await refresh(); });
  const copyBranch = event.target.closest('[data-copy-branch]'); if (copyBranch) return runButton(copyBranch, async () => { await navigator.clipboard.writeText(copyBranch.dataset.copyBranch); notify('Return branch copied'); });
});

async function dispatch(intent, outcome, priority = 'high') { requireCompatibleRuntime(); if (!state.status.capabilities.some((item) => item.enabled && item.capability === intent)) throw new Error(`${intent} has no enabled worker`); await post('/api/tasks', { intent, priority, requestedOutcome: outcome, initialMessage: outcome, idempotencyKey: `workspace-${Date.now()}-${Math.random().toString(16).slice(2)}` }); notify(`Dispatched ${intent}`); await refresh(); }
async function runButton(button, action) { button.disabled = true; try { await action(); } catch (error) { notify(error.message, 'error'); } finally { button.disabled = false; } }
async function runForm(event, action) { event.preventDefault(); return runButton(event.submitter, action); }
function resizeComposer() { const input = $('chat-input'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; }
function notify(message, kind = 'success') { const toast = $('toast'); toast.textContent = message; toast.className = `show ${kind === 'error' ? 'error' : ''}`; clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.className = ''; }, 3500); }
function readConversationHash() { return /^#con-[a-f0-9-]+$/.test(location.hash) ? location.hash.slice(1) : null; }
function readView() { const value = new URLSearchParams(location.search).get('view'); return VIEWS.has(value) ? value : 'chat'; }
function writeView(name) { const url = new URL(location.href); if (name === 'chat') url.searchParams.delete('view'); else url.searchParams.set('view', name); history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); }
function writeConversationHash(id) { const url = new URL(location.href); url.hash = id ? `#${id}` : ''; history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); }
function toolLabel(capability) { return ({ 'assistant.respond': 'Conversation', 'provider.gap': 'Provider gap', 'system.health': 'System health', 'manifest.validate': 'Validate manifest', 'repository.status': 'Repository status', 'repository.inspect': 'Inspect repository', 'repository.history': 'Repository history', 'repository.verify': 'Verify repository', 'repair.scan': 'Scan recovery', 'repair.apply': 'Apply recovery', 'browser.status': 'Browser status', 'browser.smoke': 'Browser smoke' })[capability] || capability; }
function formatTime(value) { return value ? new Date(value).toLocaleString() : 'never'; }
function label(value) { return String(value).split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' '); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

setInteractionsEnabled(false);
showView(state.activeView, false);
refresh(false);
setInterval(() => { if (!document.hidden) refresh(true); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });

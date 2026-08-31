const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const RELAY_ORIGIN = 'wss://relay.mahoraga.app/pair';
const TERMINAL_EVENTS = new Set(['run-completed', 'run-failed', 'run-cancelled']);
const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const state = {
  repository: null, commit: null, issues: [], pulls: [], runs: [], releases: [], messages: [],
  connection: 'detecting', transport: null, currentRun: null, currentConversationId: null,
  sessions: [], lastRequest: null, capabilities: [], improvement: null,
};

class LoopbackTransport {
  constructor() { this.kind = 'loopback'; }
  async probe() {
    const response = await fetch('/api/identity', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('loopback-unavailable');
    return response.json();
  }
  async start(input) { return this.request('/api/v2/runs', { method: 'POST', body: JSON.stringify(input) }); }
  async events(runId, afterEventId = 0) {
    const response = await fetch(`/api/v2/runs/${encodeURIComponent(runId)}/events?after=${afterEventId}`, { credentials: 'same-origin', headers: { Accept: 'text/event-stream' } });
    if (!response.ok) throw new Error(`run-events-${response.status}`);
    return parseSse(await response.text());
  }
  async cancel(runId) { return this.request(`/api/v2/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: '{}' }); }
  async capabilities() { return (await this.request('/api/v2/capabilities')).capabilities; }
  async getImprovement(id) { return (await this.request(`/api/v2/improvements/${encodeURIComponent(id)}`)).improvement; }
  async request(route, options = {}) {
    const response = await fetch(route, { credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...options });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || `runtime-${response.status}`);
    return value;
  }
}

class RelayTransport {
  constructor() { this.kind = 'relay'; this.socket = null; this.session = null; this.pending = new Map(); this.requestCounter = 0; this.pairingPending = null; this.revokePending = null; this.deviceId = null; this.pairingId = null; }
  async pair(encodedOffer) {
    const offer = decodePairingOffer(encodedOffer);
    if (Date.parse(offer.expiresAt) <= Date.now()) throw new Error('relay-pairing-expired');
    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const peer = await crypto.subtle.importKey('jwk', offer.devicePublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, keys.privateKey, 256);
    const context = { code: offer.code, expiresAt: offer.expiresAt, pairingId: offer.pairingId, protocolVersion: offer.protocolVersion };
    this.session = await deriveBrowserRelaySession(shared, context);
    const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
    this.socket = new WebSocket(RELAY_ORIGIN);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('relay-connect-timeout')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('relay-connect-failed')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => this.receive(event));
    this.socket.addEventListener('close', () => this.rejectPending('relay-disconnected'));
    this.pairingId = offer.pairingId;
    const pairing = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pairingPending = null; reject(new Error('relay-pairing-timeout')); }, 10000);
      this.pairingPending = { resolve: (value) => { clearTimeout(timer); this.pairingPending = null; resolve(value); }, reject: (error) => { clearTimeout(timer); this.pairingPending = null; reject(error); } };
    });
    this.socket.send(JSON.stringify({ action: 'pair-remote', pairingId: offer.pairingId, code: offer.code, devicePublicKey: publicKey }));
    const result = await pairing;
    if (!result?.sessionId || !/^rls-[A-Za-z0-9_-]{32}$/.test(result.sessionId) || result.pairingId !== offer.pairingId || result.paired !== true) throw new Error('relay-pairing-response-invalid');
    this.session.sessionId = result.sessionId;
    this.deviceId = result.deviceId;
    return { sessionId: this.session.sessionId };
  }
  async start(input) { return this.call('run', input); }
  async events(runId, afterEventId = 0) { return (await this.call('events', { runId, afterEventId })).events || []; }
  async cancel(runId) { return this.call('cancel', { runId }); }
  async capabilities() { return (await this.call('capabilities', {})).capabilities || []; }
  async getImprovement(id) { return (await this.call('improvement', { id })).improvement; }
  async call(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.session) throw new Error('relay-not-paired');
    const requestId = `req-${++this.requestCounter}`;
    const frame = await sealBrowserFrame(this.session, { requestId, type, payload });
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('relay-request-timeout')); }, 30000);
      this.pending.set(requestId, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ action: 'forward', sessionId: this.session.sessionId, from: 'remote', frame }));
    return response;
  }
  async receive(event) {
    try {
      const frame = JSON.parse(String(event.data));
      if (frame.accepted === false && this.pairingPending) { this.pairingPending.reject(new Error(frame.error || 'relay-pairing-rejected')); return; }
      if (frame.type === 'paired') {
        if (!frame.accepted) this.pairingPending?.reject(new Error(frame.error || 'relay-pairing-rejected'));
        else this.pairingPending?.resolve(frame.result);
        return;
      }
      if (frame.type === 'forward-accepted' || frame.type === 'replay-complete') return;
      if (frame.type === 'revoked') { this.revokePending?.(); this.revokePending = null; this.rejectPending('relay-revoked'); return; }
      if (frame.type !== 'frame' || !frame.frame) throw new Error('relay-frame-envelope-invalid');
      const value = await openBrowserFrame(this.session, frame.frame);
      const pending = this.pending.get(value.requestId);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(value.requestId);
      if (value.error) pending.reject(new Error(value.error)); else pending.resolve(value.result);
    } catch { this.rejectPending('relay-frame-invalid'); }
  }
  async revoke() {
    try {
      if (this.socket?.readyState === WebSocket.OPEN && this.deviceId) {
        const acknowledged = new Promise((resolve) => { this.revokePending = resolve; setTimeout(resolve, 1500); });
        this.socket.send(JSON.stringify({ action: 'revoke-device', deviceId: this.deviceId }));
        await acknowledged;
      }
    } finally {
      if (this.socket) this.socket.close(1000, 'owner-revoked'); this.socket = null; this.session = null; this.deviceId = null; this.pairingId = null; this.revokePending = null; this.rejectPending('relay-revoked');
    }
  }
  rejectPending(code) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(code)); } this.pending.clear(); }
}

class OfflinePreviewTransport {
  constructor() { this.kind = 'offline-preview'; this.eventsByRun = new Map(); }
  async start(input) {
    const run = { id: `run-${crypto.randomUUID()}`, conversationId: input.conversationId || `con-${crypto.randomUUID()}`, state: 'failed' };
    this.eventsByRun.set(run.id, [
      previewEvent(run, 1, 'run-start', { requestBytes: encoder.encode(input.content).byteLength, intentKind: classifyTask(input.content).id }),
      previewEvent(run, 2, 'run-failed', { reasonCode: 'offline-preview-not-dispatched' }),
    ]);
    return { run, preview: true };
  }
  async events(runId, afterEventId = 0) { return (this.eventsByRun.get(runId) || []).filter((event) => event.eventId > afterEventId); }
  async cancel(runId) { return { run: { id: runId, state: 'cancelled' } }; }
  async capabilities() { return []; }
  async getImprovement() { throw new Error('offline-preview'); }
}

const skillPrompts = {
  repository: 'Review the repository and implement the highest-value improvement.',
  ui: 'Improve the Mahoraga conversation interface and verify it in the browser.',
  testing: 'Run complete verification, diagnose failures, and fix the root cause.',
  security: 'Review security, privacy, and release readiness.',
  release: 'Prepare the next verified release with rollback evidence.',
  auto: 'Choose the fastest healthy execution path for this request.',
};

function bindInterface() {
  document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => { if (button.classList.contains('new-task')) startNewConversation(); showView(button.dataset.viewTarget); }));
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => setPrompt(button.dataset.prompt)));
  document.querySelectorAll('[data-new-cloud-task]').forEach((button) => button.addEventListener('click', () => { startNewConversation(); showView('workspace'); }));
  document.querySelectorAll('[data-skill-preset]').forEach((button) => button.addEventListener('click', () => { setPrompt(skillPrompts[button.dataset.skillPreset] || skillPrompts.auto); showView('workspace'); }));
  $('task-text').addEventListener('input', () => { resizeComposer(); renderClassificationPreview(); });
  $('conversation-composer').addEventListener('submit', submitConversation);
  $('cancel-run').addEventListener('click', cancelCurrentRun);
  $('retry-run').addEventListener('click', retryLastRun);
  $('session-select').addEventListener('change', selectSession);
  $('pair-relay').addEventListener('click', pairRelay);
  $('revoke-relay').addEventListener('click', revokeRelay);
  $('refresh-capabilities').addEventListener('click', refreshCapabilities);
  $('check-improvement').addEventListener('click', checkImprovement);
  $('refresh').addEventListener('click', () => refreshCloudState(true));
  document.querySelector('.mobile-nav').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
}

async function selectInitialTransport() {
  const loopback = new LoopbackTransport();
  try {
    await loopback.probe();
    state.transport = loopback; setConnection('loopback', 'Loopback runtime connected');
    await refreshCapabilities();
  } catch {
    state.transport = new OfflinePreviewTransport(); setConnection('offline-preview', 'Offline preview · not dispatched');
  }
}

async function submitConversation(event) {
  event.preventDefault();
  const input = $('task-text'); const content = input.value.trim();
  if (!content || state.currentRun) { input.focus(); return; }
  const classification = classifyTask(content);
  appendMessage('user', content); state.messages.push({ role: 'user', classification: classification.id });
  input.value = ''; resizeComposer(); renderClassificationPreview();
  state.lastRequest = { content, classification: 'local-only' };
  try {
    const result = await state.transport.start({ conversationId: state.currentConversationId, content, classification: 'local-only', attachmentCount: 0, idempotencyKey: `ui-${crypto.randomUUID()}` });
    state.currentRun = result.run; state.currentConversationId = result.run.conversationId;
    rememberSession(result.run.conversationId);
    $('cancel-run').disabled = TERMINAL_EVENTS.has(result.run.state); $('retry-run').disabled = true;
    if (result.preview) appendMessage('assistant', 'Offline preview only. This request was not dispatched.', { label: classification.lane, state: 'staged' });
    await watchRun(result.run.id);
  } catch (error) {
    appendMessage('assistant', `Run was rejected: ${publicError(error)}`, { label: 'failed', state: 'staged' });
    finishRun();
  }
}

async function watchRun(runId) {
  let cursor = 0; let terminal = false;
  for (let attempt = 0; attempt < 120 && !terminal && state.currentRun?.id === runId; attempt += 1) {
    const events = await state.transport.events(runId, cursor);
    for (const event of events) { cursor = Math.max(cursor, event.eventId); renderRunEvent(event); if (TERMINAL_EVENTS.has(event.type)) terminal = true; }
    if (!terminal) await delay(1000);
  }
  if (terminal) finishRun();
}

function renderRunEvent(event) {
  const article = appendMessage('assistant', eventLabel(event.type), { label: event.type, state: TERMINAL_EVENTS.has(event.type) ? '' : 'connected' });
  const detail = document.createElement('code'); detail.className = 'event-detail'; detail.textContent = JSON.stringify(event.payload || {}); article.querySelector('div').append(detail);
}

async function cancelCurrentRun() {
  if (!state.currentRun) return;
  try { await state.transport.cancel(state.currentRun.id); appendMessage('assistant', 'Cancellation requested.', { label: 'run-cancelled' }); }
  catch (error) { toast(publicError(error)); }
  finishRun();
}
async function retryLastRun() { if (!state.lastRequest) return; $('task-text').value = state.lastRequest.content; await submitConversation(new Event('submit')); }
function finishRun() { state.currentRun = null; $('cancel-run').disabled = true; $('retry-run').disabled = !state.lastRequest; }

async function pairRelay() {
  const offer = $('pair-code').value.trim(); if (!offer) return $('pair-code').focus();
  const relay = new RelayTransport(); $('pair-relay').disabled = true;
  try {
    const paired = await relay.pair(offer); state.transport = relay; setConnection('relay', `Encrypted relay · ${paired.sessionId.slice(-8)}`);
    $('relay-state').textContent = 'Paired end to end. The relay forwards ciphertext only.'; $('revoke-relay').disabled = false; $('pair-code').value = '';
    await refreshCapabilities();
  } catch (error) { $('relay-state').textContent = `Pairing failed: ${publicError(error)}`; }
  finally { $('pair-relay').disabled = false; }
}
async function revokeRelay() { if (state.transport instanceof RelayTransport) await state.transport.revoke(); state.transport = new OfflinePreviewTransport(); $('revoke-relay').disabled = true; $('relay-state').textContent = 'Relay session revoked.'; setConnection('offline-preview', 'Offline preview · not dispatched'); }

async function refreshCapabilities() {
  try { state.capabilities = await state.transport.capabilities(); }
  catch { state.capabilities = []; }
  renderRows('capability-list', state.capabilities.map((item) => ({ title: item.capability, detail: (item.workerIds || []).join(', ') || 'no worker', state: item.routable ? 'ready' : 'unavailable' })));
}
async function checkImprovement() {
  const id = $('improvement-id').value.trim(); if (!/^imp-[a-f0-9-]+$/.test(id)) return toast('Improvement ID is invalid');
  try { state.improvement = await state.transport.getImprovement(id); $('improvement-state').textContent = `${state.improvement.id} · ${state.improvement.status || state.improvement.state}`; }
  catch (error) { $('improvement-state').textContent = `Unavailable: ${publicError(error)}`; }
}

function setConnection(kind, label) {
  state.connection = kind; $('bridge-pill').textContent = label; $('bridge-state').lastChild.textContent = ` ${label}`;
  $('bridge-state').classList.toggle('connected', kind !== 'offline-preview');
}
function showView(name) {
  const target = document.querySelector(`[data-view="${name}"]`); if (!target) return;
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view === target));
  document.querySelectorAll('.nav-list [data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name));
  $('page-title').textContent = name[0].toUpperCase() + name.slice(1); document.querySelector('.sidebar').classList.remove('open'); location.hash = name;
}
function classifyTask(value) {
  const text = String(value || '').toLowerCase();
  if (/security|privacy|credential|threat|vulnerab|audit/.test(text)) return { id: 'assurance', label: 'Security and assurance', lane: 'evidence-first' };
  if (/test|verify|validation|check|failure|broken/.test(text)) return { id: 'verification', label: 'Testing and verification', lane: 'deterministic-fast' };
  if (/release|deploy|publish|version|rollback/.test(text)) return { id: 'release', label: 'Release engineering', lane: 'verified-release' };
  if (/interface|frontend|workspace|page|layout|design|accessib/.test(text)) return { id: 'experience', label: 'Interface and experience', lane: 'implementation' };
  return { id: 'repository', label: 'Repository engineering', lane: 'implementation' };
}
function appendMessage(role, content, metadata = {}) {
  const article = document.createElement('article'); article.className = `message ${role}`;
  if (role === 'assistant') { const icon = document.createElement('img'); icon.src = './mark.svg'; icon.alt = ''; icon.width = 28; icon.height = 28; article.append(icon); }
  const body = document.createElement('div'); const author = document.createElement('strong'); author.textContent = role === 'user' ? 'You' : 'Mahoraga';
  const paragraph = document.createElement('p'); paragraph.textContent = String(content); body.append(author, paragraph);
  if (metadata.label) { const status = document.createElement('span'); status.className = `message-state ${metadata.state || ''}`; status.textContent = metadata.label; body.append(status); }
  article.append(body); $('conversation-thread').append(article); article.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return article;
}
function startNewConversation() { const thread = $('conversation-thread'); while (thread.children.length > 1) thread.lastElementChild.remove(); state.messages = []; state.currentConversationId = null; state.currentRun = null; setPrompt(''); finishRun(); $('session-select').value = 'new'; }
function rememberSession(conversationId) { if (!state.sessions.includes(conversationId)) { state.sessions.push(conversationId); const option = document.createElement('option'); option.value = conversationId; option.textContent = `Session ${state.sessions.length}`; $('session-select').append(option); } $('session-select').value = conversationId; }
function selectSession() { state.currentConversationId = $('session-select').value === 'new' ? null : $('session-select').value; }
function setPrompt(value) { $('task-text').value = value || ''; resizeComposer(); renderClassificationPreview(); $('task-text').focus(); }
function renderClassificationPreview() { const value = $('task-text').value.trim(); $('classification-preview').textContent = value ? classifyTask(value).label : 'Auto'; }
function resizeComposer() { const input = $('task-text'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 190)}px`; }

async function refreshCloudState(manual = false) {
  if (manual) $('refresh').disabled = true;
  const responses = await Promise.allSettled([github('/'), github('/commits/main'), github('/issues?state=all&per_page=30'), github('/pulls?state=open&per_page=30'), github('/actions/runs?per_page=12'), github('/releases?per_page=12')]);
  if (responses[0].status === 'fulfilled') state.repository = responses[0].value;
  if (responses[1].status === 'fulfilled') state.commit = responses[1].value;
  if (responses[2].status === 'fulfilled') state.issues = responses[2].value.filter((item) => !item.pull_request && /^\[(?:CODEX|MAHORAGA)\]/.test(item.title));
  if (responses[3].status === 'fulfilled') state.pulls = responses[3].value;
  if (responses[4].status === 'fulfilled') state.runs = responses[4].value.workflow_runs || [];
  if (responses[5].status === 'fulfilled') state.releases = responses[5].value;
  renderCloudState(responses.every((item) => item.status === 'fulfilled')); if (manual) { $('refresh').disabled = false; toast('Cloud status refreshed'); }
}
async function github(route) { const response = await fetch(`${API}${route}`, { headers: { Accept: 'application/vnd.github+json' }, referrerPolicy: 'no-referrer' }); if (!response.ok) throw new Error(`github-${response.status}`); return response.json(); }
function renderCloudState(complete) {
  const available = Boolean(state.repository); $('repo-dot').className = available ? 'ready' : complete ? 'error' : '';
  $('repo-state').textContent = available ? 'Repository telemetry live' : 'Repository telemetry unavailable';
  $('repo-detail').textContent = available ? `${state.repository.visibility} repository · ${state.connection}` : 'Open GitHub for repository state';
  $('github-visibility').textContent = available ? `${capitalize(state.repository.visibility)} · read-only telemetry connected` : 'Status unavailable.';
  $('metric-tasks').textContent = String(state.issues.filter((item) => item.state === 'open').length); $('metric-prs').textContent = String(state.pulls.length);
  $('metric-sha').textContent = state.commit?.sha?.slice(0, 7) || 'Private'; $('metric-sha-time').textContent = state.commit ? `Updated ${relativeTime(state.commit.commit.committer.date)}` : 'Open GitHub for current revision';
  const latestRun = state.runs[0]; $('metric-run').textContent = latestRun ? (latestRun.conclusion || latestRun.status) : 'Private'; $('metric-run-time').textContent = latestRun ? `${latestRun.name} · ${relativeTime(latestRun.updated_at)}` : 'Open GitHub Actions for status';
  $('activity-count').textContent = String(state.issues.filter((item) => item.state === 'open').length + state.pulls.length); $('approval-count').textContent = String(state.pulls.length);
  renderRows('task-list', state.issues.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · ${relativeTime(item.updated_at)}`, state: issueState(item) })));
  renderRows('run-list', state.runs.slice(0, 10).map((run) => ({ href: run.html_url, title: run.name, detail: `${run.event} · ${relativeTime(run.updated_at)}`, state: run.conclusion || run.status })));
  renderRows('approval-list', state.pulls.slice(0, 10).map((item) => ({ href: item.html_url, title: item.title, detail: `#${item.number} · ${relativeTime(item.updated_at)}`, state: item.draft ? 'draft' : 'review' })));
  const release = state.releases[0]; $('release-latest').textContent = release?.tag_name || 'None'; $('release-latest-time').textContent = release ? relativeTime(release.published_at) : 'Owner-started only';
  renderRows('release-list', state.releases.map((item) => ({ href: item.html_url, title: item.name || item.tag_name, detail: relativeTime(item.published_at), state: item.draft ? 'draft' : 'attested' })));
}
function renderRows(id, rows) {
  const container = $(id); if (!container) return;
  container.replaceChildren(...(rows.length ? rows.map((row) => {
    const item = row.href ? document.createElement('a') : document.createElement('div'); item.className = 'activity-row'; if (row.href) item.href = row.href;
    const title = document.createElement('strong'); title.textContent = row.title; const detail = document.createElement('span'); detail.textContent = row.detail;
    const badge = document.createElement('b'); badge.textContent = row.state; badge.className = row.state; item.append(title, detail, badge); return item;
  }) : [emptyRow()]));
}
function emptyRow() { const item = document.createElement('p'); item.className = 'empty'; item.textContent = 'No activity is available.'; return item; }
function parseSse(source) { return source.split(/\n\n+/).map((block) => block.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n')).filter(Boolean).map((value) => JSON.parse(value)); }
function previewEvent(run, eventId, type, payload) { return { schemaVersion: 1, eventId, sessionId: 'ses-offline-preview', conversationId: run.conversationId, runId: run.id, agentId: 'mahoraga', type, timestamp: new Date().toISOString(), payload }; }
function eventLabel(type) { return ({ 'run-start': 'Run accepted.', 'worker-started': 'Worker started.', 'verification-started': 'Verification started.', 'receipt-created': 'Verified receipt created.', 'run-completed': 'Run completed.', 'run-failed': 'Run stopped.', 'run-cancelled': 'Run cancelled.' })[type] || type.replaceAll('-', ' '); }
function decodePairingOffer(value) {
  let offer; try { offer = JSON.parse(value.startsWith('{') ? value : decoder.decode(fromBase64Url(value))); } catch { throw new Error('relay-pairing-offer-invalid'); }
  const keys = Object.keys(offer || {}).sort().join(','); if (keys !== 'code,devicePublicKey,expiresAt,pairingId,protocolVersion,schemaVersion' || offer.schemaVersion !== 1 || offer.protocolVersion !== '1.0.0' || !/^pair-[a-f0-9-]{36}$/.test(offer.pairingId) || !/^[A-Z2-9]{8}$/.test(offer.code) || offer.devicePublicKey?.crv !== 'P-256') throw new Error('relay-pairing-offer-invalid'); return offer;
}
async function deriveBrowserRelaySession(shared, context) {
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']); const contextBytes = encoder.encode(JSON.stringify(context)); const salt = await crypto.subtle.digest('SHA-256', contextBytes);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('mahoraga-relay-frame-v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const hash = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', contextBytes))).slice(0, 32); return { sessionId: `rls-${hash}`, key, sendCounter: 0, receivedCounter: 0 };
}
async function sealBrowserFrame(session, payload) { const counter = ++session.sendCounter; const iv = crypto.getRandomValues(new Uint8Array(12)); const aad = frameAad(session.sessionId, 'ui-to-runtime', counter); const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, session.key, encoder.encode(JSON.stringify(payload))); return { schemaVersion: 1, sessionId: session.sessionId, direction: 'ui-to-runtime', counter, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) }; }
async function openBrowserFrame(session, frame) { if (frame.sessionId !== session.sessionId || frame.direction !== 'runtime-to-ui' || !Number.isSafeInteger(frame.counter) || frame.counter <= session.receivedCounter) throw new Error('relay-frame-invalid'); const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(frame.iv), additionalData: frameAad(frame.sessionId, frame.direction, frame.counter), tagLength: 128 }, session.key, fromBase64Url(frame.ciphertext)); session.receivedCounter = frame.counter; return JSON.parse(decoder.decode(plaintext)); }
function frameAad(sessionId, direction, counter) { return encoder.encode(JSON.stringify({ protocolVersion: '1.0.0', sessionId, direction, counter })); }
function toBase64Url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function fromBase64Url(value) { const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='); const binary = atob(base64); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function publicError(error) { const code = String(error?.message || 'request-rejected'); return /^[a-z][a-z0-9.-]{0,79}$/.test(code) ? code : 'request-rejected'; }
function relativeTime(value) { const seconds = Math.round((Date.now() - Date.parse(value)) / 1000); if (!Number.isFinite(seconds)) return 'unknown'; if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function capitalize(value) { return value ? value[0].toUpperCase() + value.slice(1) : 'Unknown'; }
function issueState(issue) { const lane = issue.labels.find((label) => labelName(label).startsWith('lane:')); return lane ? labelName(lane).replace('lane:', '') : issue.state; }
function labelName(label) { return typeof label === 'string' ? label : label?.name || ''; }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove('show'), 2600); }

bindInterface();
const initialView = location.hash.slice(1); showView(document.querySelector(`[data-view="${initialView}"]`) ? initialView : 'workspace');
selectInitialTransport();
refreshCloudState();

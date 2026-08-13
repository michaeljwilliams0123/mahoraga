const $ = (id) => document.getElementById(id);
async function api(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error((await response.json()).error); return response.json(); }
async function refresh() {
  try {
    const [status, taskData, conversationData] = await Promise.all([api('/api/status'), api('/api/tasks'), api('/api/conversations')]);
    $('health').textContent = 'Runtime healthy'; $('version').textContent = `${status.product} ${status.version} · Control Center ${status.versions.controlCenter} · ${status.phase}`;
    $('mode').textContent = status.autonomyMode.toUpperCase();
    $('workers').textContent = status.workers.filter((w) => ['healthy','busy'].includes(w.status)).length;
    $('queued').textContent = status.taskCounts.queued + status.taskCounts.running + status.taskCounts.verifying;
    $('improvements').textContent = status.improvementsAwaitingUser + status.taskCounts.waiting_for_user; $('failed').textContent = status.taskCounts.failed;
    $('worker-summary').textContent = `${status.workers.length} active processes`;
    $('worker-list').innerHTML = status.workers.map((w) => `<div class="worker"><div><b>${escapeHtml(w.label || label(w.workerId))} · ${escapeHtml(w.version)}</b><small>PID ${w.pid} · ${w.currentTaskId ? `Task ${escapeHtml(w.currentTaskId)}` : 'Idle'} · ${w.capabilities.join(' · ')}</small></div><small class="badge ${w.status}">${w.status}</small></div>`).join('') || '<p class="empty">Workers are starting.</p>';
    $('connection-list').innerHTML = status.connections.map((c) => `<div class="connection"><div><b>${escapeHtml(label(c.id))}</b><small>${escapeHtml(c.endpointClass)} · ${escapeHtml(c.authenticationState)}${c.error ? ` · ${escapeHtml(c.error)}` : ''}</small></div><small class="badge ${c.error?'disabled':'ready'}">${escapeHtml(c.state)}</small></div>`).join('');
    $('task-list').innerHTML = taskData.tasks.length ? taskData.tasks.slice(0,12).map((t) => `<div class="task-row"><b>${escapeHtml(t.capability)}</b><span>${escapeHtml(t.assignedWorker||'unassigned')}</span><small class="badge ${t.status}">${t.status}</small><span>${new Date(t.updatedAt).toLocaleString()}</span></div>`).join('') : '<p class="empty">No tasks yet.</p>';
    $('conversation-summary').textContent = `${conversationData.conversations.length} durable thread(s)`;
    const selected = $('conversation-select').value;
    $('conversation-select').innerHTML = '<option value="">New assignment</option>' + conversationData.conversations.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
    if (conversationData.conversations.some((c) => c.id === selected)) $('conversation-select').value = selected;
    await loadConversation();
  } catch { $('health').textContent = 'Runtime unavailable'; $('version').textContent = 'The cockpit could not reach the supervisor.'; }
}
$('health-task').addEventListener('click', async () => { await api('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability:'system.health',dataClass:'synthetic',requestedMode:'local',idempotencyKey:`ui-health-${Date.now()}`})}); await refresh(); });
$('refresh').addEventListener('click', refresh);
$('conversation-select').addEventListener('change', loadConversation);
$('conversation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const conversationId = $('conversation-select').value;
  const content = $('conversation-message').value.trim();
  if (!content) return;
  if (conversationId) {
    await api(`/api/conversations/${conversationId}/messages`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content,role:'user'})});
  } else {
    const title = $('conversation-title').value.trim() || content.slice(0,80);
    const created = await api('/api/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title,initialMessage:content})});
    $('conversation-select').dataset.next = created.conversation.id;
  }
  $('conversation-message').value = ''; await refresh();
  if ($('conversation-select').dataset.next) { $('conversation-select').value = $('conversation-select').dataset.next; delete $('conversation-select').dataset.next; await loadConversation(); }
});
async function loadConversation(){
  const id=$('conversation-select').value; $('conversation-title').disabled=Boolean(id);
  if(!id){$('conversation-messages').innerHTML='<p class="empty">Start an assignment thread to preserve context while you are away.</p>';return}
  const data=await api(`/api/conversations/${id}/messages`);
  $('conversation-messages').innerHTML=data.messages.map((m)=>`<div class="message ${m.role}"><b>${escapeHtml(m.role)}${m.requiresResponse?' · response requested':''}</b><p>${escapeHtml(m.content)}</p><small>${new Date(m.createdAt).toLocaleString()}</small></div>`).join('')||'<p class="empty">No messages.</p>';
}
function label(value){return value.split('-').map((v)=>v[0].toUpperCase()+v.slice(1)).join(' ')}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
refresh(); setInterval(refresh,3000);

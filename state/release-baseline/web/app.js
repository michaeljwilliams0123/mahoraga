const $ = (id) => document.getElementById(id);
async function api(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error((await response.json()).error); return response.json(); }
async function refresh() {
  try {
    const [status, taskData] = await Promise.all([api('/api/status'), api('/api/tasks')]);
    $('health').textContent = 'Runtime healthy'; $('version').textContent = `${status.product} ${status.version} · Control Center ${status.versions.controlCenter} · ${status.phase}`;
    $('mode').textContent = status.autonomyMode.toUpperCase();
    $('workers').textContent = status.workers.filter((w) => ['healthy','busy'].includes(w.status)).length;
    $('queued').textContent = status.taskCounts.queued + status.taskCounts.running + status.taskCounts.verifying;
    $('improvements').textContent = status.improvementsAwaitingUser; $('failed').textContent = status.taskCounts.failed;
    $('worker-summary').textContent = `${status.workers.length} active processes`;
    $('worker-list').innerHTML = status.workers.map((w) => `<div class="worker"><div><b>${escapeHtml(w.label || label(w.workerId))} · ${escapeHtml(w.version)}</b><small>PID ${w.pid} · ${w.currentTaskId ? `Task ${escapeHtml(w.currentTaskId)}` : 'Idle'} · ${w.capabilities.join(' · ')}</small></div><small class="badge ${w.status}">${w.status}</small></div>`).join('') || '<p class="empty">Workers are starting.</p>';
    $('connection-list').innerHTML = status.connections.map((c) => `<div class="connection"><div><b>${escapeHtml(label(c.id))}</b><small>${escapeHtml(c.endpointClass)} · ${escapeHtml(c.authenticationState)}${c.error ? ` · ${escapeHtml(c.error)}` : ''}</small></div><small class="badge ${c.error?'disabled':'ready'}">${escapeHtml(c.state)}</small></div>`).join('');
    $('task-list').innerHTML = taskData.tasks.length ? taskData.tasks.slice(0,12).map((t) => `<div class="task-row"><b>${escapeHtml(t.capability)}</b><span>${escapeHtml(t.assignedWorker||'unassigned')}</span><small class="badge ${t.status}">${t.status}</small><span>${new Date(t.updatedAt).toLocaleString()}</span></div>`).join('') : '<p class="empty">No tasks yet.</p>';
  } catch { $('health').textContent = 'Runtime unavailable'; $('version').textContent = 'The cockpit could not reach the supervisor.'; }
}
$('health-task').addEventListener('click', async () => { await api('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capability:'system.health',dataClass:'synthetic',requestedMode:'local',idempotencyKey:`ui-health-${Date.now()}`})}); await refresh(); });
$('refresh').addEventListener('click', refresh);
function label(value){return value.split('-').map((v)=>v[0].toUpperCase()+v.slice(1)).join(' ')}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
refresh(); setInterval(refresh,3000);

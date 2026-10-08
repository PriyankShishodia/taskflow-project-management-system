/* TaskFlow SPA - vanilla JS, hash routing */
const STATUSES = ['To Do', 'In Progress', 'Completed'], PRIORITIES = ['Low', 'Medium', 'High'], ROLES = ['Admin', 'Project Manager', 'Team Member'];
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = (s) => String(s).replace(/\s/g, '');
const badge = (v) => `<span class="badge b-${cls(v)}">${esc(v)}</span>`;
const fmtDate = (d) => (d ? esc(d) : '<span class="muted">-</span>');
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (t) => t.due_date && t.status !== 'Completed' && t.due_date < today();
const opts = (arr, sel, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  arr.map((v) => { const [val, label] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}" ${String(val) === String(sel ?? '') ? 'selected' : ''}>${esc(label)}</option>`; }).join('');

let token = localStorage.getItem('token');
let me = JSON.parse(localStorage.getItem('me') || 'null');
const isMgr = () => me && ['Admin', 'Project Manager'].includes(me.role);

async function api(path, o = {}) {
  const headers = { ...(o.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body = o.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const res = await fetch('/api' + path, { method: o.method || 'GET', headers, body });
  if (o.raw) return res;
  if (res.status === 401 && token) { logout(); throw new Error('Session expired, please log in again'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.length ? data.details.map((d) => d.message).join('; ') : data.error || 'Request failed');
  return data;
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}
const go = (h) => (location.hash === h ? render() : (location.hash = h));
function setSession(d) { token = d.token; me = d.user; localStorage.setItem('token', token); localStorage.setItem('me', JSON.stringify(me)); }
function logout() { token = null; me = null; localStorage.clear(); go('#/login'); }

function modal(html) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  $$('[data-close]', bg).forEach((b) => b.addEventListener('click', close));
  return { el: bg, close };
}
const pager = (m) => `<div class="pager"><button class="btn sec sm" data-pg="${m.page - 1}" ${m.page <= 1 ? 'disabled' : ''}>Prev</button>
  <span>Page ${m.page} of ${m.pages} (${m.total} total)</span><button class="btn sec sm" data-pg="${m.page + 1}" ${m.page >= m.pages ? 'disabled' : ''}>Next</button></div>`;
const bindPager = (root, fn) => $$('[data-pg]', root).forEach((b) => b.addEventListener('click', () => fn(Number(b.dataset.pg))));
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function layout(content) {
  const r = location.hash.split('/')[1];
  const link = (h, label, key) => `<a href="#/${h}" class="${r === key ? 'active' : ''}">${label}</a>`;
  $('#app').innerHTML = `<header class="nav"><span class="brand">TaskFlow</span>
    ${link('dashboard', 'Dashboard', 'dashboard')}${link('projects', 'Projects', 'projects')}
    ${me.role === 'Admin' ? link('users', 'Users', 'users') + link('audit', 'Audit Log', 'audit') : ''}
    <a href="/api/docs" target="_blank">API Docs</a>
    <span class="who">${esc(me.name)} (${esc(me.role)})</span><button class="btn sec sm" id="logout">Logout</button></header>
    <main class="container">${content}</main>`;
  $('#logout').onclick = logout;
}

/* ---------- Auth ---------- */
function authView(mode) {
  const reg = mode === 'register';
  $('#app').innerHTML = `<div class="card auth"><h1>TaskFlow</h1><form id="f">
    ${reg ? '<label>Name</label><input name="name" required minlength="2">' : ''}
    <label>Email</label><input name="email" type="email" required>
    <label>Password</label><input name="password" type="password" required ${reg ? 'minlength="8"' : ''}>
    ${reg ? '<p class="muted">Min 8 characters with a letter and a number. The first user becomes Admin.</p>' : ''}
    <p class="err" id="e"></p><button class="btn" style="width:100%">${reg ? 'Create account' : 'Log in'}</button></form>
    <p class="muted" style="text-align:center">${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'No account? <a href="#/register">Register</a>'}</p></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try { setSession(await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) })); go('#/dashboard'); }
    catch (err) { $('#e').textContent = err.message; }
  };
}

/* ---------- Dashboard ---------- */
async function dashboardView() {
  const d = await api('/dashboard');
  const t = d.taskStatistics.totals;
  const stat = (n, l, c = '') => `<div class="card stat"><b class="${c}">${n}</b><span>${l}</span></div>`;
  const cnt = (arr, k) => arr.find((x) => x.key === k)?.count || 0;
  const pct = t.total ? Math.round((t.completed / t.total) * 100) : 0;
  layout(`<h1>Dashboard</h1>
  <div class="grid g4">${stat(t.total, 'Total tasks')}${stat(t.completed, 'Completed')}${stat(t.pending, 'Pending')}${stat(t.overdue, 'Overdue', t.overdue ? 'err' : '')}</div>
  <div class="grid g2">
   <div class="card"><h2>Project Progress</h2>${d.projectProgress.length ? d.projectProgress.map((p) => `
     <div style="margin-bottom:.8rem"><div class="row between"><a href="#/projects/${p.id}">${esc(p.name)}</a><span class="muted">${p.completed}/${p.total} - ${p.percent}%</span></div>
     <div class="bar"><i style="width:${p.percent}%"></i></div></div>`).join('') : '<p class="muted">No projects yet.</p>'}</div>
   <div class="card"><h2>Completed vs Pending</h2>
     <div class="row between"><span>Completed</span><b>${d.completedVsPending.completed}</b></div><div class="bar"><i style="width:${pct}%;background:var(--ok)"></i></div>
     <div class="row between" style="margin-top:.6rem"><span>Pending</span><b>${d.completedVsPending.pending}</b></div><div class="bar"><i style="width:${t.total ? 100 - pct : 0}%;background:var(--warn)"></i></div>
     <h2 style="margin-top:1.2rem">Task Statistics</h2>
     <div class="row">${STATUSES.map((s) => `${badge(s)} <b>${cnt(d.taskStatistics.byStatus, s)}</b>`).join(' &nbsp; ')}</div>
     <div class="row" style="margin-top:.5rem">${PRIORITIES.map((s) => `${badge(s)} <b>${cnt(d.taskStatistics.byPriority, s)}</b>`).join(' &nbsp; ')}</div></div>
   <div class="card"><h2>Upcoming Deadlines</h2>
     ${d.upcomingDeadlines.tasks.map((x) => `<div class="row between"><span>${esc(x.title)} <span class="muted">${esc(x.project_name)}</span></span><span>${esc(x.due_date)} ${badge(x.priority)}</span></div>`).join('') || '<p class="muted">No tasks due in the next 14 days.</p>'}
     ${d.upcomingDeadlines.projects.length ? '<h2 style="margin-top:1rem">Projects (30 days)</h2>' + d.upcomingDeadlines.projects.map((x) => `<div class="row between"><a href="#/projects/${x.id}">${esc(x.name)}</a><span>${esc(x.deadline)}</span></div>`).join('') : ''}</div>
   <div class="card"><h2>Team Performance Overview</h2><div class="tablewrap"><table><tr><th>Member</th><th>Assigned</th><th>Done</th><th>Overdue</th><th>Rate</th></tr>
     ${d.teamPerformance.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.assigned}</td><td>${m.completed}</td><td class="${m.overdue ? 'overdue' : ''}">${m.overdue}</td><td>${m.completion_rate}%</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No assigned tasks yet.</td></tr>'}</table></div></div>
  </div>`);
}

/* ---------- Projects list ---------- */
async function projectsView() {
  const st = { search: '', page: 1 };
  layout(`<div class="row between"><h1>Projects</h1>${isMgr() ? '<button class="btn" id="new">+ New Project</button>' : ''}</div>
    <div class="card"><div class="filters"><input id="s" placeholder="Search projects..."></div><div id="list"></div></div>`);
  async function load() {
    const d = await api('/projects?' + qs({ ...st, limit: 10 }));
    $('#list').innerHTML = `<div class="tablewrap"><table><tr><th>Name</th><th>Manager</th><th>Deadline</th><th>Progress</th></tr>
      ${d.items.map((p) => { const pc = p.task_count ? Math.round((p.completed_count / p.task_count) * 100) : 0;
        return `<tr class="click" data-id="${p.id}"><td><b>${esc(p.name)}</b><div class="muted">${esc(p.description)}</div></td><td>${esc(p.manager_name || '-')}</td><td>${fmtDate(p.deadline)}</td>
        <td style="min-width:120px"><div class="bar"><i style="width:${pc}%"></i></div><span class="muted">${p.completed_count}/${p.task_count} tasks</span></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No projects found.</td></tr>'}</table></div>${pager(d.pagination)}`;
    $$('tr.click', $('#list')).forEach((r) => (r.onclick = () => go('#/projects/' + r.dataset.id)));
    bindPager($('#list'), (p) => { st.page = p; load(); });
  }
  $('#s').oninput = debounce((e) => { st.search = e.target.value; st.page = 1; load(); });
  if ($('#new')) $('#new').onclick = () => projectForm(null, load);
  await load();
}

async function projectForm(p, done) {
  let managers = [];
  if (me.role === 'Admin') managers = (await api('/users?limit=100')).items.filter((u) => u.role !== 'Team Member');
  const m = modal(`<h2>${p ? 'Edit' : 'New'} Project</h2><form id="pf">
    <label>Name</label><input name="name" required minlength="2" value="${esc(p?.name)}">
    <label>Description</label><textarea name="description">${esc(p?.description)}</textarea>
    <label>Deadline</label><input type="date" name="deadline" value="${esc(p?.deadline)}">
    ${me.role === 'Admin' ? `<label>Project Manager</label><select name="manager_id">${opts(managers.map((u) => [u.id, `${u.name} (${u.role})`]), p?.manager_id ?? me.id)}</select>` : ''}
    <p class="err" id="pe"></p><div class="row"><button class="btn">Save</button><button type="button" class="btn sec" data-close>Cancel</button></div></form>`);
  $('#pf', m.el).onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.deadline = b.deadline || null; if (b.manager_id) b.manager_id = Number(b.manager_id); else delete b.manager_id;
    try { await api(p ? '/projects/' + p.id : '/projects', { method: p ? 'PUT' : 'POST', body: b }); m.close(); toast('Project saved'); done(); }
    catch (err) { $('#pe', m.el).textContent = err.message; }
  };
}

/* ---------- Project detail ---------- */
async function projectView(id) {
  const p = await api('/projects/' + id);
  const canManage = me.role === 'Admin' || p.manager_id === me.id;
  const assignable = [...(p.manager ? [p.manager] : []), ...p.members];
  const st = { search: '', status: '', priority: '', assignee_id: '', sort: 'created_at', order: 'desc', page: 1 };
  layout(`<p><a href="#/projects">&larr; Projects</a></p>
   <div class="card"><div class="row between"><div><h1 style="margin:0">${esc(p.name)}</h1><p class="muted">${esc(p.description)}</p>
     <p class="muted">Manager: <b>${esc(p.manager?.name || '-')}</b> &middot; Deadline: ${fmtDate(p.deadline)}</p></div>
     ${canManage ? '<div class="row"><button class="btn sec" id="edit">Edit</button><button class="btn danger" id="del">Delete</button></div>' : ''}</div></div>
   <div class="split"><div class="card" style="flex:1 1 260px;max-width:340px"><h2>Team Members</h2><div id="members"></div>
     ${canManage ? '<div class="row" style="margin-top:.6rem"><select id="addsel" style="flex:1"></select><button class="btn sm" id="addm">Add</button></div>' : ''}</div>
   <div class="card" style="flex:3 1 480px"><div class="row between"><h2>Tasks</h2>${canManage ? '<button class="btn" id="newt">+ New Task</button>' : ''}</div>
     <div class="filters"><input id="ts" placeholder="Search tasks...">
       <select id="tst">${opts(STATUSES, '', 'All statuses')}</select><select id="tpr">${opts(PRIORITIES, '', 'All priorities')}</select>
       <select id="tas">${opts(assignable.map((u) => [u.id, u.name]), '', 'Any assignee')}</select>
       <select id="tso">${opts([['created_at:desc', 'Newest'], ['due_date:asc', 'Due soonest'], ['priority:desc', 'Priority high-low'], ['title:asc', 'Title A-Z']], '')}</select></div>
     <div id="tasks"></div></div></div>`);

  const renderMembers = () => {
    $('#members').innerHTML = p.members.map((u) => `<div class="row between" style="margin-bottom:.3rem"><span>${esc(u.name)}<br><span class="muted">${esc(u.email)}</span></span>
      ${canManage ? `<button class="btn danger sm" data-rm="${u.id}">Remove</button>` : ''}</div>`).join('') || '<p class="muted">No members yet.</p>';
    $$('[data-rm]').forEach((b) => (b.onclick = async () => { try { await api(`/projects/${id}/members/${b.dataset.rm}`, { method: 'DELETE' }); go('#/projects/' + id); } catch (e) { toast(e.message, 1); } }));
  };
  renderMembers();
  if (canManage) {
    const users = (await api('/users?limit=100')).items.filter((u) => u.id !== p.manager_id && !p.members.some((m) => m.id === u.id));
    $('#addsel').innerHTML = opts(users.map((u) => [u.id, u.name]), '', users.length ? 'Select user...' : 'No users available');
    $('#addm').onclick = async () => { const v = $('#addsel').value; if (!v) return;
      try { await api(`/projects/${id}/members`, { method: 'POST', body: { user_id: Number(v) } }); toast('Member added'); render(); } catch (e) { toast(e.message, 1); } };
    $('#edit').onclick = () => projectForm(p, render);
    $('#del').onclick = async () => { if (!confirm('Delete this project and all its tasks?')) return;
      try { await api('/projects/' + id, { method: 'DELETE' }); toast('Project deleted'); go('#/projects'); } catch (e) { toast(e.message, 1); } };
    $('#newt').onclick = () => taskModal(null, p, assignable, load);
  }

  async function load() {
    const d = await api('/tasks?' + qs({ ...st, project_id: id, limit: 10 }));
    $('#tasks').innerHTML = `<div class="tablewrap"><table><tr><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr>
      ${d.items.map((t) => `<tr class="click" data-id="${t.id}"><td>${esc(t.title)}</td><td>${badge(t.status)}</td><td>${badge(t.priority)}</td><td>${esc(t.assignee_name || '-')}</td>
      <td class="${isOverdue(t) ? 'overdue' : ''}">${fmtDate(t.due_date)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No tasks match.</td></tr>'}</table></div>${pager(d.pagination)}`;
    $$('tr.click', $('#tasks')).forEach((r) => (r.onclick = () => taskModal(Number(r.dataset.id), p, assignable, load)));
    bindPager($('#tasks'), (n) => { st.page = n; load(); });
  }
  const f = (sel, key) => ($(sel).onchange = (e) => { st[key] = e.target.value; st.page = 1; load(); });
  f('#tst', 'status'); f('#tpr', 'priority'); f('#tas', 'assignee_id');
  $('#ts').oninput = debounce((e) => { st.search = e.target.value; st.page = 1; load(); });
  $('#tso').onchange = (e) => { [st.sort, st.order] = e.target.value.split(':'); st.page = 1; load(); };
  await load();
}

/* ---------- Task modal (create / view / edit / comments / attachments) ---------- */
async function taskModal(taskId, project, assignable, onChange) {
  const t = taskId ? await api('/tasks/' + taskId) : null;
  const canManage = me.role === 'Admin' || project.manager_id === me.id;
  const canStatus = canManage || (t && t.assignee_id === me.id);
  const ro = canManage ? '' : 'disabled';
  const m = modal(`<div class="row between"><h2>${t ? 'Task #' + t.id : 'New Task'}</h2><button class="btn sec sm" data-close>Close</button></div>
   <form id="tf"><label>Title</label><input name="title" required minlength="2" value="${esc(t?.title)}" ${ro}>
    <label>Description</label><textarea name="description" ${ro}>${esc(t?.description)}</textarea>
    <div class="row"><div style="flex:1"><label>Priority</label><select name="priority" ${ro}>${opts(PRIORITIES, t?.priority || 'Medium')}</select></div>
     <div style="flex:1"><label>Status</label><select name="status" ${canStatus || !t ? '' : 'disabled'}>${opts(STATUSES, t?.status || 'To Do')}</select></div></div>
    <div class="row"><div style="flex:1"><label>Due date</label><input type="date" name="due_date" value="${esc(t?.due_date)}" ${ro}></div>
     <div style="flex:1"><label>Assignee</label><select name="assignee_id" ${ro}>${opts(assignable.map((u) => [u.id, u.name]), t?.assignee_id, 'Unassigned')}</select></div></div>
    <p class="err" id="te"></p>
    <div class="row">${canStatus ? '<button class="btn">Save</button>' : ''}${t && canManage ? '<button type="button" class="btn danger" id="dt">Delete</button>' : ''}</div></form>
   ${t ? `<hr><h2>Attachments</h2><div id="atts"></div><input type="file" id="file" style="margin-top:.5rem">
   <h2 style="margin-top:1rem">Comments</h2><div id="cms"></div>
   <div class="row" style="margin-top:.5rem"><input id="cb" placeholder="Write a comment..." style="flex:1"><button class="btn" id="cadd">Post</button></div>` : ''}`);

  $('#tf', m.el).onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    let body;
    if (t && !canManage) body = { status: fd.status };
    else { body = { ...fd, due_date: fd.due_date || null, assignee_id: fd.assignee_id ? Number(fd.assignee_id) : null }; if (!t) body.project_id = project.id; }
    try { await api(t ? '/tasks/' + t.id : '/tasks', { method: t ? 'PUT' : 'POST', body }); m.close(); toast('Task saved'); onChange(); }
    catch (err) { $('#te', m.el).textContent = err.message; }
  };
  if (!t) return;
  if (canManage) $('#dt', m.el).onclick = async () => { if (!confirm('Delete this task?')) return;
    try { await api('/tasks/' + t.id, { method: 'DELETE' }); m.close(); toast('Task deleted'); onChange(); } catch (e) { toast(e.message, 1); } };

  const drawAtts = () => {
    $('#atts', m.el).innerHTML = t.attachments.map((a) => `<div class="row between"><a href="#" data-dl="${a.id}" data-name="${esc(a.original_name)}">${esc(a.original_name)}</a>
      <span class="muted">${(a.size / 1024).toFixed(1)} KB - ${esc(a.user_name || '')} <a href="#" data-da="${a.id}" class="err">delete</a></span></div>`).join('') || '<p class="muted">No attachments.</p>';
    $$('[data-dl]', m.el).forEach((a) => (a.onclick = async (e) => { e.preventDefault();
      const r = await api(`/attachments/${a.dataset.dl}/download`, { raw: true }); if (!r.ok) return toast('Download failed', 1);
      const url = URL.createObjectURL(await r.blob()); const l = document.createElement('a'); l.href = url; l.download = a.dataset.name; l.click(); URL.revokeObjectURL(url); }));
    $$('[data-da]', m.el).forEach((a) => (a.onclick = async (e) => { e.preventDefault();
      try { await api('/attachments/' + a.dataset.da, { method: 'DELETE' }); t.attachments = t.attachments.filter((x) => x.id !== Number(a.dataset.da)); drawAtts(); } catch (er) { toast(er.message, 1); } }));
  };
  const drawComments = () => {
    $('#cms', m.el).innerHTML = t.comments.map((c) => `<div class="comment"><b>${esc(c.user_name || 'Unknown')}</b> <span class="muted">${esc(c.created_at)} UTC</span><div>${esc(c.body)}</div></div>`).join('') || '<p class="muted">No comments yet.</p>';
  };
  drawAtts(); drawComments();
  $('#file', m.el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try { const a = await api(`/tasks/${t.id}/attachments`, { method: 'POST', body: fd }); t.attachments.push({ ...a, user_name: me.name }); drawAtts(); toast('File uploaded'); }
    catch (er) { toast(er.message, 1); } e.target.value = '';
  };
  $('#cadd', m.el).onclick = async () => {
    const v = $('#cb', m.el).value.trim(); if (!v) return;
    try { t.comments.push(await api(`/tasks/${t.id}/comments`, { method: 'POST', body: { body: v } })); $('#cb', m.el).value = ''; drawComments(); } catch (er) { toast(er.message, 1); }
  };
}

/* ---------- Users (Admin) ---------- */
async function usersView() {
  layout('<h1>Users</h1><div class="card"><div id="ul"></div></div>');
  const st = { page: 1 };
  async function load() {
    const d = await api('/users?' + qs({ ...st, limit: 15 }));
    $('#ul').innerHTML = `<div class="tablewrap"><table><tr><th>Name</th><th>Email</th><th>Role</th></tr>${d.items.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
      <td>${u.id === me.id ? badge(u.role) : `<select data-u="${u.id}">${opts(ROLES, u.role)}</select>`}</td></tr>`).join('')}</table></div>${pager(d.pagination)}`;
    $$('[data-u]').forEach((s) => (s.onchange = async () => { try { await api(`/users/${s.dataset.u}/role`, { method: 'PUT', body: { role: s.value } }); toast('Role updated'); } catch (e) { toast(e.message, 1); load(); } }));
    bindPager($('#ul'), (p) => { st.page = p; load(); });
  }
  await load();
}

/* ---------- Audit log (Admin) ---------- */
async function auditView() {
  layout('<h1>Audit Log</h1><div class="card"><div class="filters"><select id="ent">' + opts(['user', 'project', 'task'], '', 'All entities') + '</select></div><div id="al"></div></div>');
  const st = { page: 1, entity: '' };
  async function load() {
    const d = await api('/audit-logs?' + qs({ ...st, limit: 20 }));
    $('#al').innerHTML = `<div class="tablewrap"><table><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr>${d.items.map((a) => `<tr><td>${esc(a.created_at)}</td><td>${esc(a.user_name || '-')}</td>
      <td>${esc(a.action)}</td><td>${esc(a.entity)} #${a.entity_id ?? ''}</td><td class="muted">${esc(a.details || '')}</td></tr>`).join('')}</table></div>${pager(d.pagination)}`;
    bindPager($('#al'), (p) => { st.page = p; load(); });
  }
  $('#ent').onchange = (e) => { st.entity = e.target.value; st.page = 1; load(); };
  await load();
}

/* ---------- Router ---------- */
async function render() {
  const [, route, id] = (location.hash || '#/dashboard').split('/');
  if (!token || !me) return authView(route === 'register' ? 'register' : 'login');
  try {
    if (route === 'projects') return id ? await projectView(id) : await projectsView();
    if (route === 'users' && me.role === 'Admin') return await usersView();
    if (route === 'audit' && me.role === 'Admin') return await auditView();
    if (route === 'dashboard') return await dashboardView();
    go('#/dashboard');
  } catch (e) { if (token) { layout(`<div class="card err">${esc(e.message)}</div>`); } }
}
window.addEventListener('hashchange', render);
render();

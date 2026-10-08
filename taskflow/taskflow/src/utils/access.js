const db = require('../db');
const { AppError } = require('./errors');

const isMember = (pid, uid) =>
  !!db.prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?').get(pid, uid);
const canView = (u, p) => u.role === 'Admin' || p.manager_id === u.id || isMember(p.id, u.id);
const canManage = (u, p) => u.role === 'Admin' || p.manager_id === u.id;

function loadProject(user, id, { manage = false } = {}) {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
  if (!p) throw new AppError(404, 'Project not found');
  if (!canView(user, p)) throw new AppError(403, 'You do not have access to this project');
  if (manage && !canManage(user, p)) throw new AppError(403, 'Only an admin or the project manager can do this');
  return p;
}

function loadTask(user, id) {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
  if (!t) throw new AppError(404, 'Task not found');
  const project = loadProject(user, t.project_id);
  return { task: t, project };
}

module.exports = { isMember, canView, canManage, loadProject, loadTask };

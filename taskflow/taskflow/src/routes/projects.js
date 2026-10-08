const router = require('express').Router();
const db = require('../db');
const { z, dateStr, pagination, like, paginate, pageMeta, audit, visibility } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { loadProject, isMember } = require('../utils/access');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const baseSchema = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  deadline: dateStr.nullable().optional(),
  manager_id: z.number().int().positive().nullable().optional(),
};
const createSchema = z.object(baseSchema);
const updateSchema = z.object(baseSchema).partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');
const listSchema = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(['name', 'deadline', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...pagination,
});

function assertManagerCandidate(id) {
  const u = db.prepare('SELECT role FROM users WHERE id=?').get(id);
  if (!u) throw new AppError(400, 'Manager user does not exist');
  if (u.role === 'Team Member') throw new AppError(400, 'Manager must have the Project Manager or Admin role');
}

router.get('/', validate(listSchema, 'query'), (req, res) => {
  const q = req.query; const vis = visibility(req.user);
  const where = [vis.sql]; const params = [...vis.params];
  if (q.search) { where.push(`(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')`); params.push(like(q.search), like(q.search)); }
  const W = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM projects p WHERE ${W}`).get(...params).c;
  const { limit, offset } = paginate(q);
  const items = db.prepare(`
    SELECT p.*, u.name AS manager_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'Completed') AS completed_count
    FROM projects p LEFT JOIN users u ON u.id = p.manager_id
    WHERE ${W} ORDER BY p.${q.sort} ${q.order.toUpperCase()} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items, pagination: pageMeta(total, q) });
});

router.post('/', authorize('Admin', 'Project Manager'), validate(createSchema), (req, res) => {
  const b = req.body;
  let managerId = req.user.id;
  if (req.user.role === 'Admin' && b.manager_id) { assertManagerCandidate(b.manager_id); managerId = b.manager_id; }
  const r = db.prepare('INSERT INTO projects (name,description,deadline,manager_id,created_by) VALUES (?,?,?,?,?)')
    .run(b.name, b.description ?? '', b.deadline ?? null, managerId, req.user.id);
  const id = Number(r.lastInsertRowid);
  audit(req.user.id, 'CREATE', 'project', id, { name: b.name });
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(id));
});

router.get('/:id', (req, res) => {
  const p = loadProject(req.user, Number(req.params.id));
  const manager = p.manager_id ? db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(p.manager_id) : null;
  const members = db.prepare(`SELECT u.id,u.name,u.email,u.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY u.name`).all(p.id);
  res.json({ ...p, manager, members });
});

router.put('/:id', validate(updateSchema), (req, res) => {
  const p = loadProject(req.user, Number(req.params.id), { manage: true });
  const b = req.body;
  if (b.manager_id !== undefined) {
    if (req.user.role !== 'Admin') throw new AppError(403, 'Only an admin can assign project managers');
    if (b.manager_id !== null) assertManagerCandidate(b.manager_id);
  }
  const m = { ...p, ...b };
  db.prepare(`UPDATE projects SET name=?,description=?,deadline=?,manager_id=?,updated_at=datetime('now') WHERE id=?`)
    .run(m.name, m.description, m.deadline ?? null, m.manager_id ?? null, p.id);
  audit(req.user.id, 'UPDATE', 'project', p.id, b);
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(p.id));
});

router.delete('/:id', (req, res) => {
  const p = loadProject(req.user, Number(req.params.id), { manage: true });
  db.prepare('DELETE FROM projects WHERE id=?').run(p.id);
  audit(req.user.id, 'DELETE', 'project', p.id, { name: p.name });
  res.status(204).end();
});

router.post('/:id/members', validate(z.object({ user_id: z.number().int().positive() })), (req, res) => {
  const p = loadProject(req.user, Number(req.params.id), { manage: true });
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.body.user_id);
  if (!user) throw new AppError(404, 'User not found');
  if (user.id === p.manager_id || isMember(p.id, user.id)) throw new AppError(409, 'User is already on this project');
  db.prepare('INSERT INTO project_members (project_id,user_id) VALUES (?,?)').run(p.id, user.id);
  audit(req.user.id, 'ADD_MEMBER', 'project', p.id, { user_id: user.id });
  res.status(201).json(user);
});

router.delete('/:id/members/:userId', (req, res) => {
  const p = loadProject(req.user, Number(req.params.id), { manage: true });
  const uid = Number(req.params.userId);
  const r = db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(p.id, uid);
  if (!r.changes) throw new AppError(404, 'Member not found on this project');
  db.prepare('UPDATE tasks SET assignee_id=NULL WHERE project_id=? AND assignee_id=?').run(p.id, uid);
  audit(req.user.id, 'REMOVE_MEMBER', 'project', p.id, { user_id: uid });
  res.status(204).end();
});

module.exports = router;

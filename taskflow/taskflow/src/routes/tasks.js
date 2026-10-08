const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const { z, dateStr, pagination, like, paginate, pageMeta, audit, visibility } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { loadProject, loadTask, canManage, isMember } = require('../utils/access');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const fields = {
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(config.PRIORITIES).optional(),
  status: z.enum(config.STATUSES).optional(),
  due_date: dateStr.nullable().optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
};
const createSchema = z.object({ project_id: z.number().int().positive(), ...fields });
const updateSchema = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');
const listSchema = z.object({
  project_id: z.coerce.number().int().positive().optional(),
  status: z.enum(config.STATUSES).optional(),
  priority: z.enum(config.PRIORITIES).optional(),
  assignee_id: z.coerce.number().int().positive().optional(),
  mine: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  search: z.string().trim().optional(),
  sort: z.enum(['due_date', 'priority', 'created_at', 'title']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...pagination,
});
const SORTS = {
  due_date: 't.due_date', created_at: 't.created_at', title: 't.title',
  priority: `CASE t.priority WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END`,
};

function assertAssignable(project, userId) {
  if (userId == null) return;
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!u) throw new AppError(400, 'Assignee does not exist');
  if (userId !== project.manager_id && !isMember(project.id, userId))
    throw new AppError(400, 'Assignee must be the project manager or a project member');
}

router.get('/', validate(listSchema, 'query'), (req, res) => {
  const q = req.query; const vis = visibility(req.user);
  const where = [vis.sql]; const params = [...vis.params];
  if (q.project_id) { where.push('t.project_id = ?'); params.push(q.project_id); }
  if (q.status) { where.push('t.status = ?'); params.push(q.status); }
  if (q.priority) { where.push('t.priority = ?'); params.push(q.priority); }
  if (q.assignee_id) { where.push('t.assignee_id = ?'); params.push(q.assignee_id); }
  if (q.mine === 'true') { where.push('t.assignee_id = ?'); params.push(req.user.id); }
  if (q.overdue === 'true') where.push(`t.status != 'Completed' AND t.due_date < date('now')`);
  if (q.search) { where.push(`(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')`); params.push(like(q.search), like(q.search)); }
  const W = where.join(' AND ');
  const from = `FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users a ON a.id = t.assignee_id`;
  const total = db.prepare(`SELECT COUNT(*) c ${from} WHERE ${W}`).get(...params).c;
  const { limit, offset } = paginate(q);
  const items = db.prepare(`SELECT t.*, p.name AS project_name, a.name AS assignee_name ${from} WHERE ${W}
    ORDER BY ${SORTS[q.sort]} ${q.order.toUpperCase()}, t.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ items, pagination: pageMeta(total, q) });
});

router.post('/', validate(createSchema), (req, res) => {
  const b = req.body;
  const project = loadProject(req.user, b.project_id, { manage: true });
  assertAssignable(project, b.assignee_id);
  const r = db.prepare(`INSERT INTO tasks (project_id,title,description,priority,status,due_date,assignee_id,created_by) VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.project_id, b.title, b.description ?? '', b.priority ?? 'Medium', b.status ?? 'To Do', b.due_date ?? null, b.assignee_id ?? null, req.user.id);
  const id = Number(r.lastInsertRowid);
  audit(req.user.id, 'CREATE', 'task', id, { title: b.title, project_id: b.project_id });
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(id));
});

router.get('/:id', (req, res) => {
  const { task } = loadTask(req.user, Number(req.params.id));
  const assignee = task.assignee_id ? db.prepare('SELECT id,name FROM users WHERE id=?').get(task.assignee_id) : null;
  const comments = db.prepare(`SELECT c.*, u.name AS user_name FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id`).all(task.id);
  const attachments = db.prepare(`SELECT a.id,a.original_name,a.mime_type,a.size,a.created_at,u.name AS user_name FROM attachments a LEFT JOIN users u ON u.id=a.user_id WHERE a.task_id=? ORDER BY a.id`).all(task.id);
  res.json({ ...task, assignee, comments, attachments });
});

router.put('/:id', validate(updateSchema), (req, res) => {
  const { task, project } = loadTask(req.user, Number(req.params.id));
  const b = req.body;
  if (!canManage(req.user, project)) {
    // Assigned team members may only move their own task through the workflow
    const onlyStatus = Object.keys(b).every((k) => k === 'status');
    if (task.assignee_id !== req.user.id || !onlyStatus)
      throw new AppError(403, 'Only the project manager can edit tasks; assignees may update status only');
  }
  if (b.assignee_id !== undefined) assertAssignable(project, b.assignee_id);
  const m = { ...task, ...b };
  db.prepare(`UPDATE tasks SET title=?,description=?,priority=?,status=?,due_date=?,assignee_id=?,updated_at=datetime('now') WHERE id=?`)
    .run(m.title, m.description, m.priority, m.status, m.due_date ?? null, m.assignee_id ?? null, task.id);
  audit(req.user.id, 'UPDATE', 'task', task.id, b);
  res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(task.id));
});

router.delete('/:id', (req, res) => {
  const { task, project } = loadTask(req.user, Number(req.params.id));
  if (!canManage(req.user, project)) throw new AppError(403, 'Only an admin or the project manager can delete tasks');
  db.prepare('DELETE FROM tasks WHERE id=?').run(task.id);
  audit(req.user.id, 'DELETE', 'task', task.id, { title: task.title });
  res.status(204).end();
});

// ---- Comments ----
router.post('/:id/comments', validate(z.object({ body: z.string().trim().min(1).max(2000) })), (req, res) => {
  const { task } = loadTask(req.user, Number(req.params.id));
  const r = db.prepare('INSERT INTO comments (task_id,user_id,body) VALUES (?,?,?)').run(task.id, req.user.id, req.body.body);
  audit(req.user.id, 'COMMENT', 'task', task.id);
  res.status(201).json(db.prepare('SELECT c.*, u.name AS user_name FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=?').get(r.lastInsertRowid));
});

router.delete('/:id/comments/:commentId', (req, res) => {
  const { task, project } = loadTask(req.user, Number(req.params.id));
  const c = db.prepare('SELECT * FROM comments WHERE id=? AND task_id=?').get(Number(req.params.commentId), task.id);
  if (!c) throw new AppError(404, 'Comment not found');
  if (c.user_id !== req.user.id && !canManage(req.user, project)) throw new AppError(403, 'You can only delete your own comments');
  db.prepare('DELETE FROM comments WHERE id=?').run(c.id);
  audit(req.user.id, 'DELETE_COMMENT', 'task', task.id);
  res.status(204).end();
});

module.exports = router;

const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const { z, pagination, like, paginate, pageMeta, audit } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const listSchema = z.object({ search: z.string().trim().optional(), role: z.enum(config.ROLES).optional(), ...pagination });

router.get('/', validate(listSchema, 'query'), (req, res) => {
  const q = req.query;
  const where = ['1=1']; const params = [];
  if (q.search) { where.push(`(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')`); params.push(like(q.search), like(q.search)); }
  if (q.role) { where.push('role = ?'); params.push(q.role); }
  const total = db.prepare(`SELECT COUNT(*) c FROM users WHERE ${where.join(' AND ')}`).get(...params).c;
  const { limit, offset } = paginate(q);
  const items = db.prepare(`SELECT id,name,email,role,created_at FROM users WHERE ${where.join(' AND ')} ORDER BY name LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  res.json({ items, pagination: pageMeta(total, q) });
});

router.put('/:id/role', authorize('Admin'), validate(z.object({ role: z.enum(config.ROLES) })), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(id);
  if (!user) throw new AppError(404, 'User not found');
  if (id === req.user.id) throw new AppError(400, 'You cannot change your own role');
  db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, id);
  audit(req.user.id, 'UPDATE_ROLE', 'user', id, { from: user.role, to: req.body.role });
  res.json({ ...user, role: req.body.role });
});

module.exports = router;

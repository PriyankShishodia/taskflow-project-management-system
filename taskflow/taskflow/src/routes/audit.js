const router = require('express').Router();
const db = require('../db');
const { z, pagination, paginate, pageMeta } = require('../utils/helpers');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('Admin'));

const schema = z.object({
  entity: z.string().trim().optional(),
  action: z.string().trim().optional(),
  user_id: z.coerce.number().int().optional(),
  ...pagination,
});

router.get('/', validate(schema, 'query'), (req, res) => {
  const q = req.query; const where = ['1=1']; const params = [];
  if (q.entity) { where.push('a.entity = ?'); params.push(q.entity); }
  if (q.action) { where.push('a.action = ?'); params.push(q.action.toUpperCase()); }
  if (q.user_id) { where.push('a.user_id = ?'); params.push(q.user_id); }
  const W = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs a WHERE ${W}`).get(...params).c;
  const { limit, offset } = paginate(q);
  const items = db.prepare(`SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${W} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  res.json({ items, pagination: pageMeta(total, q) });
});

module.exports = router;

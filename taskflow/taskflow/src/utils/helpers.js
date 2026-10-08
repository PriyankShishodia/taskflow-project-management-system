const { z } = require('zod');
const db = require('../db');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};
const like = (s) => `%${String(s).replace(/[%_\\]/g, (c) => '\\' + c)}%`;
const paginate = ({ page, limit }) => ({ limit, offset: (page - 1) * limit });
const pageMeta = (total, { page, limit }) => ({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });

function audit(userId, action, entity, entityId, details) {
  db.prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)')
    .run(userId ?? null, action, entity, entityId ?? null, details ? JSON.stringify(details) : null);
}

// SQL fragment limiting rows to projects (alias p) the user may see
function visibility(user) {
  return {
    sql: `(? = 1 OR p.manager_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?))`,
    params: [user.role === 'Admin' ? 1 : 0, user.id, user.id],
  };
}

module.exports = { z, dateStr, pagination, like, paginate, pageMeta, audit, visibility };

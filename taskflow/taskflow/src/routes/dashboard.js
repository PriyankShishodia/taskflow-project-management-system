const router = require('express').Router();
const db = require('../db');
const { visibility } = require('../utils/helpers');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const v = visibility(req.user);
  const tFrom = `FROM tasks t JOIN projects p ON p.id = t.project_id WHERE ${v.sql}`;

  const projectProgress = db.prepare(`
    SELECT p.id, p.name, p.deadline, COUNT(t.id) AS total,
           COALESCE(SUM(t.status = 'Completed'), 0) AS completed
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE ${v.sql} GROUP BY p.id ORDER BY p.created_at DESC LIMIT 20`).all(...v.params)
    .map((r) => ({ ...r, percent: r.total ? Math.round((r.completed / r.total) * 100) : 0 }));

  const byStatus = db.prepare(`SELECT t.status AS key, COUNT(*) AS count ${tFrom} GROUP BY t.status`).all(...v.params);
  const byPriority = db.prepare(`SELECT t.priority AS key, COUNT(*) AS count ${tFrom} GROUP BY t.priority`).all(...v.params);
  const totals = db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(t.status='Completed'),0) AS completed,
      COALESCE(SUM(t.status!='Completed'),0) AS pending,
      COALESCE(SUM(t.status!='Completed' AND t.due_date < date('now')),0) AS overdue ${tFrom}`).get(...v.params);

  const upcomingTasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority, t.status, p.name AS project_name ${tFrom}
    AND t.status != 'Completed' AND t.due_date BETWEEN date('now') AND date('now','+14 day')
    ORDER BY t.due_date LIMIT 10`).all(...v.params);
  const upcomingProjects = db.prepare(`
    SELECT p.id, p.name, p.deadline FROM projects p
    WHERE ${v.sql} AND p.deadline BETWEEN date('now') AND date('now','+30 day') ORDER BY p.deadline LIMIT 10`).all(...v.params);

  const team = db.prepare(`
    SELECT u.id, u.name,
      COUNT(t.id) AS assigned,
      COALESCE(SUM(t.status='Completed'),0) AS completed,
      COALESCE(SUM(t.status!='Completed' AND t.due_date < date('now')),0) AS overdue
    FROM tasks t JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = t.assignee_id
    WHERE ${v.sql} GROUP BY u.id ORDER BY completed DESC, assigned DESC LIMIT 15`).all(...v.params)
    .map((r) => ({ ...r, completion_rate: r.assigned ? Math.round((r.completed / r.assigned) * 100) : 0 }));

  res.json({
    projectProgress,
    taskStatistics: { totals, byStatus, byPriority },
    completedVsPending: { completed: totals.completed, pending: totals.pending },
    upcomingDeadlines: { tasks: upcomingTasks, projects: upcomingProjects },
    teamPerformance: team,
  });
});

module.exports = router;

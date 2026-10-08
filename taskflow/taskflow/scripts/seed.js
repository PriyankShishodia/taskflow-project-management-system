// Demo data:  npm run seed
const bcrypt = require('bcryptjs');
const db = require('../src/db');

if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) { console.log('Database already has users - skipping seed.'); process.exit(0); }
const hash = bcrypt.hashSync('Password123', 12);
const addUser = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
const admin = addUser.run('Alice Admin', 'admin@example.com', hash, 'Admin').lastInsertRowid;
const pm = addUser.run('Pat Manager', 'pm@example.com', hash, 'Project Manager').lastInsertRowid;
const bob = addUser.run('Bob Builder', 'bob@example.com', hash, 'Team Member').lastInsertRowid;
const cara = addUser.run('Cara Coder', 'cara@example.com', hash, 'Team Member').lastInsertRowid;

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const proj = db.prepare('INSERT INTO projects (name,description,deadline,manager_id,created_by) VALUES (?,?,?,?,?)');
const p1 = proj.run('Website Redesign', 'Refresh the marketing site', day(25), pm, admin).lastInsertRowid;
const p2 = proj.run('Mobile App MVP', 'First release of the mobile app', day(60), pm, admin).lastInsertRowid;
const mem = db.prepare('INSERT INTO project_members (project_id,user_id) VALUES (?,?)');
[[p1, bob], [p1, cara], [p2, cara]].forEach((r) => mem.run(...r));

const task = db.prepare('INSERT INTO tasks (project_id,title,description,priority,status,due_date,assignee_id,created_by) VALUES (?,?,?,?,?,?,?,?)');
[
  [p1, 'Design wireframes', 'Low-fi wireframes for all pages', 'High', 'Completed', day(-3), bob],
  [p1, 'Build landing page', 'Implement hero and pricing sections', 'High', 'In Progress', day(5), cara],
  [p1, 'Write copy', 'Marketing copy for the new site', 'Medium', 'To Do', day(9), bob],
  [p1, 'Fix navbar bug', 'Menu overlaps on mobile', 'Low', 'To Do', day(-1), cara],
  [p2, 'Set up CI pipeline', 'Lint, test, build', 'Medium', 'Completed', day(-5), cara],
  [p2, 'Auth screens', 'Login / signup UI', 'High', 'In Progress', day(12), cara],
].forEach((t) => task.run(...t, pm));
console.log('Seeded. Logins (password: Password123): admin@example.com, pm@example.com, bob@example.com, cara@example.com');

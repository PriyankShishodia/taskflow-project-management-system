process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'taskflow-test-uploads');

const request = require('supertest');
const app = require('../src/app');

const api = request(app);
const auth = (t) => ({ Authorization: `Bearer ${t}` });
let admin, member, pmUser, pmTok, project, task;

async function register(name, email) {
  const r = await api.post('/api/auth/register').send({ name, email, password: 'Password123' });
  return r.body;
}

beforeAll(async () => {
  admin = await register('Admin', 'admin@test.com');      // first user -> Admin
  member = await register('Member', 'member@test.com');
  pmUser = await register('Manager', 'pm@test.com');
  await api.put(`/api/users/${pmUser.user.id}/role`).set(auth(admin.token)).send({ role: 'Project Manager' });
  pmTok = (await api.post('/api/auth/login').send({ email: 'pm@test.com', password: 'Password123' })).body.token;
});

describe('Auth', () => {
  test('first user is Admin, later users are Team Members', () => {
    expect(admin.user.role).toBe('Admin');
    expect(member.user.role).toBe('Team Member');
  });
  test('password is never returned', () => expect(JSON.stringify(admin)).not.toMatch(/password/i));
  test('rejects duplicate email', async () => {
    const r = await api.post('/api/auth/register').send({ name: 'X Y', email: 'admin@test.com', password: 'Password123' });
    expect(r.status).toBe(409);
  });
  test('validates input', async () => {
    const r = await api.post('/api/auth/register').send({ name: 'A', email: 'bad', password: '123' });
    expect(r.status).toBe(400);
    expect(r.body.details.length).toBeGreaterThan(0);
  });
  test('rejects wrong password and missing token', async () => {
    expect((await api.post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' })).status).toBe(401);
    expect((await api.get('/api/projects')).status).toBe(401);
  });
});

describe('Projects & RBAC', () => {
  test('team member cannot create project', async () => {
    const r = await api.post('/api/projects').set(auth(member.token)).send({ name: 'Nope' });
    expect(r.status).toBe(403);
  });
  test('project manager creates project and becomes its manager', async () => {
    const r = await api.post('/api/projects').set(auth(pmTok)).send({ name: 'Apollo', deadline: '2030-01-01' });
    expect(r.status).toBe(201);
    expect(r.body.manager_id).toBe(pmUser.user.id);
    project = r.body;
  });
  test('non-member cannot see the project', async () => {
    expect((await api.get(`/api/projects/${project.id}`).set(auth(member.token))).status).toBe(403);
    const list = await api.get('/api/projects').set(auth(member.token));
    expect(list.body.items).toHaveLength(0);
  });
  test('manager adds member, who can then view it', async () => {
    const r = await api.post(`/api/projects/${project.id}/members`).set(auth(pmTok)).send({ user_id: member.user.id });
    expect(r.status).toBe(201);
    expect((await api.get(`/api/projects/${project.id}`).set(auth(member.token))).status).toBe(200);
  });
  test('only admin can reassign manager', async () => {
    const r = await api.put(`/api/projects/${project.id}`).set(auth(pmTok)).send({ manager_id: admin.user.id });
    expect(r.status).toBe(403);
  });
  test('search and pagination', async () => {
    const r = await api.get('/api/projects?search=apo&page=1&limit=5').set(auth(admin.token));
    expect(r.body.items).toHaveLength(1);
    expect(r.body.pagination.total).toBe(1);
  });
});

describe('Tasks', () => {
  test('manager creates and assigns a task', async () => {
    const r = await api.post('/api/tasks').set(auth(pmTok))
      .send({ project_id: project.id, title: 'Write spec', priority: 'High', due_date: '2020-01-01', assignee_id: member.user.id });
    expect(r.status).toBe(201);
    task = r.body;
  });
  test('rejects invalid priority and non-member assignee', async () => {
    expect((await api.post('/api/tasks').set(auth(pmTok)).send({ project_id: project.id, title: 'Bad', priority: 'Urgent' })).status).toBe(400);
    expect((await api.post('/api/tasks').set(auth(pmTok)).send({ project_id: project.id, title: 'Bad', assignee_id: admin.user.id })).status).toBe(400);
  });
  test('assignee may change status but not other fields', async () => {
    expect((await api.put(`/api/tasks/${task.id}`).set(auth(member.token)).send({ status: 'In Progress' })).status).toBe(200);
    expect((await api.put(`/api/tasks/${task.id}`).set(auth(member.token)).send({ title: 'Hacked' })).status).toBe(403);
  });
  test('filter, search and overdue', async () => {
    const r = await api.get('/api/tasks').query({ status: 'In Progress', priority: 'High', search: 'spec', overdue: 'true' }).set(auth(member.token));
    expect(r.body.items).toHaveLength(1);
  });
  test('comments and attachments', async () => {
    const c = await api.post(`/api/tasks/${task.id}/comments`).set(auth(member.token)).send({ body: 'On it' });
    expect(c.status).toBe(201);
    const f = await api.post(`/api/tasks/${task.id}/attachments`).set(auth(member.token)).attach('file', Buffer.from('hello'), 'note.txt');
    expect(f.status).toBe(201);
    const d = await api.get(`/api/attachments/${f.body.id}/download`).set(auth(member.token));
    expect(d.status).toBe(200);
    expect(d.text).toBe('hello');
    const blocked = await api.post(`/api/tasks/${task.id}/attachments`).set(auth(member.token)).attach('file', Buffer.from('x'), 'evil.exe');
    expect(blocked.status).toBe(400);
    const full = await api.get(`/api/tasks/${task.id}`).set(auth(member.token));
    expect(full.body.comments).toHaveLength(1);
    expect(full.body.attachments).toHaveLength(1);
  });
});

describe('Dashboard & audit', () => {
  test('dashboard returns all sections', async () => {
    const r = await api.get('/api/dashboard').set(auth(pmTok));
    expect(r.status).toBe(200);
    for (const k of ['projectProgress', 'taskStatistics', 'completedVsPending', 'upcomingDeadlines', 'teamPerformance']) expect(r.body).toHaveProperty(k);
    expect(r.body.taskStatistics.totals.overdue).toBe(1);
  });
  test('audit log is admin only and records actions', async () => {
    expect((await api.get('/api/audit-logs').set(auth(member.token))).status).toBe(403);
    const r = await api.get('/api/audit-logs?entity=task').set(auth(admin.token));
    expect(r.body.items.length).toBeGreaterThan(0);
  });
  test('unknown endpoint returns JSON 404', async () => {
    const r = await api.get('/api/nope').set(auth(admin.token));
    expect(r.status).toBe(404);
  });
});

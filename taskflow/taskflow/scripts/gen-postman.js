const fs = require('fs');
const H = [{ key: 'Content-Type', value: 'application/json' }];
const item = (name, method, path, body, test) => ({
  name,
  event: test ? [{ listen: 'test', script: { type: 'text/javascript', exec: test } }] : undefined,
  request: {
    method, header: body ? H : [],
    auth: path.startsWith('/auth/register') || path.startsWith('/auth/login') ? { type: 'noauth' } : undefined,
    url: { raw: '{{baseUrl}}' + path, host: ['{{baseUrl}}'], path: path.replace(/^\//, '').split('?')[0].split('/'), query: path.includes('?') ? path.split('?')[1].split('&').map((p) => ({ key: p.split('=')[0], value: p.split('=')[1] })) : undefined },
    body: body ? { mode: 'raw', raw: JSON.stringify(body, null, 2) } : undefined,
  },
});
const save = (v, expr) => [`const j = pm.response.json(); pm.collectionVariables.set('${v}', ${expr});`];
const folder = (name, items) => ({ name, item: items });

const col = {
  info: { name: 'TaskFlow API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run "Register Admin" (or Login) first - the JWT is stored automatically. Seed users (npm run seed): admin@example.com / pm@example.com / bob@example.com, password Password123.' },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://localhost:3000/api' }, { key: 'token', value: '' }, { key: 'projectId', value: '1' }, { key: 'taskId', value: '1' }, { key: 'userId', value: '2' }],
  item: [
    folder('Auth', [
      item('Register', 'POST', '/auth/register', { name: 'Alice Admin', email: 'alice@example.com', password: 'Password123' }, save('token', 'j.token')),
      item('Login', 'POST', '/auth/login', { email: 'admin@example.com', password: 'Password123' }, save('token', 'j.token')),
      item('Me', 'GET', '/auth/me'),
    ]),
    folder('Users', [
      item('List users', 'GET', '/users?search=&page=1&limit=10'),
      item('Change role (Admin)', 'PUT', '/users/{{userId}}/role', { role: 'Project Manager' }),
    ]),
    folder('Projects', [
      item('Create project', 'POST', '/projects', { name: 'Website Redesign', description: 'Refresh the site', deadline: '2026-12-31' }, save('projectId', 'j.id')),
      item('List projects', 'GET', '/projects?search=&sort=created_at&order=desc&page=1&limit=10'),
      item('Get project', 'GET', '/projects/{{projectId}}'),
      item('Update project', 'PUT', '/projects/{{projectId}}', { name: 'Website Redesign v2', deadline: '2027-01-15' }),
      item('Assign project manager (Admin)', 'PUT', '/projects/{{projectId}}', { manager_id: 2 }),
      item('Add team member', 'POST', '/projects/{{projectId}}/members', { user_id: 3 }),
      item('Remove team member', 'DELETE', '/projects/{{projectId}}/members/3'),
      item('Delete project', 'DELETE', '/projects/{{projectId}}'),
    ]),
    folder('Tasks', [
      item('Create task', 'POST', '/tasks', { project_id: 1, title: 'Design wireframes', description: 'Low-fi', priority: 'High', status: 'To Do', due_date: '2026-11-01', assignee_id: 3 }, save('taskId', 'j.id')),
      item('List / filter tasks', 'GET', '/tasks?project_id=1&status=To Do&priority=High&search=design&sort=due_date&order=asc&page=1&limit=10'),
      item('My overdue tasks', 'GET', '/tasks?mine=true&overdue=true'),
      item('Get task', 'GET', '/tasks/{{taskId}}'),
      item('Update task', 'PUT', '/tasks/{{taskId}}', { status: 'In Progress' }),
      item('Delete task', 'DELETE', '/tasks/{{taskId}}'),
    ]),
    folder('Comments & Attachments', [
      item('Add comment', 'POST', '/tasks/{{taskId}}/comments', { body: 'Working on it' }),
      item('Delete comment', 'DELETE', '/tasks/{{taskId}}/comments/1'),
      { name: 'Upload attachment', request: { method: 'POST', url: { raw: '{{baseUrl}}/tasks/{{taskId}}/attachments', host: ['{{baseUrl}}'], path: ['tasks', '{{taskId}}', 'attachments'] },
        body: { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [] }] } } },
      item('Download attachment', 'GET', '/attachments/1/download'),
      item('Delete attachment', 'DELETE', '/attachments/1'),
    ]),
    folder('Dashboard & Audit', [
      item('Dashboard', 'GET', '/dashboard'),
      item('Audit logs (Admin)', 'GET', '/audit-logs?entity=task&page=1&limit=20'),
      item('Health', 'GET', '/health'),
    ]),
  ],
};
fs.writeFileSync(__dirname + '/../docs/TaskFlow.postman_collection.json', JSON.stringify(col, null, 2));
console.log('Postman collection written');

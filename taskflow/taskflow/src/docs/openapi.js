// OpenAPI 3.0 spec, served by Swagger UI at /api/docs
const sec = [{ bearerAuth: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const pg = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
];
const q = (...names) => names.map((n) => ({ name: n, in: 'query', schema: { type: 'string' } }));
const body = (props, required = []) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', required, properties: props } } },
});
const S = { type: 'string' }, I = { type: 'integer' };
const op = (summary, tag, extra = {}) => ({ summary, tags: [tag], security: sec,
  responses: { 200: { description: 'OK' }, 400: { description: 'Validation error' }, 401: { description: 'Unauthenticated' }, 403: { description: 'Forbidden' }, 404: { description: 'Not found' } }, ...extra });
const pub = (summary, tag, extra) => ({ ...op(summary, tag, extra), security: [] });

const taskProps = {
  title: S, description: S, priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
  status: { type: 'string', enum: ['To Do', 'In Progress', 'Completed'] },
  due_date: { type: 'string', format: 'date' }, assignee_id: I,
};

module.exports = {
  openapi: '3.0.3',
  info: { title: 'TaskFlow - Project & Task Management API', version: '1.0.0',
    description: 'JWT-secured REST API. Click **Authorize** and paste the token from /auth/login.\n\nRoles: Admin, Project Manager, Team Member. The first registered user becomes Admin.' },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/auth/register': { post: pub('Register a new user', 'Auth', { requestBody: body({ name: S, email: S, password: { type: 'string', minLength: 8 } }, ['name', 'email', 'password']) }) },
    '/auth/login': { post: pub('Login and receive a JWT', 'Auth', { requestBody: body({ email: S, password: S }, ['email', 'password']) }) },
    '/auth/me': { get: op('Current user', 'Auth') },
    '/users': { get: op('List users (search, role, pagination)', 'Users', { parameters: [...q('search', 'role'), ...pg] }) },
    '/users/{id}/role': { put: op('Change a user role (Admin)', 'Users', { parameters: [id], requestBody: body({ role: { type: 'string', enum: ['Admin', 'Project Manager', 'Team Member'] } }, ['role']) }) },
    '/projects': {
      get: op('List visible projects', 'Projects', { parameters: [...q('search', 'sort', 'order'), ...pg] }),
      post: op('Create project (Admin / Project Manager)', 'Projects', { requestBody: body({ name: S, description: S, deadline: { type: 'string', format: 'date' }, manager_id: I }, ['name']) }),
    },
    '/projects/{id}': {
      get: op('Get project with members', 'Projects', { parameters: [id] }),
      put: op('Update project / assign manager (Admin)', 'Projects', { parameters: [id], requestBody: body({ name: S, description: S, deadline: S, manager_id: I }) }),
      delete: op('Delete project', 'Projects', { parameters: [id] }),
    },
    '/projects/{id}/members': { post: op('Add team member', 'Projects', { parameters: [id], requestBody: body({ user_id: I }, ['user_id']) }) },
    '/projects/{id}/members/{userId}': { delete: op('Remove team member', 'Projects', { parameters: [id, { ...id, name: 'userId' }] }) },
    '/tasks': {
      get: op('Search / filter / paginate tasks', 'Tasks', { parameters: [...q('project_id', 'status', 'priority', 'assignee_id', 'mine', 'overdue', 'search', 'sort', 'order'), ...pg] }),
      post: op('Create task', 'Tasks', { requestBody: body({ project_id: I, ...taskProps }, ['project_id', 'title']) }),
    },
    '/tasks/{id}': {
      get: op('Get task with comments and attachments', 'Tasks', { parameters: [id] }),
      put: op('Update task (assignees may update status only)', 'Tasks', { parameters: [id], requestBody: body(taskProps) }),
      delete: op('Delete task', 'Tasks', { parameters: [id] }),
    },
    '/tasks/{id}/comments': { post: op('Add comment', 'Comments', { parameters: [id], requestBody: body({ body: S }, ['body']) }) },
    '/tasks/{id}/comments/{commentId}': { delete: op('Delete comment', 'Comments', { parameters: [id, { ...id, name: 'commentId' }] }) },
    '/tasks/{id}/attachments': { post: op('Upload attachment (max 5 MB)', 'Attachments', { parameters: [id],
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } } }) },
    '/attachments/{id}/download': { get: op('Download attachment', 'Attachments', { parameters: [id] }) },
    '/attachments/{id}': { delete: op('Delete attachment', 'Attachments', { parameters: [id] }) },
    '/dashboard': { get: op('Dashboard: progress, stats, deadlines, completed vs pending, team performance', 'Dashboard') },
    '/audit-logs': { get: op('Audit logs (Admin)', 'Audit', { parameters: [...q('entity', 'action', 'user_id'), ...pg] }) },
    '/health': { get: pub('Health check', 'System') },
  },
};

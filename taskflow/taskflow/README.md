# TaskFlow - Project & Task Management System

Full-stack web app for managing projects, teams and tasks with JWT auth and role-based access.

**Stack:** Node.js 20+ · Express · SQLite (better-sqlite3) · Zod validation · bcrypt · JWT · Swagger UI · vanilla-JS responsive frontend (served by the same server, no build step) · Jest + Supertest · Docker.

## Quick start

```bash
npm install
cp .env.example .env      # set JWT_SECRET
npm run seed              # optional demo data
npm start                 # http://localhost:3000
```

- App: http://localhost:3000
- API docs (Swagger): http://localhost:3000/api/docs
- Demo logins after `npm run seed` (password `Password123`): `admin@example.com`, `pm@example.com`, `bob@example.com`, `cara@example.com`

### Docker
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
```
Data (SQLite DB + uploads) persists in the `taskflow-data` volume.

### Tests
```bash
npm test
```

## Roles & permissions

| Action | Admin | Project Manager | Team Member |
|---|---|---|---|
| Register / login | ✔ | ✔ | ✔ |
| Change user roles, view audit log | ✔ | | |
| Create project | ✔ | ✔ (becomes its manager) | |
| Assign a project manager | ✔ | | |
| Edit/delete project, add/remove members | ✔ | own projects | |
| Create / assign / edit / delete tasks | ✔ | own projects | |
| Update status of an assigned task | ✔ | ✔ | ✔ (own tasks) |
| View project & tasks, comment, attach files | all | own projects | projects they belong to |

The **first registered user becomes Admin**; everyone else registers as Team Member (roles can't be self-assigned). An Admin promotes users from the Users page.

## Features mapping

- **Auth:** registration, login, JWT, RBAC middleware
- **Projects:** CRUD, assign managers, add members, deadlines
- **Tasks:** CRUD, assign, priority (Low/Medium/High), status (To Do/In Progress/Completed), due dates, comments, file attachments (5 MB, executables blocked)
- **Dashboard:** project progress, task statistics, upcoming deadlines, completed vs pending, team performance
- **Technical:** responsive UI · RESTful APIs · Zod input validation · centralised exception handling · search/filter/sort/pagination · audit logs · bcrypt (cost 12) · Swagger docs · unit/integration tests · Docker

## Project structure

```
src/            Express app (routes, middleware, utils, OpenAPI spec)
public/         Frontend SPA (index.html, app.js, style.css)
database/       schema.sql
docs/           ER_DIAGRAM.md, TaskFlow.postman_collection.json
tests/          Jest + Supertest API tests
scripts/        seed.js, gen-postman.js
Dockerfile, docker-compose.yml
```

## Key endpoints (full list in Swagger / Postman)

| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | returns `{ token, user }` |
| GET | /api/projects?search=&page=&limit=&sort=&order= | only projects you can see |
| POST/PUT/DELETE | /api/projects[/:id] | |
| POST/DELETE | /api/projects/:id/members[/:userId] | |
| GET | /api/tasks?project_id=&status=&priority=&assignee_id=&mine=&overdue=&search=&sort=&page= | |
| POST/PUT/DELETE | /api/tasks[/:id] | |
| POST | /api/tasks/:id/comments · /api/tasks/:id/attachments | |
| GET | /api/dashboard | |
| GET | /api/audit-logs | Admin only |

Errors are JSON: `{ "error": "message", "details": [...] }` with proper 400/401/403/404/409/500 codes.

## Deployment

Any host that runs Docker works (Render, Railway, Fly.io, a VPS, etc.). Set `JWT_SECRET`, mount a persistent volume at `/app/data`, and expose port 3000. Put it behind HTTPS in production. For multi-instance scaling, swap SQLite for PostgreSQL (queries are plain SQL in `src/routes`).

## Submission checklist
GitHub repo (`git init && git add . && git commit`) · source code ✔ · `database/schema.sql` ✔ · `docs/ER_DIAGRAM.md` ✔ · Swagger at `/api/docs` ✔ · `docs/TaskFlow.postman_collection.json` ✔ · this README ✔ · deployment link (deploy via Docker as above).

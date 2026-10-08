const fs = require('fs');
const path = require('path');

// Minimal .env loader (no extra dependency)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES_IN || '8h',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads')),
  isTest: process.env.NODE_ENV === 'test',
  ROLES: ['Admin', 'Project Manager', 'Team Member'],
  STATUSES: ['To Do', 'In Progress', 'Completed'],
  PRIORITIES: ['Low', 'Medium', 'High'],
};

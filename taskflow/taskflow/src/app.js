const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const multer = require('multer');
const config = require('./config');
const { AppError } = require('./utils/errors');
const openapi = require('./docs/openapi');

const app = express();
app.disable('x-powered-by');

// API docs are mounted before Helmet so Swagger UI's assets are not blocked by CSP
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'TaskFlow API Docs' }));
app.get('/api/openapi.json', (_req, res) => res.json(openapi));

app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (!config.isTest) {
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' } }));
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/audit-logs', require('./routes/audit'));
app.use('/api', require('./routes/files'));

app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint not found')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Centralised exception handling
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof multer.MulterError)
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;

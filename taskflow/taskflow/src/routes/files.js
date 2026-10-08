const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const { audit } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { loadTask, canManage } = require('../utils/access');
const { authenticate } = require('../middleware/auth');

fs.mkdirSync(config.uploadDir, { recursive: true });
const BLOCKED = new Set(['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.scr', '.js', '.jar', '.php', '.vbs']);

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    BLOCKED.has(path.extname(file.originalname).toLowerCase()) ? cb(new AppError(400, 'This file type is not allowed')) : cb(null, true),
});

router.use(authenticate);

router.post('/tasks/:id/attachments', (req, res, next) => {
  // load/authorise first so rejected requests never write to disk
  try { loadTask(req.user, Number(req.params.id)); } catch (e) { return next(e); }
  upload.single('file')(req, res, (err) => (err ? next(err) : next()));
}, (req, res) => {
  const { task } = loadTask(req.user, Number(req.params.id));
  if (!req.file) throw new AppError(400, 'A file is required (form field "file")');
  const f = req.file;
  const r = db.prepare('INSERT INTO attachments (task_id,user_id,stored_name,original_name,mime_type,size) VALUES (?,?,?,?,?,?)')
    .run(task.id, req.user.id, f.filename, f.originalname, f.mimetype, f.size);
  audit(req.user.id, 'ATTACH', 'task', task.id, { file: f.originalname });
  res.status(201).json({ id: Number(r.lastInsertRowid), original_name: f.originalname, size: f.size, mime_type: f.mimetype });
});

function loadAttachment(user, id) {
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(id);
  if (!a) throw new AppError(404, 'Attachment not found');
  const { project } = loadTask(user, a.task_id);
  return { a, project };
}

router.get('/attachments/:id/download', (req, res) => {
  const { a } = loadAttachment(req.user, Number(req.params.id));
  const file = path.join(config.uploadDir, a.stored_name);
  if (!fs.existsSync(file)) throw new AppError(404, 'File missing on server');
  res.download(file, a.original_name);
});

router.delete('/attachments/:id', (req, res) => {
  const { a, project } = loadAttachment(req.user, Number(req.params.id));
  if (a.user_id !== req.user.id && !canManage(req.user, project)) throw new AppError(403, 'You can only delete your own attachments');
  db.prepare('DELETE FROM attachments WHERE id=?').run(a.id);
  fs.rm(path.join(config.uploadDir, a.stored_name), { force: true }, () => {});
  audit(req.user.id, 'DELETE_ATTACHMENT', 'task', a.task_id, { file: a.original_name });
  res.status(204).end();
});

module.exports = router;

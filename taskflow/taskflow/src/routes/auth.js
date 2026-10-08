const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { z, audit } = require('../utils/helpers');
const { AppError, wrap } = require('../utils/errors');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, 'must be at least 8 characters').max(100)
    .regex(/[A-Za-z]/, 'must contain a letter').regex(/\d/, 'must contain a number'),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpires });

// First registered user becomes Admin; everyone else starts as Team Member.
router.post('/register', validate(registerSchema), wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new AppError(409, 'Email already registered');
  const role = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0 ? 'Admin' : 'Team Member';
  const hash = await bcrypt.hash(password, 12);
  const { lastInsertRowid } = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name, email, hash, role);
  const user = { id: Number(lastInsertRowid), name, email, role };
  audit(user.id, 'REGISTER', 'user', user.id, { role });
  res.status(201).json({ token: sign(user), user });
}));

router.post('/login', validate(loginSchema), wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email);
  const ok = row && await bcrypt.compare(req.body.password, row.password_hash);
  if (!ok) throw new AppError(401, 'Invalid email or password');
  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  audit(user.id, 'LOGIN', 'user', user.id);
  res.json({ token: sign(user), user });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;

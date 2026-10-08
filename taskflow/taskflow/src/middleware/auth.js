const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { AppError } = require('../utils/errors');

function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new AppError(401, 'Authentication required');
  let payload;
  try { payload = jwt.verify(h.slice(7), config.jwtSecret); }
  catch { throw new AppError(401, 'Invalid or expired token'); }
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id=?').get(payload.id);
  if (!user) throw new AppError(401, 'User no longer exists');
  req.user = user;
  next();
}

const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError(403, `Requires role: ${roles.join(' or ')}`);
  next();
};

module.exports = { authenticate, authorize };

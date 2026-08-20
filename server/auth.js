// ============================================================
// Auth: JWT in httpOnly cookie (Bearer header also accepted).
// Role model per PRD §16. Field staff (STAFF) are structurally
// locked to /api/auth/* and /api/staff/* — financial data never
// reaches them because no other route will serve their token.
// ============================================================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '30d';

function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function getTokenFrom(req) {
  if (req.cookies && req.cookies.pdr_token) return req.cookies.pdr_token;
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFrom(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, phone, role, skills, is_driver, active, holiday_allowance, color FROM users WHERE id = ?').get(payload.uid);
    if (!user || !user.active) return res.status(401).json({ error: 'Account disabled' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — sign in again' });
  }
}

// Office/Admin only (the entire management API)
function requireOffice(req, res, next) {
  if (req.user.role === 'ADMIN' || req.user.role === 'OFFICE') return next();
  return res.status(403).json({ error: 'Not permitted' });
}

function requireAdmin(req, res, next) {
  if (req.user.role === 'ADMIN') return next();
  return res.status(403).json({ error: 'Owner/admin only' });
}

module.exports = { signToken, verifyPassword, hashPassword, requireAuth, requireOffice, requireAdmin };

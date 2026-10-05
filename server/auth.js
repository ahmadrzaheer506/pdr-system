// ============================================================
// Auth: JWT in httpOnly cookie (Bearer header also accepted).
// Role model per PRD §16. Field staff (STAFF) are structurally
// locked to /api/auth/* and /api/staff/* — financial data never
// reaches them because no other route will serve their token.
// ============================================================
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('./models');
const { plain } = require('./db');
const { ROLES, ROLE_VALUES, isValidRole } = require('./roles');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '30d';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const CSRF_COOKIE = 'pdr_csrf';
const SESSION_COOKIE = 'pdr_token';

function cookieSecure() {
  return (process.env.APP_URL || '').startsWith('https');
}

/**
 * Flags for the httpOnly session cookie (requirement 1.3).
 * SameSite=Lax; Secure only when APP_URL is https.
 */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_MS,
    path: '/',
  };
}

/**
 * Readable CSRF cookie (double-submit). Not httpOnly so the SPA can send X-CSRF-Token.
 */
function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_MS,
    path: '/',
  };
}

/**
 * Password rule for requirement 1.2 — applied on login and on every set/change.
 * @param {unknown} password
 * @returns {string|null} error message, or null if the password is acceptable
 */
function passwordError(password) {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

function signToken(user, csrf = crypto.randomBytes(32).toString('hex')) {
  const ver = Number(user.token_version) || 0;
  return jwt.sign({ uid: user.id, role: user.role, csrf, ver }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * Issue a 30-day JWT session: httpOnly cookie + matching CSRF cookie.
 * @param {import('express').Response} res
 * @param {{ id: number, role: string }} user
 */
function issueSession(res, user) {
  const csrf = crypto.randomBytes(32).toString('hex');
  const token = signToken(user, csrf);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
}

function clearSession(res) {
  const base = { path: '/', sameSite: 'lax', secure: cookieSecure() };
  res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function hashPassword(password) {
  const err = passwordError(password);
  if (err) throw new Error(err);
  return bcrypt.hashSync(password, 10);
}

function getTokenFrom(req) {
  if (req.cookies && req.cookies[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/**
 * Decode a session JWT without checking token_version (used to attribute logout).
 * @returns {{ uid: number, role?: string, ver?: number }|null}
 */
function readSessionPayload(req) {
  const token = getTokenFrom(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for cookie-backed sessions (requirement 1.3).
 * Bearer-only requests skip this check. Login and webhooks are exempt.
 */
function enforceCsrf(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (req.method === 'POST' && /\/api\/auth\/(login|forgot-password|reset-password)\/?$/.test(path)) return next();
  if (path.startsWith('/api/webhooks')) return next();

  const cookieJwt = req.cookies && req.cookies[SESSION_COOKIE];
  if (!cookieJwt) return next();

  let payload;
  try {
    payload = jwt.verify(cookieJwt, JWT_SECRET);
  } catch {
    return next();
  }

  const header = req.get('X-CSRF-Token');
  const cookieCsrf = req.cookies && req.cookies[CSRF_COOKIE];
  if (!header || !payload.csrf || header !== payload.csrf || header !== cookieCsrf) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  return next();
}

/** Wrap an async Express handler so rejections hit the error middleware. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function requireAuth(req, res, next) {
  const token = getTokenFrom(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(payload.uid, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'skills', 'is_driver', 'active', 'holiday_allowance', 'color', 'avatar_file', 'financials_restricted', 'token_version'],
    });
    if (!user || !user.active) return res.status(401).json({ error: 'Account disabled' });
    const tokenVer = payload.ver ?? 0;
    if (tokenVer !== (Number(user.token_version) || 0)) {
      return res.status(401).json({ error: 'Session expired — sign in again' });
    }
    const json = plain(user);
    delete json.token_version;
    req.user = json;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — sign in again' });
  }
}

/**
 * Management APIs: Director (ADMIN) and Office only. Operatives receive 403 (requirement 1.5).
 */
function requireOffice(req, res, next) {
  if (req.user.role === ROLES.ADMIN || req.user.role === ROLES.OFFICE) return next();
  return res.status(403).json({ error: 'Not permitted' });
}

function requireAdmin(req, res, next) {
  if (req.user.role === ROLES.ADMIN) return next();
  return res.status(403).json({ error: 'Owner/admin only' });
}

/**
 * Job costing / labour-cost figures for office users (requirement 1.6).
 * Director (ADMIN) always has access. Restricted OFFICE users do not.
 * Pay rates (hourly_cost, cis_status) are requirement 1.8: OFFICE may see them; only ADMIN sets them.
 * @param {{ role?: string, financials_restricted?: boolean }} user
 * @returns {boolean}
 */
function canSeeLabourCosts(user) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.OFFICE) return !user.financials_restricted;
  return false;
}

function requireLabourCosts(req, res, next) {
  if (canSeeLabourCosts(req.user)) return next();
  return res.status(403).json({ error: 'Not permitted' });
}

/**
 * Operatives cannot download quote/invoice PDFs via /api/files (requirement 1.5).
 * Non-PDF files (e.g. clock-out photos) remain available to a signed-in staff user.
 */
function forbidStaffPdfs(req, res, next) {
  const filename = req.params.filename || '';
  if (req.user && req.user.role === ROLES.STAFF && /\.pdf$/i.test(filename)) {
    return res.status(403).json({ error: 'Not permitted' });
  }
  return next();
}

module.exports = {
  signToken,
  issueSession,
  clearSession,
  readSessionPayload,
  sessionCookieOptions,
  csrfCookieOptions,
  enforceCsrf,
  verifyPassword,
  hashPassword,
  passwordError,
  MIN_PASSWORD_LENGTH,
  SESSION_MS,
  ROLES,
  ROLE_VALUES,
  isValidRole,
  requireAuth,
  requireOffice,
  requireAdmin,
  canSeeLabourCosts,
  requireLabourCosts,
  forbidStaffPdfs,
  asyncHandler,
};

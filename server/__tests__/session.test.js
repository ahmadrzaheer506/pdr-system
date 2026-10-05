jest.mock('../models', () => ({
  User: { findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { User } = require('../models');
const {
  signToken,
  issueSession,
  sessionCookieOptions,
  csrfCookieOptions,
  enforceCsrf,
  requireAuth,
  asyncHandler,
} = require('../auth');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', enforceCsrf);
app.post('/api/auth/login', (req, res) => {
  issueSession(res, { id: 7, role: 'ADMIN' });
  res.json({ user: { id: 7, role: 'ADMIN' } });
});
app.post('/api/secure', asyncHandler(requireAuth), (req, res) => {
  res.json({ ok: true, uid: req.user.id });
});
app.get('/api/me', asyncHandler(requireAuth), (req, res) => {
  res.json({ user: req.user });
});

function parseCookies(res) {
  const out = {};
  for (const line of res.headers['set-cookie'] || []) {
    const nv = line.split(';')[0];
    const i = nv.indexOf('=');
    out[nv.slice(0, i)] = decodeURIComponent(nv.slice(i + 1));
  }
  return out;
}

describe('session cookies (requirement 1.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByPk.mockResolvedValue({
      id: 7,
      name: 'Paul',
      role: 'ADMIN',
      active: true,
      toJSON() { return this; },
    });
  });

  test('session cookie is httpOnly; CSRF cookie is readable; SameSite=Lax; 30-day max-age', () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
      path: '/',
    });
    expect(csrfCookieOptions()).toMatchObject({
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
      path: '/',
    });
  });

  test('Secure is on only when APP_URL is https', () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = 'http://localhost:4000';
    expect(sessionCookieOptions().secure).toBe(false);
    process.env.APP_URL = 'https://crm.example.com';
    expect(sessionCookieOptions().secure).toBe(true);
    process.env.APP_URL = prev;
  });

  test('cookie session mutation requires a matching CSRF header', async () => {
    const login = await request(app).post('/api/auth/login').send({});
    const cookies = parseCookies(login);
    const jar = (login.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

    const denied = await request(app).post('/api/secure').set('Cookie', jar).send({});
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .post('/api/secure')
      .set('Cookie', jar)
      .set('X-CSRF-Token', cookies.pdr_csrf)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  test('GET requests do not need a CSRF header', async () => {
    const login = await request(app).post('/api/auth/login').send({});
    const jar = (login.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    const res = await request(app).get('/api/me').set('Cookie', jar);
    expect(res.status).toBe(200);
  });

  test('Bearer auth is accepted without a CSRF header', async () => {
    const token = signToken({ id: 7, role: 'ADMIN' }, 'csrf-not-used');
    const res = await request(app)
      .post('/api/secure')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
  });

  test('mismatched CSRF cookie is rejected', async () => {
    const login = await request(app).post('/api/auth/login').send({});
    const cookies = parseCookies(login);
    const tokenLine = (login.headers['set-cookie'] || []).find((c) => c.startsWith('pdr_token='));
    const jar = `${tokenLine.split(';')[0]}; pdr_csrf=forged`;
    const res = await request(app)
      .post('/api/secure')
      .set('Cookie', jar)
      .set('X-CSRF-Token', cookies.pdr_csrf)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('requireAuth Bearer (requirement 1.3)', () => {
  test('accepts Authorization Bearer', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, name: 'Paul', role: 'ADMIN', active: true, toJSON() { return this; },
    });
    const token = jwt.sign({ uid: 7, role: 'ADMIN' }, process.env.JWT_SECRET);
    const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

jest.mock('../models', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn() },
  SecurityEvent: { create: jest.fn() },
}));
jest.mock('../db', () => {
  const nodePath = require('path');
  const nodeOs = require('os');
  return {
    DATA_DIR: nodePath.join(nodeOs.tmpdir(), 'pdr-login-files'),
    plain: (row) => {
      if (row == null) return null;
      return typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    },
  };
});
jest.mock('../integrations/email', () => ({
  send: jest.fn(async () => ({ simulated: true })),
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { User, SecurityEvent } = require('../models');
const { hashPassword, enforceCsrf, verifyPassword } = require('../auth');
const email = require('../integrations/email');
const { hashResetToken } = require('../passwordReset');
const avatars = require('../avatars');
const authRoutes = require('../routes/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', enforceCsrf);
app.use('/api/auth', authRoutes);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

function csrfFrom(res) {
  const cookies = res.headers['set-cookie'] || [];
  const line = cookies.find((c) => c.startsWith('pdr_csrf='));
  return line ? decodeURIComponent(line.split(';')[0].slice('pdr_csrf='.length)) : '';
}

function stubUser(overrides = {}) {
  const password_hash = hashPassword(overrides.plainPassword || 'password123');
  const row = {
    id: 1,
    name: 'Paul Douglas',
    email: 'paul@pauldouglasroofing.co.uk',
    role: 'ADMIN',
    active: true,
    password_hash,
    skills: [],
    is_driver: false,
    password_reset_token: overrides.password_reset_token || null,
    password_reset_expires: overrides.password_reset_expires || null,
    ...overrides,
    save: jest.fn(async function save() { return this; }),
    toJSON() {
      const { save, toJSON, plainPassword, ...rest } = this;
      return rest;
    },
  };
  return row;
}

describe('POST /api/auth/login (requirement 1.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('signs in an existing user and does not return a JWT in the body', async () => {
    User.findOne.mockResolvedValue(stubUser());
    const res = await request(app).post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('paul@pauldouglasroofing.co.uk');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password_reset_token).toBeUndefined();
    expect(res.body.user.password_reset_expires).toBeUndefined();
    expect(res.body.user.token_version).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login_success', actor_user_id: 1, target_user_id: 1,
    }));
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => /^pdr_token=/.test(c) && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => /^pdr_csrf=/.test(c) && !/HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => /SameSite=Lax/i.test(c))).toBe(true);
    expect(cookies.some((c) => /Max-Age=2592000/i.test(c))).toBe(true);
  });

  test('looks up email case-insensitively', async () => {
    User.findOne.mockResolvedValue(stubUser());
    await request(app).post('/api/auth/login').send({
      email: '  PAUL@pauldouglasroofing.co.uk ',
      password: 'password123',
    });
    expect(User.findOne).toHaveBeenCalledWith({
      where: { email: { [require('sequelize').Op.iLike]: 'PAUL@pauldouglasroofing.co.uk' } },
    });
  });

  test('rejects missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('rejects passwords shorter than 8 characters on login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('rejects unknown email without leaking existence', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Wrong email or password');
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login_failure', actor_user_id: null, target_user_id: null, detail: 'nobody@example.com',
    }));
  });

  test('rejects wrong password', async () => {
    User.findOne.mockResolvedValue(stubUser());
    const res = await request(app).post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'wrongpass',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Wrong email or password');
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'login_failure', target_user_id: 1, detail: 'paul@pauldouglasroofing.co.uk',
    }));
    const logged = SecurityEvent.create.mock.calls[0][0];
    expect(JSON.stringify(logged)).not.toMatch(/wrongpass|password123/);
  });

  test('rejects disabled accounts', async () => {
    User.findOne.mockResolvedValue(stubUser({ active: false }));
    const res = await request(app).post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account disabled');
  });

  test('has no public registration route', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/logout (requirement 1.9)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('logs logout for the signed-in user', async () => {
    User.findOne.mockResolvedValue(stubUser());
    User.findByPk.mockResolvedValue(stubUser());
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    SecurityEvent.create.mockClear();
    const res = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfFrom(loginRes));
    expect(res.status).toBe(200);
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'logout', actor_user_id: 1, target_user_id: 1,
    }));
  });
});

describe('PUT /api/auth/password (requirement 1.2 set/change)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a new password shorter than 8 characters', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.put('/api/auth/password')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .send({ current: 'password123', next: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/);
    expect(user.save).not.toHaveBeenCalled();
  });

  test('updates the hash when the current password is correct', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const before = user.password_hash;
    const res = await agent.put('/api/auth/password')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .send({ current: 'password123', next: 'newpass99' });
    expect(res.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.password_hash).not.toBe(before);
    expect(user.token_version).toBe(1);
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'password_change', actor_user_id: 1, target_user_id: 1,
    }));

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error).toBe('Session expired — sign in again');
  });
});

describe('PUT /api/auth/profile', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates the signed-in user name and ignores email', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.put('/api/auth/profile')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .send({ name: '  Paul D.  ', email: 'hacker@example.com' });
    expect(res.status).toBe(200);
    expect(user.name).toBe('Paul D.');
    expect(user.email).toBe('paul@pauldouglasroofing.co.uk');
    expect(res.body.user.name).toBe('Paul D.');
    expect(res.body.user.email).toBe('paul@pauldouglasroofing.co.uk');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('rejects a blank name', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.put('/api/auth/profile')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
    expect(user.save).not.toHaveBeenCalled();
  });
});

describe('POST/DELETE /api/auth/avatar', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores a PNG and returns avatar_file on the user', async () => {
    const user = stubUser({ avatar_file: null });
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.post('/api/auth/avatar')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .attach('file', Buffer.from('png-bytes'), { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatar_file).toBe('avatar-1.png');
    expect(user.avatar_file).toBe('avatar-1.png');
  });

  test('rejects a non-image upload', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    User.findByPk.mockResolvedValue(user);
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.post('/api/auth/avatar')
      .set('X-CSRF-Token', csrfFrom(loginRes))
      .attach('file', Buffer.from('%PDF'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG and JPEG/);
  });

  test('GET /avatar?user= serves that staff photo', async () => {
    const admin = stubUser({ id: 1, avatar_file: 'avatar-1.png' });
    const staff = { id: 4, avatar_file: 'avatar-4.png' };
    User.findOne.mockResolvedValue(admin);
    User.findByPk.mockImplementation(async (id) => (Number(id) === 4 ? staff : admin));
    const send = jest.spyOn(avatars, 'sendAvatar').mockImplementation((res) => res.status(200).type('image/png').send('ok'));
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    const res = await agent.get('/api/auth/avatar?user=4');
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.anything(), 4, 'avatar-4.png');
    send.mockRestore();
  });
});

describe('login returns stored role values (requirement 1.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(['ADMIN', 'OFFICE', 'STAFF'])('returns role %s', async (role) => {
    User.findOne.mockResolvedValue(stubUser({ role }));
    const res = await request(app).post('/api/auth/login').send({
      email: 'paul@pauldouglasroofing.co.uk',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
  });
});

describe('POST /api/auth/forgot-password (requirement 1.7)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('always returns the same 200 for unknown emails', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If that email is on an account, we have sent a reset link.');
    expect(email.send).not.toHaveBeenCalled();
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'forgot_password', target_user_id: null, detail: 'nobody@example.com',
    }));
  });

  test('does not email a deactivated account and returns an inactive error', async () => {
    User.findOne.mockResolvedValue(stubUser({ active: false }));
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'paul@pauldouglasroofing.co.uk',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/account is inactive/i);
    expect(email.send).not.toHaveBeenCalled();
  });

  test('stores a hashed token and emails a 1-hour reset link', async () => {
    const user = stubUser();
    User.findOne.mockResolvedValue(user);
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'paul@pauldouglasroofing.co.uk',
    });
    expect(res.status).toBe(200);
    expect(user.save).toHaveBeenCalled();
    expect(user.password_reset_token).toMatch(/^[a-f0-9]{64}$/);
    expect(user.password_reset_expires.getTime()).toBeGreaterThan(Date.now());
    expect(email.send).toHaveBeenCalledWith(
      'paul@pauldouglasroofing.co.uk',
      'Reset your password',
      expect.objectContaining({
        actionUrl: expect.stringContaining('/reset-password?token='),
        actionLabel: 'Reset password',
      }),
    );
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'forgot_password',
      target_user_id: 1,
      detail: 'paul@pauldouglasroofing.co.uk',
    }));
    const logged = JSON.stringify(SecurityEvent.create.mock.calls.map((c) => c[0]));
    expect(logged).not.toMatch(/password_reset_token/);
    expect(logged).not.toContain(user.password_reset_token);
  });
});

describe('POST /api/auth/reset-password (requirement 1.7)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'a'.repeat(64),
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('rejects an invalid or expired token', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'deadbeef',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Reset link is invalid or has expired');
  });

  test('sets the new password and clears the token', async () => {
    const raw = 'a'.repeat(64);
    const user = stubUser({
      password_reset_token: hashResetToken(raw),
      password_reset_expires: new Date(Date.now() + 60 * 60 * 1000),
    });
    User.findOne.mockResolvedValue(user);
    const before = user.password_hash;
    const res = await request(app).post('/api/auth/reset-password').send({
      token: raw,
      password: 'newpass99',
    });
    expect(res.status).toBe(200);
    expect(user.password_hash).not.toBe(before);
    expect(verifyPassword({ password_hash: user.password_hash }, 'newpass99')).toBe(true);
    expect(user.password_reset_token).toBeNull();
    expect(user.password_reset_expires).toBeNull();
    expect(user.token_version).toBe(1);
    expect(user.save).toHaveBeenCalled();
    expect(SecurityEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'password_reset', target_user_id: 1,
    }));
    const logged = JSON.stringify(SecurityEvent.create.mock.calls.map((c) => c[0]));
    expect(logged).not.toContain(raw);
  });
});

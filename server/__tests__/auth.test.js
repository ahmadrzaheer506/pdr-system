const jwt = require('jsonwebtoken');

jest.mock('../models', () => ({
  User: { findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { User } = require('../models');
const { requireAuth, signToken, passwordError, hashPassword, MIN_PASSWORD_LENGTH } = require('../auth');

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects missing token', async () => {
    const res = mockRes();
    await requireAuth({ cookies: {}, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('loads the user via Sequelize findByPk', async () => {
    const user = {
      id: 7,
      name: 'Paul',
      email: 'paul@example.com',
      role: 'ADMIN',
      skills: ['roofer'],
      is_driver: true,
      active: true,
      toJSON() { return this; },
    };
    User.findByPk.mockResolvedValue(user);
    const token = signToken(user);
    const req = { cookies: { pdr_token: token }, headers: {} };
    const res = mockRes();
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(User.findByPk).toHaveBeenCalledWith(7, expect.objectContaining({
      attributes: expect.arrayContaining(['id', 'role', 'is_driver', 'active', 'financials_restricted', 'avatar_file']),
    }));
    expect(next).toHaveBeenCalled();
    expect(req.user.is_driver).toBe(true);
    expect(req.user.token_version).toBeUndefined();
  });

  test('rejects a JWT whose token_version no longer matches (requirement 1.9)', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, name: 'Paul', role: 'ADMIN', active: true, token_version: 2, toJSON() { return this; },
    });
    const token = signToken({ id: 7, role: 'ADMIN', token_version: 0 });
    const res = mockRes();
    const next = jest.fn();
    await requireAuth({ cookies: { pdr_token: token }, headers: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired — sign in again' });
  });

  test('accepts a JWT whose token_version matches', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, name: 'Paul', role: 'ADMIN', active: true, token_version: 3, toJSON() { return this; },
    });
    const token = signToken({ id: 7, role: 'ADMIN', token_version: 3 });
    const res = mockRes();
    const next = jest.fn();
    await requireAuth({ cookies: { pdr_token: token }, headers: {} }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects inactive accounts', async () => {
    User.findByPk.mockResolvedValue({ id: 1, active: false, toJSON() { return this; } });
    const token = jwt.sign({ uid: 1, role: 'STAFF' }, process.env.JWT_SECRET);
    const res = mockRes();
    await requireAuth({ cookies: { pdr_token: token }, headers: {} }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('accepts Authorization Bearer', async () => {
    User.findByPk.mockResolvedValue({
      id: 7, name: 'Paul', role: 'ADMIN', active: true, toJSON() { return this; },
    });
    const token = jwt.sign({ uid: 7, role: 'ADMIN' }, process.env.JWT_SECRET);
    const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('passwordError / hashPassword (requirement 1.2)', () => {
  test('requires at least 8 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordError('short')).toMatch(/at least 8 characters/);
    expect(passwordError('password123')).toBeNull();
  });

  test('hashPassword refuses a short password', () => {
    expect(() => hashPassword('abc')).toThrow(/at least 8 characters/);
  });
});

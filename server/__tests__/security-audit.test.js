jest.mock('../models', () => ({
  User: { findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn(), create: jest.fn() },
  SecurityEvent: { create: jest.fn(), findAll: jest.fn(), count: jest.fn() },
}));
jest.mock('../db', () => ({
  allSettings: jest.fn(),
  setSetting: jest.fn(),
  plain: (row) => {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((item) => (item && typeof item.toJSON === 'function' ? item.toJSON() : item));
    return typeof row.toJSON === 'function' ? row.toJSON() : row;
  },
}));
jest.mock('../integrations/registry', () => ({
  all: jest.fn(),
  recentEvents: jest.fn(),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN', name: 'Paul' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { SecurityEvent } = require('../models');
const { __setUser } = require('../auth');
const settings = require('../routes/settings');

const app = express();
app.use(express.json());
app.use('/api/settings', settings);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

function defaultRangeUtc() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

describe('GET /api/settings/security-events (requirement 1.9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    SecurityEvent.count.mockResolvedValue(0);
    SecurityEvent.findAll.mockResolvedValue([]);
  });

  test('ADMIN receives the newest events with actor and target, and no secrets', async () => {
    SecurityEvent.count.mockResolvedValue(1);
    SecurityEvent.findAll.mockResolvedValue([{
      toJSON: () => ({
        id: 11,
        action: 'login_failure',
        detail: 'jamie@example.com',
        created_at: '2026-09-21T12:00:00.000Z',
        actor: null,
        target: { id: 5, name: 'Jamie Staff', email: 'jamie@example.com' },
      }),
    }]);
    const res = await request(app).get('/api/settings/security-events');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      id: 11,
      action: 'login_failure',
      detail: 'jamie@example.com',
      actor: null,
      target: { id: 5, name: 'Jamie Staff', email: 'jamie@example.com' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/);
    const range = defaultRangeUtc();
    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      from: range.from,
      to: range.to,
    });
    expect(SecurityEvent.findAll).toHaveBeenCalledWith(expect.objectContaining({
      order: [['created_at', 'DESC']],
      limit: 20,
      offset: 0,
      where: {
        created_at: {
          [Op.gte]: `${range.from}T00:00:00.000Z`,
          [Op.lte]: `${range.to}T23:59:59.999Z`,
        },
      },
    }));
  });

  test('paginates by page and limit', async () => {
    SecurityEvent.count.mockResolvedValue(21);
    const res = await request(app)
      .get('/api/settings/security-events')
      .query({ from: '2026-09-01', to: '2026-09-29', page: 2, limit: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 21,
      page: 2,
      limit: 20,
      from: '2026-09-01',
      to: '2026-09-29',
    });
    expect(SecurityEvent.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 20,
      offset: 20,
      where: {
        created_at: {
          [Op.gte]: '2026-09-01T00:00:00.000Z',
          [Op.lte]: '2026-09-29T23:59:59.999Z',
        },
      },
    }));
  });

  test('accepts a 100-row page and clamps higher limits', async () => {
    SecurityEvent.count.mockResolvedValue(200);
    const allowed = await request(app)
      .get('/api/settings/security-events')
      .query({ from: '2026-09-01', to: '2026-09-29', page: 1, limit: 100 });
    expect(allowed.status).toBe(200);
    expect(allowed.body.limit).toBe(100);
    expect(SecurityEvent.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 100,
      offset: 0,
    }));

    const clamped = await request(app)
      .get('/api/settings/security-events')
      .query({ from: '2026-09-01', to: '2026-09-29', page: 1, limit: 200 });
    expect(clamped.status).toBe(200);
    expect(clamped.body.limit).toBe(100);
    expect(SecurityEvent.findAll).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 100,
      offset: 0,
    }));
  });

  test('rejects an inverted date range', async () => {
    const res = await request(app)
      .get('/api/settings/security-events')
      .query({ from: '2026-09-29', to: '2026-09-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('from must be on or before to');
    expect(SecurityEvent.findAll).not.toHaveBeenCalled();
  });

  test.each(['OFFICE', 'STAFF'])('%s receives 403', async (role) => {
    __setUser({ id: 2, role, name: 'Other' });
    const res = await request(app).get('/api/settings/security-events');
    expect(res.status).toBe(403);
    expect(SecurityEvent.findAll).not.toHaveBeenCalled();
    expect(SecurityEvent.count).not.toHaveBeenCalled();
  });
});

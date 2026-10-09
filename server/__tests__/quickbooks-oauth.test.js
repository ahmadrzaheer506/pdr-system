jest.mock('../integrations/gcal', () => ({
  isConfigured: jest.fn(() => false),
  authUrl: jest.fn(),
  signOauthState: jest.fn(),
  parseOauthState: jest.fn(),
  exchangeCode: jest.fn(),
  disconnect: jest.fn(),
  status: jest.fn(),
}));
jest.mock('../calendarSync', () => ({ backfillUser: jest.fn() }));
jest.mock('../integrations/quickbooks', () => ({
  isConfigured: jest.fn(() => true),
  authUrl: jest.fn((state) => `https://appcenter.intuit.com/connect/oauth2?state=${state}`),
  signOauthState: jest.fn((id) => `qbo-state-${id}`),
  parseOauthState: jest.fn((state) => {
    if (state === 'qbo-state-1') return 1;
    throw new Error('Invalid OAuth state');
  }),
  exchangeCode: jest.fn(async () => true),
  disconnect: jest.fn(async () => true),
}));
jest.mock('../services/messenger', () => ({ ingestInbound: jest.fn() }));
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
const { __setUser } = require('../auth');
const qbo = require('../integrations/quickbooks');
const integrations = require('../routes/integrations');
const { spaOrigin } = require('../passwordReset');

const app = express();
app.use(express.json());
app.use('/api/integrations', integrations);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('QuickBooks OAuth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    qbo.isConfigured.mockReturnValue(true);
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
  });

  test('only an owner can start Connect', async () => {
    const res = await request(app).get('/api/integrations/quickbooks/connect');
    expect(res.status).toBe(200);
    expect(qbo.signOauthState).toHaveBeenCalledWith(1);
    expect(res.body.url).toContain('qbo-state-1');
  });

  test('office staff cannot start Connect', async () => {
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    const res = await request(app).get('/api/integrations/quickbooks/connect');
    expect(res.status).toBe(403);
  });

  test('callback stores the company token from realmId', async () => {
    const res = await request(app).get('/api/integrations/quickbooks/callback').query({
      code: 'auth-code',
      state: 'qbo-state-1',
      realmId: '934145000000',
    });
    expect(res.status).toBe(200);
    expect(qbo.exchangeCode).toHaveBeenCalledWith('auth-code', '934145000000', 1);
    expect(res.text).toMatch(/QuickBooks connected/i);
    expect(res.text).toMatch(/Go Back/i);
    expect(res.text).toContain(`href="${spaOrigin()}/"`);
  });

  test('owner can disconnect', async () => {
    const res = await request(app).post('/api/integrations/quickbooks/disconnect');
    expect(res.status).toBe(200);
    expect(qbo.disconnect).toHaveBeenCalled();
    expect(res.body.connected).toBe(false);
  });
});

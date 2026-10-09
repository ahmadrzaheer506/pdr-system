jest.mock('../integrations/gcal', () => ({
  isConfigured: jest.fn(() => true),
  authUrl: jest.fn((state) => `https://accounts.google.com/o?state=${state}`),
  signOauthState: jest.fn((id) => `state-for-${id}`),
  parseOauthState: jest.fn((state) => {
    if (state === 'state-for-2') return 2;
    throw new Error('Invalid OAuth state');
  }),
  exchangeCode: jest.fn(async () => true),
  disconnect: jest.fn(async () => true),
  status: jest.fn(async () => ({ id: 'google', connected: true, configured: true })),
}));

jest.mock('../calendarSync', () => ({
  backfillUser: jest.fn(async () => ({ appointments: 0, jobs: 0, holidays: 0, tasks: 0 })),
}));

jest.mock('../integrations/quickbooks', () => ({
  isConfigured: jest.fn(() => false),
  authUrl: jest.fn(),
  signOauthState: jest.fn(() => 'qbo-state'),
  parseOauthState: jest.fn(),
  exchangeCode: jest.fn(),
  disconnect: jest.fn(async () => true),
}));

jest.mock('../services/messenger', () => ({ ingestInbound: jest.fn() }));

jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 2, role: 'OFFICE', name: 'Lisa' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const { __setUser } = require('../auth');
const gcal = require('../integrations/gcal');
const integrations = require('../routes/integrations');
const { spaOrigin } = require('../passwordReset');

const app = express();
app.use(express.json());
app.use('/api/integrations', integrations);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('GET /api/integrations/google/connect (requirement 5.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gcal.isConfigured.mockReturnValue(true);
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
  });

  test('lets an office user start Connect with their own OAuth state', async () => {
    const res = await request(app).get('/api/integrations/google/connect');
    expect(res.status).toBe(200);
    expect(gcal.signOauthState).toHaveBeenCalledWith(2);
    expect(res.body.url).toContain('state-for-2');
  });

  test('lets an admin start Connect', async () => {
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    gcal.signOauthState.mockReturnValueOnce('state-for-1');
    const res = await request(app).get('/api/integrations/google/connect');
    expect(res.status).toBe(200);
    expect(gcal.signOauthState).toHaveBeenCalledWith(1);
  });

  test('lets field staff start Connect', async () => {
    __setUser({ id: 9, role: 'STAFF', name: 'Jamie' });
    gcal.signOauthState.mockReturnValueOnce('state-for-9');
    const res = await request(app).get('/api/integrations/google/connect');
    expect(res.status).toBe(200);
    expect(gcal.signOauthState).toHaveBeenCalledWith(9);
  });
});

describe('GET /api/integrations/google/callback (requirement 5.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores the token on the user from OAuth state', async () => {
    const res = await request(app).get('/api/integrations/google/callback').query({
      code: 'auth-code',
      state: 'state-for-2',
    });
    expect(res.status).toBe(200);
    expect(gcal.parseOauthState).toHaveBeenCalledWith('state-for-2');
    expect(gcal.exchangeCode).toHaveBeenCalledWith('auth-code', 2);
    expect(res.text).toMatch(/connected/i);
    expect(res.text).toMatch(/Go Back/i);
    expect(res.text).toContain(`href="${spaOrigin()}/"`);
    const calendarSync = require('../calendarSync');
    expect(calendarSync.backfillUser).toHaveBeenCalledWith(2);
  });

  test('rejects a missing or forged state', async () => {
    gcal.parseOauthState.mockImplementationOnce(() => { throw new Error('Invalid OAuth state'); });
    const res = await request(app).get('/api/integrations/google/callback').query({ code: 'auth-code' });
    expect(res.status).toBe(400);
    expect(gcal.exchangeCode).not.toHaveBeenCalled();
    expect(res.text).toMatch(/Go Back/i);
  });
});

describe('POST /api/integrations/google/disconnect (requirement 16.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
  });

  test('drops the signed-in user token', async () => {
    const res = await request(app).post('/api/integrations/google/disconnect');
    expect(res.status).toBe(200);
    expect(gcal.disconnect).toHaveBeenCalledWith(2);
    expect(res.body.connected).toBe(false);
  });
});

describe('GET /api/integrations/google/status (requirement 16.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
  });

  test('returns this user\'s connection', async () => {
    const res = await request(app).get('/api/integrations/google/status');
    expect(res.status).toBe(200);
    expect(gcal.status).toHaveBeenCalledWith(2);
  });
});

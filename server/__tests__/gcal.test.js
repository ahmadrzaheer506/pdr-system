jest.mock('../models', () => ({
  OauthToken: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Appointment: { findAll: jest.fn() },
  logIntegrationEvent: jest.fn(),
}));

jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { OauthToken, Appointment, logIntegrationEvent } = require('../models');
const gcal = require('../integrations/gcal');

const LISA = 2;
const PAUL = 1;

describe('Google Calendar per-user tokens (requirement 5.2)', () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'csecret';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-not-for-production-use';
  });

  afterAll(() => {
    process.env.GOOGLE_CLIENT_ID = prevId;
    process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  });

  test('createEvent is simulated when that office user is not connected', async () => {
    OauthToken.findOne.mockResolvedValue(null);
    const result = await gcal.createEvent({
      title: 'Site visit — Dave',
      start: '2026-09-30T09:00:00.000Z',
      end: '2026-09-30T10:00:00.000Z',
      userId: LISA,
    });
    expect(result.simulated).toBe(true);
    expect(String(result.eventId)).toMatch(/^sim-/);
    expect(logIntegrationEvent).toHaveBeenCalledWith(
      'google', 'out', 'event.simulated', expect.objectContaining({ userId: LISA }), 'simulated',
    );
  });

  test('createEvent is simulated when booking without a user id', async () => {
    const result = await gcal.createEvent({
      title: 'Site visit — Dave',
      start: '2026-09-30T09:00:00.000Z',
      end: '2026-09-30T10:00:00.000Z',
    });
    expect(result.simulated).toBe(true);
    expect(OauthToken.findOne).not.toHaveBeenCalled();
  });

  test('poll only uses the booker\'s calendar token', async () => {
    const save = jest.fn();
    Appointment.findAll.mockResolvedValue([{
      id: 9,
      created_by: LISA,
      gcal_event_id: 'evt-lisa',
      start: new Date('2026-09-30T09:00:00.000Z'),
      status: 'booked',
      save,
    }]);
    OauthToken.findOne.mockImplementation(async ({ where }) => {
      if (where.user_id === LISA) {
        return {
          access_token: 'lisa-token',
          expires_at: new Date(Date.now() + 3600_000),
        };
      }
      return null;
    });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'confirmed',
        start: { dateTime: '2026-09-30T11:00:00.000Z' },
        end: { dateTime: '2026-09-30T12:00:00.000Z' },
      }),
    }));
    global.fetch = fetchMock;

    const changed = await gcal.pollChanges();
    expect(changed).toBe(1);
    expect(save).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/calendars/primary/events/evt-lisa'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer lisa-token' }),
      }),
    );
  });

  test('poll skips a synced visit when the booker has no Google connection', async () => {
    Appointment.findAll.mockResolvedValue([{
      id: 9,
      created_by: PAUL,
      gcal_event_id: 'evt-paul',
      start: new Date('2026-09-30T09:00:00.000Z'),
      status: 'booked',
      save: jest.fn(),
    }]);
    OauthToken.findOne.mockResolvedValue(null);
    global.fetch = jest.fn();
    const changed = await gcal.pollChanges();
    expect(changed).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('oauth state round-trips the office user id', () => {
    const state = gcal.signOauthState(LISA);
    expect(gcal.parseOauthState(state)).toBe(LISA);
    expect(() => gcal.parseOauthState('')).toThrow(/Missing OAuth state/);
  });
});

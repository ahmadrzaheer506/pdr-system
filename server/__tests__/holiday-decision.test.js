jest.mock('../models', () => ({
  HolidayRequest: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  User: { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  Notification: { bulkCreate: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => 28),
}));
jest.mock('../calendarSync', () => ({
  syncHoliday: jest.fn(async () => {}),
}));

const { HolidayRequest, User } = require('../models');
const { decideRequest, withdrawRequest } = require('../holidayRequests');

const office = { id: 2, role: 'OFFICE', name: 'Lisa' };
const staff = { id: 4, role: 'STAFF', name: 'Jamie' };

function row(overrides = {}) {
  const r = {
    id: 11,
    user_id: 4,
    start_date: '2026-10-23',
    end_date: '2026-10-24',
    status: 'pending',
    decline_reason: null,
    async update(fields) { Object.assign(this, fields); },
    async destroy() { this.destroyed = true; },
    ...overrides,
  };
  return r;
}

describe('holiday decide / withdraw (requirement 10.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    HolidayRequest.findOne.mockResolvedValue(null);
    HolidayRequest.findAll.mockResolvedValue([]);
    User.findByPk.mockResolvedValue({ id: 4, holiday_allowance: 28 });
  });

  test('staff cannot decide', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row());
    await expect(decideRequest(staff, 11, { decision: 'approved' }))
      .rejects.toMatchObject({ status: 403 });
  });

  test('approve pending with no reason', async () => {
    const h = row();
    HolidayRequest.findByPk.mockResolvedValue(h);
    await expect(decideRequest(office, 11, { decision: 'approved' }))
      .resolves.toEqual({ ok: true, status: 'approved' });
    expect(h.status).toBe('approved');
    expect(h.decided_by).toBe(2);
    expect(h.decline_reason).toBeNull();
  });

  test('decline without a reason is 400', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row());
    await expect(decideRequest(office, 11, { decision: 'declined', decline_reason: '  ' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/reason/i) });
  });

  test('decline pending stores the trimmed reason', async () => {
    const h = row();
    HolidayRequest.findByPk.mockResolvedValue(h);
    await decideRequest(office, 11, { decision: 'declined', decline_reason: '  Crew booked  ' });
    expect(h.status).toBe('declined');
    expect(h.decline_reason).toBe('Crew booked');
  });

  test('cannot re-approve an approved request', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row({ status: 'approved' }));
    await expect(decideRequest(office, 11, { decision: 'approved' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/already approved/i) });
  });

  test('office can reverse approved to declined with a reason', async () => {
    const h = row({ status: 'approved' });
    HolidayRequest.findByPk.mockResolvedValue(h);
    await decideRequest(office, 11, { decision: 'declined', decline_reason: 'Job moved forward' });
    expect(h.status).toBe('declined');
    expect(h.decline_reason).toBe('Job moved forward');
  });

  test('office can reverse declined to approved and clears the reason', async () => {
    const h = row({ status: 'declined', decline_reason: 'Too short notice' });
    HolidayRequest.findByPk.mockResolvedValue(h);
    await decideRequest(office, 11, { decision: 'approved' });
    expect(h.status).toBe('approved');
    expect(h.decline_reason).toBeNull();
  });

  test('approving a declined request still blocks overlap', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row({ status: 'declined' }));
    HolidayRequest.findOne.mockResolvedValue({ id: 99 });
    await expect(decideRequest(office, 11, { decision: 'approved' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/overlap/i) });
  });

  test('staff can withdraw their own pending request', async () => {
    const h = row();
    HolidayRequest.findByPk.mockResolvedValue(h);
    await expect(withdrawRequest(staff, 11)).resolves.toEqual({ ok: true });
    expect(h.destroyed).toBe(true);
  });

  test('staff cannot withdraw someone else\'s request', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row({ user_id: 6 }));
    await expect(withdrawRequest(staff, 11)).rejects.toMatchObject({ status: 403 });
  });

  test('only pending requests can be withdrawn', async () => {
    HolidayRequest.findByPk.mockResolvedValue(row({ status: 'approved' }));
    await expect(withdrawRequest(staff, 11)).rejects.toMatchObject({ status: 400 });
  });
});

jest.mock('../models', () => ({
  HolidayRequest: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  User: { findOne: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => 28),
}));

const { HolidayRequest, User } = require('../models');
const { createRequest, decideRequest, daysInYear } = require('../holidayRequests');

const staff = { id: 4, role: 'STAFF', name: 'Jamie' };
const office = { id: 2, role: 'OFFICE', name: 'Lisa' };

describe('holiday allowance (requirement 10.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T12:00:00'));
    User.findOne.mockResolvedValue({ id: 4, role: 'STAFF', active: true, holiday_allowance: 28 });
    User.findByPk.mockResolvedValue({ id: 4, holiday_allowance: 28 });
    HolidayRequest.findOne.mockResolvedValue(null);
    HolidayRequest.findAll.mockResolvedValue([]);
    HolidayRequest.create.mockImplementation(async (row) => ({ id: 9, ...row }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('clips a request that crosses 1 January into each year', () => {
    expect(daysInYear('2026-12-30', '2027-01-02', 2026)).toBe(2);
    expect(daysInYear('2026-12-30', '2027-01-02', 2027)).toBe(2);
    expect(daysInYear('2026-12-30', '2027-01-02', 2025)).toBe(0);
  });

  test('staff submit is 400 when pending plus approved would exceed remaining', async () => {
    HolidayRequest.findAll.mockResolvedValue([
      { start_date: '2026-03-01', end_date: '2026-03-28' },
    ]);
    await expect(createRequest(staff, { start_date: '2026-10-23', end_date: '2026-10-24' }))
      .rejects.toMatchObject({ status: 400, remaining: 0, allowance: 28, year: 2026 });
    expect(HolidayRequest.create).not.toHaveBeenCalled();
  });

  test('office book is 400 when over remaining even without notice', async () => {
    User.findOne.mockResolvedValue({ id: 4, role: 'STAFF', active: true, holiday_allowance: 2 });
    await expect(createRequest(office, { start_date: '2026-09-26', end_date: '2026-09-28', user_id: 4 }))
      .rejects.toMatchObject({ status: 400, year: 2026 });
  });

  test('approving a pending request does not double-count its own days', async () => {
    const h = {
      id: 11, user_id: 4, start_date: '2026-10-23', end_date: '2026-10-24', status: 'pending',
      async update(fields) { Object.assign(this, fields); },
    };
    HolidayRequest.findByPk.mockResolvedValue(h);
    HolidayRequest.findAll.mockResolvedValue([]);
    await expect(decideRequest(office, 11, { decision: 'approved' }))
      .resolves.toEqual({ ok: true, status: 'approved' });
    expect(HolidayRequest.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: expect.anything() }),
    }));
  });

  test('reversing declined to approved is 400 if remaining is too small', async () => {
    const h = {
      id: 11, user_id: 4, start_date: '2026-10-23', end_date: '2026-10-24', status: 'declined',
      async update(fields) { Object.assign(this, fields); },
    };
    HolidayRequest.findByPk.mockResolvedValue(h);
    HolidayRequest.findAll.mockResolvedValue([
      { start_date: '2026-01-01', end_date: '2026-01-28' },
    ]);
    await expect(decideRequest(office, 11, { decision: 'approved' }))
      .rejects.toMatchObject({ status: 400, remaining: 0 });
  });
});

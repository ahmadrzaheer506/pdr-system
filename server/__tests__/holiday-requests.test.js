jest.mock('../models', () => ({
  HolidayRequest: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  User: { findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  Notification: { bulkCreate: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => 28),
}));
jest.mock('../calendarSync', () => ({
  syncHoliday: jest.fn(async () => {}),
}));

const { HolidayRequest, User } = require('../models');
const { getSetting } = require('../db');
const { createRequest, daysBetween, noticeDaysUntil } = require('../holidayRequests');

const staff = { id: 4, role: 'STAFF', name: 'Jamie' };
const office = { id: 2, role: 'OFFICE', name: 'Lisa' };

describe('holidayRequests (requirement 10.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T12:00:00'));
    getSetting.mockResolvedValue(28);
    User.findOne.mockResolvedValue({ id: 4, role: 'STAFF', active: true });
    HolidayRequest.findOne.mockResolvedValue(null);
    HolidayRequest.findAll.mockResolvedValue([]);
    HolidayRequest.create.mockImplementation(async (row) => ({ id: 9, ...row }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('counts inclusive calendar days', () => {
    expect(daysBetween('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-01', '2026-10-03')).toBe(3);
  });

  test('notice is calendar days from local today to start', () => {
    expect(noticeDaysUntil('2026-10-23')).toBe(28);
    expect(noticeDaysUntil('2026-10-22')).toBe(27);
  });

  test('staff cannot request inside the notice window', async () => {
    await expect(createRequest(staff, { start_date: '2026-10-22', end_date: '2026-10-24' }))
      .rejects.toMatchObject({ status: 400, notice_days: 28 });
    expect(HolidayRequest.create).not.toHaveBeenCalled();
  });

  test('honours a stored notice of 0 days instead of falling back to 28', async () => {
    getSetting.mockResolvedValue(0);
    const result = await createRequest(staff, { start_date: '2026-09-26', end_date: '2026-09-26' });
    expect(result.id).toBe(9);
    expect(HolidayRequest.create).toHaveBeenCalled();
  });

  test('staff can request on the notice boundary', async () => {
    const result = await createRequest(staff, { start_date: '2026-10-23', end_date: '2026-10-24', reason: '  holiday  ' });
    expect(result).toEqual({ id: 9, days: 2, kind: 'multi', status: 'pending' });
    expect(HolidayRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 4, start_date: '2026-10-23', end_date: '2026-10-24', days: 2, reason: 'holiday', status: 'pending',
    }));
  });

  test('staff cannot book for someone else', async () => {
    await createRequest(staff, { start_date: '2026-10-23', end_date: '2026-10-24', user_id: 6 });
    expect(User.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4, active: true } }));
  });

  test('office / admin bypass notice and auto-approve the booking', async () => {
    const result = await createRequest(office, { start_date: '2026-09-26', end_date: '2026-09-28', user_id: 4 });
    expect(result).toEqual({ id: 9, days: 3, kind: 'multi', status: 'approved' });
    expect(getSetting).not.toHaveBeenCalled();
    expect(HolidayRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 4,
      start_date: '2026-09-26',
      end_date: '2026-09-28',
      status: 'approved',
      decided_by: 2,
    }));
  });

  test('nobody can book a date in the past', async () => {
    await expect(createRequest(office, { start_date: '2026-09-24', end_date: '2026-09-24', user_id: 4 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/past/i) });
    expect(HolidayRequest.create).not.toHaveBeenCalled();
  });

  test('office must pick a staff member', async () => {
    await expect(createRequest(office, { start_date: '2026-09-26', end_date: '2026-09-28' }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('blocks overlapping pending or approved requests', async () => {
    HolidayRequest.findOne.mockResolvedValue({ id: 3, start_date: '2026-10-20', end_date: '2026-10-25' });
    await expect(createRequest(office, { start_date: '2026-10-25', end_date: '2026-10-27', user_id: 4 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/overlap/i) });
    expect(HolidayRequest.create).not.toHaveBeenCalled();
  });

  test('declined requests do not count as an overlap', async () => {
    HolidayRequest.findOne.mockResolvedValue(null);
    await createRequest(staff, { start_date: '2026-10-23', end_date: '2026-10-24' });
    expect(HolidayRequest.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user_id: 4,
        status: { [require('sequelize').Op.in]: ['pending', 'approved'] },
      }),
    }));
  });

  test('single-day kind uses one date even if end_date is omitted', async () => {
    const result = await createRequest(staff, { start_date: '2026-10-23', kind: 'single' });
    expect(result).toEqual({ id: 9, days: 1, kind: 'single', status: 'pending' });
    expect(HolidayRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      start_date: '2026-10-23', end_date: '2026-10-23', days: 1,
    }));
  });

  test('multi-day kind needs a later end date', async () => {
    await expect(createRequest(staff, { start_date: '2026-10-23', end_date: '2026-10-23', kind: 'multi' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/later end date/i) });
    expect(HolidayRequest.create).not.toHaveBeenCalled();
  });
});

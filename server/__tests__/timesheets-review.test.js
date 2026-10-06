jest.mock('../models', () => ({
  Timesheet: { findByPk: jest.fn(), update: jest.fn() },
  Job: {},
  JobDayAssignment: {},
  Invoice: { findOne: jest.fn(), findAll: jest.fn() },
  User: { findByPk: jest.fn() },
  Customer: {},
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(async () => null),
  geocodeAddress: jest.fn(async () => null),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => ({})),
  todayStr: () => '2026-09-25',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const { Timesheet, User } = require('../models');
const { correctShift, approveShift, approveBatch, rejectShift } = require('../services/timesheets');

function sheet(overrides = {}) {
  const row = {
    id: 1,
    user_id: 3,
    job_id: 8,
    status: 'completed',
    clock_in: '2026-09-21T08:00:00.000Z',
    clock_out: '2026-09-21T16:00:00.000Z',
    break_minutes: 30,
    cost_rate: 24.5,
    labour_cost: 183.75,
    notes: null,
    async update(fields) { Object.assign(this, fields); },
    ...overrides,
  };
  return row;
}

describe('timesheet review (requirement 9.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Timesheet.update.mockResolvedValue([0]);
    User.findByPk.mockResolvedValue({ hourly_cost: 24.5 });
  });

  test('edit with a longer break does not reduce worked minutes (paid log)', async () => {
    const row = sheet();
    Timesheet.findByPk.mockResolvedValue(row);
    const result = await correctShift(1, { break_minutes: 45, edit_reason: 'Confirmed lunch with Nathan' });
    expect(result.worked_minutes).toBe(480);
    expect(result.labour_cost).toBe(196);
    expect(row.break_minutes).toBe(45);
    expect(row.edit_reason).toBe('Confirmed lunch with Nathan');
  });

  test('rejects edit without a reason', async () => {
    Timesheet.findByPk.mockResolvedValue(sheet());
    await expect(correctShift(1, { break_minutes: 45 })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/reason is required/i),
    });
  });

  test('running shifts cannot be edited', async () => {
    Timesheet.findByPk.mockResolvedValue(sheet({ status: 'active', clock_out: null }));
    await expect(correctShift(1, { edit_reason: 'oops' })).rejects.toMatchObject({ status: 400 });
  });

  test('rejected shifts cannot be edited', async () => {
    Timesheet.findByPk.mockResolvedValue(sheet({ status: 'rejected' }));
    await expect(correctShift(1, { edit_reason: 'oops' })).rejects.toMatchObject({ status: 400 });
  });

  test('approved shifts can be edited with a reason', async () => {
    const row = sheet({ status: 'approved' });
    Timesheet.findByPk.mockResolvedValue(row);
    await correctShift(1, { edit_reason: 'Adjusted finish time' });
    expect(row.status).toBe('approved');
    expect(row.edit_reason).toBe('Adjusted finish time');
  });

  test('approve is only allowed on completed', async () => {
    Timesheet.findByPk.mockResolvedValue(sheet({ status: 'approved' }));
    await expect(approveShift(1, 2)).rejects.toMatchObject({ status: 400 });
    Timesheet.findByPk.mockResolvedValue(sheet({ status: 'active' }));
    await expect(approveShift(1, 2)).rejects.toMatchObject({ status: 400 });
    const row = sheet();
    Timesheet.findByPk.mockResolvedValue(row);
    await approveShift(1, 2);
    expect(row.status).toBe('approved');
    expect(row.approved_by).toBe(2);
  });

  test('batch approve only updates completed rows', async () => {
    Timesheet.update.mockResolvedValue([2]);
    const result = await approveBatch([1, 2, 3], 2);
    expect(result.approved).toBe(2);
    expect(Timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', approved_by: 2 }),
      { where: { id: [1, 2, 3], status: 'completed' } }
    );
  });

  test('reject requires a reason and only works on completed', async () => {
    Timesheet.findByPk.mockResolvedValue(sheet());
    await expect(rejectShift(1, 2, '  ')).rejects.toMatchObject({ status: 400 });
    const row = sheet();
    Timesheet.findByPk.mockResolvedValue(row);
    await rejectShift(1, 2, 'Wrong job');
    expect(row.status).toBe('rejected');
    expect(row.edit_reason).toBe('Wrong job');
    Timesheet.findByPk.mockResolvedValue(sheet({ status: 'approved' }));
    await expect(rejectShift(1, 2, 'too late')).rejects.toMatchObject({ status: 400 });
  });
});

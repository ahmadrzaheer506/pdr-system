jest.mock('../models', () => ({
  Timesheet: { findOne: jest.fn(), create: jest.fn() },
  Job: { findByPk: jest.fn() },
  JobDayAssignment: { findOne: jest.fn() },
  User: {},
  Customer: {},
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(async () => null),
  geocodeAddress: jest.fn(async () => null),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => ({ enabled: true, require_location: false })),
  todayStr: () => '2026-09-24',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const { Timesheet, Job, JobDayAssignment } = require('../models');
const { clockIn, parseOptionalJobId } = require('../services/timesheets');

describe('clockIn (requirement 9.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Timesheet.findOne.mockResolvedValue(null);
    Timesheet.create.mockImplementation(async (row) => ({ id: 11, ...row }));
  });

  test('allows a yard / travel shift with no job', async () => {
    const shift = await clockIn(4, {});
    expect(Job.findByPk).not.toHaveBeenCalled();
    expect(JobDayAssignment.findOne).not.toHaveBeenCalled();
    expect(Timesheet.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 4, job_id: null, work_date: '2026-09-24', status: 'active', location_flag: 'no_location',
    }));
    expect(shift.job_id).toBeNull();
  });

  test('requires the user to be on that job\'s crew when a job is picked', async () => {
    Job.findByPk.mockResolvedValue({ id: 8 });
    JobDayAssignment.findOne.mockResolvedValue({ job_id: 8, user_id: 4, work_date: '2026-09-24' });
    await clockIn(4, { job_id: 8 });
    expect(JobDayAssignment.findOne).toHaveBeenCalledWith({
      where: { job_id: 8, user_id: 4 },
    });
    expect(Timesheet.create).toHaveBeenCalledWith(expect.objectContaining({ job_id: 8 }));
  });

  test('allows clock-in when the user is on the job on a later day', async () => {
    Job.findByPk.mockResolvedValue({ id: 8 });
    JobDayAssignment.findOne.mockResolvedValue({ job_id: 8, user_id: 4, work_date: '2026-10-04' });
    await clockIn(4, { job_id: 8 });
    expect(Timesheet.create).toHaveBeenCalledWith(expect.objectContaining({
      job_id: 8, work_date: '2026-09-24', status: 'active',
    }));
  });

  test('rejects a job the user is not on at all', async () => {
    Job.findByPk.mockResolvedValue({ id: 8 });
    JobDayAssignment.findOne.mockResolvedValue(null);
    await expect(clockIn(4, { job_id: 8 })).rejects.toThrow('You are not assigned to that job');
    expect(Timesheet.create).not.toHaveBeenCalled();
  });

  test('rejects a missing job', async () => {
    Job.findByPk.mockResolvedValue(null);
    await expect(clockIn(4, { job_id: 99 })).rejects.toThrow('Job not found');
  });

  test('rejects a second clock-in until they clock out', async () => {
    Timesheet.findOne.mockResolvedValue({
      id: 11, user_id: 4, job_id: null, status: 'active',
      toJSON() { return this; },
    });
    await expect(clockIn(4, {})).rejects.toThrow('You are already clocked in — clock out first');
    expect(Timesheet.create).not.toHaveBeenCalled();
  });

  test('maps a unique-index race to the same already-clocked-in error', async () => {
    const err = new Error('duplicate');
    err.name = 'SequelizeUniqueConstraintError';
    Timesheet.create.mockRejectedValue(err);
    await expect(clockIn(4, {})).rejects.toThrow('You are already clocked in — clock out first');
  });

  test('rejects a non-integer job id', async () => {
    expect(() => parseOptionalJobId('yard')).toThrow('Invalid job');
    await expect(clockIn(4, { job_id: 'abc' })).rejects.toThrow('Invalid job');
  });
});

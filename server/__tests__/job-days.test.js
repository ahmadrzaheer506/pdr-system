jest.mock('../models', () => ({
  JobDayAssignment: { destroy: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  User: {},
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { JobDayAssignment } = require('../models');
const jobDays = require('../jobDays');

describe('jobDays (requirement 8.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('toIsoDate normalises DATEONLY strings and UTC midnight Dates', () => {
    expect(jobDays.toIsoDate('2026-10-04')).toBe('2026-10-04');
    expect(jobDays.toIsoDate(new Date('2026-10-04T00:00:00.000Z'))).toBe('2026-10-04');
  });

  test('datesInRange expands inclusive calendar days', () => {
    expect(jobDays.datesInRange('2026-09-22', '2026-09-24')).toEqual([
      '2026-09-22', '2026-09-23', '2026-09-24',
    ]);
  });

  test('overlapWhere includes multi-day jobs that started before from', () => {
    const { Op } = require('sequelize');
    const where = jobDays.overlapWhere('2026-09-22', '2026-09-28');
    expect(where.start_date[Op.lte]).toBe('2026-09-28');
    expect(where[Op.or]).toHaveLength(2);
  });

  test('validateJobDates rejects end before start', () => {
    expect(jobDays.validateJobDates('2026-09-26', '2026-09-25').error).toBe('End date cannot be before the start date');
  });

  test('setDayCrew refuses a PENDING job with no dates', async () => {
    const result = await jobDays.setDayCrew({ id: 4, start_date: null }, '2026-09-24', [2]);
    expect(result.status).toBe(400);
    expect(result.error).toBe('Place this job on the schedule before assigning crew');
  });

  test('setDayCrew replaces crew for one work date only', async () => {
    JobDayAssignment.findAll.mockResolvedValue([{ user_id: 2 }]);
    JobDayAssignment.destroy.mockResolvedValue(1);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);
    const result = await jobDays.setDayCrew(
      { id: 4, start_date: '2026-09-22', end_date: '2026-09-24' },
      '2026-09-23',
      [9, 9, '8'],
    );
    expect(result).toEqual({
      ok: true, work_date: '2026-09-23', user_ids: [9, 8], previous_user_ids: [2],
    });
    expect(JobDayAssignment.destroy).toHaveBeenCalledWith({
      where: { job_id: 4, work_date: '2026-09-23' },
      transaction: undefined,
    });
  });
});

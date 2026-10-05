jest.mock('../models', () => ({
  HolidayRequest: { findAll: jest.fn() },
  JobDayAssignment: { findAll: jest.fn() },
  Job: {},
  User: { findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { HolidayRequest, JobDayAssignment, User } = require('../models');
const crewAvailability = require('../crewAvailability');

describe('crewAvailability (requirement 8.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('overlay ignores pending holidays and maps approved ones', async () => {
    HolidayRequest.findAll.mockResolvedValue([{
      id: 7,
      user_id: 3,
      start_date: '2026-09-22',
      end_date: '2026-09-23',
      User: { name: 'Jamie Fisher' },
    }]);
    JobDayAssignment.findAll.mockResolvedValue([{
      user_id: 4,
      job_id: 8,
      work_date: '2026-09-22',
      User: { name: 'Liam Ozturk' },
      Job: { id: 8, title: 'Porch roof rebuild', status: 'SCHEDULED' },
    }]);

    const result = await crewAvailability.overlay('2026-09-22', '2026-09-22');
    expect(HolidayRequest.findAll.mock.calls[0][0].where.status).toBe('approved');
    expect(result.holidays).toEqual([{
      id: 7, user_id: 3, user_name: 'Jamie Fisher', start_date: '2026-09-22', end_date: '2026-09-23',
    }]);
    expect(result.bookings).toEqual([{
      user_id: 4, name: 'Liam Ozturk', job_id: 8, job_title: 'Porch roof rebuild', work_date: '2026-09-22',
    }]);
  });

  test('busy statuses include invoiced jobs so overlays match the calendar', () => {
    expect(crewAvailability.BUSY_JOB_STATUSES).toEqual(expect.arrayContaining([
      'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID',
    ]));
  });

  test('overlay rejects a missing from date', async () => {
    const result = await crewAvailability.overlay('', '2026-09-22');
    expect(result.status).toBe(400);
    expect(result.error).toBe('from date is required');
  });

  test('assignmentWarnings reports other-job bookings but not holiday (holiday is 10.3 block)', async () => {
    User.findAll.mockResolvedValue([{ id: 3, name: 'Jamie Fisher' }]);
    HolidayRequest.findAll.mockResolvedValue([{ user_id: 3 }]);
    JobDayAssignment.findAll.mockResolvedValue([{
      user_id: 3,
      job_id: 9,
      Job: { id: 9, title: 'Guttering', status: 'IN_PROGRESS' },
    }]);

    const warnings = await crewAvailability.assignmentWarnings(
      { id: 8 },
      '2026-09-22',
      [3],
    );
    expect(warnings.map((w) => w.type)).toEqual(['double_book']);
    expect(warnings[0].message).toMatch(/Guttering/);
  });

  test('assignmentConflicts lists holiday and double-book for a confirm prompt', async () => {
    HolidayRequest.findAll.mockResolvedValue([{ user_id: 3 }]);
    User.findAll.mockResolvedValue([{ id: 3, name: 'Jamie Fisher', skills: ['roofer'], is_driver: true }]);
    JobDayAssignment.findAll.mockResolvedValue([{
      user_id: 3,
      job_id: 9,
      Job: { id: 9, title: 'Guttering', status: 'IN_PROGRESS' },
    }]);
    const conflicts = await crewAvailability.assignmentConflicts({ id: 8 }, '2026-09-22', [3]);
    expect(conflicts.map((c) => c.type)).toEqual(['holiday', 'double_book']);
  });

  test('holidayBlockers lists approved holiday for a confirm prompt', async () => {
    HolidayRequest.findAll.mockResolvedValue([{ user_id: 3 }]);
    User.findAll.mockResolvedValue([{ id: 3, name: 'Jamie Fisher' }]);
    const blocked = await crewAvailability.holidayBlockers('2026-09-22', [3]);
    expect(blocked).toEqual([{
      user_id: 3,
      type: 'holiday',
      message: 'Jamie Fisher is on approved holiday that day',
    }]);
  });

  test('assignmentWarnings skips the same job that day', async () => {
    User.findAll.mockResolvedValue([{ id: 3, name: 'Jamie Fisher', skills: ['slate'], is_driver: true }]);
    HolidayRequest.findAll.mockResolvedValue([]);
    JobDayAssignment.findAll.mockResolvedValue([]);

    const warnings = await crewAvailability.assignmentWarnings({ id: 8 }, '2026-09-22', [3]);
    expect(warnings).toEqual([]);
  });

  test('assignmentWarnings reports missing skills and a missing driver without blocking (requirement 8.3)', async () => {
    User.findAll.mockResolvedValue([{ id: 4, name: 'Liam Ozturk', skills: ['labourer'], is_driver: false }]);
    HolidayRequest.findAll.mockResolvedValue([]);
    JobDayAssignment.findAll.mockResolvedValue([]);

    const warnings = await crewAvailability.assignmentWarnings(
      { id: 8, required_skills: ['slate'], needs_driver: true },
      '2026-09-22',
      [4],
    );
    expect(warnings.map((w) => w.type)).toEqual(['skill', 'driver']);
    expect(warnings[0].message).toMatch(/slate/);
    expect(warnings[1].message).toMatch(/needs a driver/);
  });
});

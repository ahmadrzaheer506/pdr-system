jest.mock('../models', () => ({
  Timesheet: { findAll: jest.fn() },
  Job: {},
  JobDayAssignment: { findAll: jest.fn() },
  User: {},
  Customer: {},
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(async () => null),
  geocodeAddress: jest.fn(async () => null),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => ({ enabled: true, require_location: false })),
  todayStr: () => '2026-09-25',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const { Timesheet, JobDayAssignment } = require('../models');
const { liveBoard } = require('../services/timesheets');

function activeShift(overrides = {}) {
  return {
    id: 11,
    user_id: 4,
    job_id: 8,
    clock_in: '2026-09-25 08:00:00',
    status: 'active',
    location_flag: null,
    break_started_at: null,
    in_distance_m: null,
    User: { name: 'Jamie', color: '#111' },
    Job: { title: 'Hall roof', address: '1 High St', Customer: { name: 'Hall' } },
    ...overrides,
  };
}

function crewSlot(overrides = {}) {
  return {
    id: 1,
    job_id: 8,
    user_id: 4,
    work_date: '2026-09-25',
    User: { id: 4, name: 'Jamie', color: '#111', active: true },
    Job: { id: 8, title: 'Hall roof' },
    ...overrides,
  };
}

describe('liveBoard (requirement 9.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Timesheet.findAll.mockResolvedValue([]);
    JobDayAssignment.findAll.mockResolvedValue([]);
  });

  test('returns empty lists when nobody is on the clock and nobody is on today\'s crew', async () => {
    const board = await liveBoard();
    expect(board.work_date).toBe('2026-09-25');
    expect(board.active).toEqual([]);
    expect(board.not_clocked_in).toEqual([]);
  });

  test('maps open shifts including yard / travel (no job)', async () => {
    Timesheet.findAll.mockResolvedValue([
      activeShift({ job_id: null, Job: null, location_flag: 'no_location' }),
    ]);
    const board = await liveBoard();
    expect(board.active).toHaveLength(1);
    expect(board.active[0]).toEqual(expect.objectContaining({
      user_id: 4,
      user_name: 'Jamie',
      job_title: null,
      location_flag: 'no_location',
    }));
    expect(board.active[0].User).toBeUndefined();
    expect(board.not_clocked_in).toEqual([]);
  });

  test('lists today\'s crew who have no open shift', async () => {
    JobDayAssignment.findAll.mockResolvedValue([
      crewSlot({ User: { id: 5, name: 'Ryan', color: '#222', active: true }, Job: { id: 8, title: 'Hall roof' } }),
      crewSlot({
        id: 2,
        user_id: 6,
        User: { id: 6, name: 'Connor', color: '#333', active: true },
        Job: { id: 9, title: 'Garage' },
      }),
    ]);
    const board = await liveBoard();
    expect(board.not_clocked_in.map((p) => p.user_name)).toEqual(['Connor', 'Ryan']);
    expect(board.not_clocked_in.find((p) => p.user_id === 5).jobs).toEqual(['Hall roof']);
  });

  test('a person on two jobs today appears once with both titles', async () => {
    JobDayAssignment.findAll.mockResolvedValue([
      crewSlot({ User: { id: 5, name: 'Ryan', color: '#222', active: true }, Job: { id: 8, title: 'Hall roof' } }),
      crewSlot({
        id: 2,
        job_id: 9,
        user_id: 5,
        User: { id: 5, name: 'Ryan', color: '#222', active: true },
        Job: { id: 9, title: 'Garage' },
      }),
    ]);
    const board = await liveBoard();
    expect(board.not_clocked_in).toHaveLength(1);
    expect(board.not_clocked_in[0].jobs).toEqual(['Hall roof', 'Garage']);
  });

  test('clocked-in crew (including yard / travel) are omitted from not clocked in', async () => {
    Timesheet.findAll.mockResolvedValue([
      activeShift({ user_id: 4, job_id: null, Job: null }),
    ]);
    JobDayAssignment.findAll.mockResolvedValue([
      crewSlot(),
      crewSlot({
        id: 2,
        user_id: 5,
        User: { id: 5, name: 'Ryan', color: '#222', active: true },
        Job: { id: 8, title: 'Hall roof' },
      }),
    ]);
    const board = await liveBoard();
    expect(board.active[0].user_id).toBe(4);
    expect(board.not_clocked_in).toEqual([
      expect.objectContaining({ user_id: 5, user_name: 'Ryan', jobs: ['Hall roof'] }),
    ]);
  });

  test('skips inactive users and staff with no assignment today', async () => {
    Timesheet.findAll.mockResolvedValue([]);
    JobDayAssignment.findAll.mockResolvedValue([
      crewSlot({
        User: { id: 9, name: 'Leaver', color: '#000', active: false },
        Job: { id: 8, title: 'Hall roof' },
      }),
    ]);
    const board = await liveBoard();
    expect(board.not_clocked_in).toEqual([]);
  });

  test('keeps on-break and 9.2 location flags on active cards', async () => {
    Timesheet.findAll.mockResolvedValue([
      activeShift({
        break_started_at: '2026-09-25 10:00:00',
        location_flag: 'far_from_site',
        in_distance_m: 420,
      }),
    ]);
    const board = await liveBoard();
    expect(board.active[0].break_started_at).toBe('2026-09-25 10:00:00');
    expect(board.active[0].location_flag).toBe('far_from_site');
    expect(board.active[0].in_distance_m).toBe(420);
  });
});

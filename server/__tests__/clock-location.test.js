jest.mock('../models', () => ({
  Timesheet: { findOne: jest.fn(), create: jest.fn(), update: jest.fn(), findByPk: jest.fn() },
  Job: { findByPk: jest.fn() },
  JobDayAssignment: { findOne: jest.fn() },
  User: { findByPk: jest.fn() },
  Customer: {},
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(),
  geocodeAddress: jest.fn(),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(async () => ({ enabled: true, site_radius_m: 300, max_shift_hours: 14 })),
  todayStr: () => '2026-09-24',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const { Timesheet, Job, JobDayAssignment, User } = require('../models');
const geocode = require('../geocode');
const { clockIn, clockOut, locationCapture } = require('../services/timesheets');

describe('locationCapture (requirement 9.2)', () => {
  const site = { lat: 51.4543, lng: -0.9781 };

  test('flags missing GPS without blocking', () => {
    expect(locationCapture({ lat: null, lng: null, coords: site, radius: 300 })).toEqual({
      distance: null, flag: 'no_location',
    });
  });

  test('flags far-from-site warn-only', () => {
    const captured = locationCapture({ lat: 52.5, lng: -1.9, coords: site, radius: 300 });
    expect(captured.flag).toBe('far_from_site');
    expect(captured.distance).toBeGreaterThan(300);
  });

  test('does not flag yard / travel as far from site', () => {
    expect(locationCapture({ lat: 51.45, lng: -0.97, coords: null, radius: 300 })).toEqual({
      distance: null, flag: null,
    });
  });
});

describe('clockIn location flags (requirement 9.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Timesheet.findOne.mockResolvedValue(null);
    Timesheet.create.mockImplementation(async (row) => ({ id: 11, ...row }));
    Job.findByPk.mockResolvedValue({ id: 8, address: '2 Priory Court', lat: 51.4543, lng: -0.9781 });
    JobDayAssignment.findOne.mockResolvedValue({ job_id: 8, user_id: 4 });
    geocode.ensureJobSitePoint.mockResolvedValue({ lat: 51.4543, lng: -0.9781 });
  });

  test('saves when far from the geocoded site and sets far_from_site', async () => {
    const shift = await clockIn(4, { job_id: 8, lat: 52.5, lng: -1.9 });
    expect(shift.location_flag).toBe('far_from_site');
    expect(Timesheet.create).toHaveBeenCalled();
  });

  test('geocodes when the job has no stored point', async () => {
    geocode.ensureJobSitePoint.mockResolvedValue({ lat: 51.4543, lng: -0.9781 });
    await clockIn(4, { job_id: 8, lat: 51.4543, lng: -0.9781 });
    expect(geocode.ensureJobSitePoint).toHaveBeenCalled();
  });
});

describe('clockOut paid breaks (requirement 9.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const clockInAt = new Date('2026-09-24T08:00:00Z');
    Timesheet.findOne.mockResolvedValue({
      id: 11,
      user_id: 4,
      job_id: 8,
      clock_in: clockInAt,
      break_minutes: 30,
      break_started_at: null,
      location_flag: null,
      toJSON() { return { ...this }; },
    });
    geocode.ensureJobSitePoint.mockResolvedValue({ lat: 51.4543, lng: -0.9781 });
    Job.findByPk.mockResolvedValue({ id: 8, address: '2 Priory Court', lat: 51.4543, lng: -0.9781 });
    User.findByPk.mockResolvedValue({ hourly_cost: 24 });
    Timesheet.update.mockResolvedValue([1]);
    Timesheet.findByPk.mockResolvedValue({ id: 11, worked_minutes: 480, break_minutes: 30 });
  });

  test('counts break time toward worked minutes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T16:00:00Z'));
    await clockOut(4, { lat: 51.4543, lng: -0.9781 });
    jest.useRealTimers();
    expect(Timesheet.update).toHaveBeenCalledWith(expect.objectContaining({
      break_minutes: 30,
      worked_minutes: 480,
    }), { where: { id: 11 } });
  });

  test('honours a stored max_shift_hours of 0 instead of falling back to 14', async () => {
    const { getSetting } = require('../db');
    getSetting.mockResolvedValueOnce({ enabled: true, site_radius_m: 300, max_shift_hours: 0 });
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T16:00:00Z'));
    await clockOut(4, { lat: 51.4543, lng: -0.9781 });
    jest.useRealTimers();
    expect(Timesheet.update).toHaveBeenCalledWith(expect.objectContaining({
      worked_minutes: 0,
      location_flag: 'over_max_hours',
    }), { where: { id: 11 } });
  });
});

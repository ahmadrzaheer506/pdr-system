import { describe, it, expect } from 'vitest';
import { datesInRange, jobOnDate, crewForDate, addIsoDays, isOnHoliday, bookingsFromJobs, mergeCrewBookings, jobDatesForCrewDay, staffDayFlags, crewConflictLabel, crewSaveConflicts, jobConflictCaption, teamAvailabilityRows } from './schedule';

describe('schedule helpers (requirement 8.1)', () => {
  it('lists inclusive dates and matches jobs on a day', () => {
    expect(datesInRange('2026-09-22', '2026-09-24')).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
    expect(addIsoDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(jobOnDate({ start_date: '2026-09-21', end_date: '2026-09-23' }, '2026-09-22')).toBe(true);
    expect(jobOnDate({ start_date: '2026-09-21', end_date: '2026-09-23' }, '2026-09-24')).toBe(false);
    expect(jobDatesForCrewDay({ start_date: '2026-10-04', end_date: '2026-10-04' }, '2026-10-04')).toBeNull();
    expect(jobDatesForCrewDay({ start_date: '2026-10-04', end_date: '2026-10-04' }, '2026-10-06')).toEqual({
      start_date: '2026-10-06', end_date: '2026-10-06',
    });
    expect(jobDatesForCrewDay({ start_date: '2026-10-04', end_date: '2026-10-05' }, '2026-10-07')).toEqual({
      start_date: '2026-10-04', end_date: '2026-10-07',
    });
  });

  it('filters crew for one work date', () => {
    const job = {
      day_assignments: [
        { work_date: '2026-09-22', user_id: 3, name: 'Jamie' },
        { work_date: '2026-09-23', user_id: 4, name: 'Liam' },
      ],
    };
    expect(crewForDate(job, '2026-09-22').map((s) => s.name)).toEqual(['Jamie']);
  });

  it('flags holiday and other-job bookings for a person (requirement 8.2)', () => {
    const holidays = [{ user_id: 3, start_date: '2026-09-22', end_date: '2026-09-22' }];
    const jobs = [
      { id: 8, title: 'Porch', day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Jamie' }] },
      { id: 9, title: 'Guttering', day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Jamie' }] },
    ];
    expect(isOnHoliday(holidays, 3, '2026-09-22')).toBe(true);
    expect(isOnHoliday(holidays, 4, '2026-09-22')).toBe(false);
    const flags = staffDayFlags({
      holidays,
      bookings: bookingsFromJobs(jobs, '2026-09-22'),
      userId: 3,
      iso: '2026-09-22',
      excludeJobId: 8,
    });
    expect(flags.onHoliday).toBe(true);
    expect(flags.busyOn.map((b) => b.job_id)).toEqual([9]);
    expect(crewConflictLabel(flags)).toBe('holiday');
    expect(staffDayFlags({
      holidays: [],
      bookings: [{ user_id: '3', job_id: '9', job_title: 'Guttering', work_date: '2026-09-22' }],
      userId: 3,
      iso: '2026-09-22',
      excludeJobId: '8',
    }).busyOn.map((b) => b.job_id)).toEqual(['9']);
    expect(jobConflictCaption(
      [{ user_id: 3 }],
      { holidays, bookings: bookingsFromJobs(jobs, '2026-09-22'), iso: '2026-09-22', excludeJobId: 8 },
    )).toBe('Holiday or already booked');
    expect(crewSaveConflicts({
      staff: [{ id: 3, name: 'Jamie' }],
      selectedIds: [3],
      holidays,
      bookings: bookingsFromJobs(jobs, '2026-09-22'),
      iso: '2026-09-22',
      excludeJobId: 8,
    }).map((row) => row.type)).toEqual(['holiday', 'double_book']);
  });

  it('sorts team availability as available then busy then holiday', () => {
    const staff = [
      { id: 1, name: 'Ryan', skills: ['roofer'] },
      { id: 2, name: 'Callum', skills: ['labourer'] },
      { id: 3, name: 'Jamie', skills: ['roofer'] },
    ];
    const rows = teamAvailabilityRows(
      staff,
      [{ user_id: 3, start_date: '2026-10-02', end_date: '2026-10-02' }],
      [{ id: 8, title: 'Full re-roof', day_assignments: [{ work_date: '2026-10-02', user_id: 1, name: 'Ryan' }] }],
      '2026-10-02',
    );
    expect(rows.map((r) => [r.person.name, r.status])).toEqual([
      ['Callum', 'available'],
      ['Ryan', 'busy'],
      ['Jamie', 'holiday'],
    ]);
    expect(rows[1].jobs[0].job_title).toBe('Full re-roof');
  });

  it('merges calendar bookings with the availability overlay', () => {
    const fromJobs = bookingsFromJobs([
      {
        id: 10,
        title: 'test',
        day_assignments: [{ work_date: '2026-10-04', user_id: 9, name: 'newtest1122' }],
      },
    ], '2026-10-04');
    const overlay = [
      { user_id: 9, job_id: 10, job_title: 'test', work_date: '2026-10-04' },
      { user_id: 6, job_id: 16, job_title: 'eee', work_date: '2026-10-04' },
    ];
    const merged = mergeCrewBookings(fromJobs, overlay);
    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.job_id).sort()).toEqual([10, 16]);
  });
});

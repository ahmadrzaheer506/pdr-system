import { describe, it, expect } from 'vitest';
import { canChangeVisit, canCompleteVisit, visitTitle, visitTypeLabel, normalizeStaffVisitView, visitMatchesView, staffVisitCounts } from './visitTypes';

describe('visit types (requirement 5.3)', () => {
  it('labels the four visit types', () => {
    expect(visitTypeLabel('site_visit')).toBe('Site visit');
    expect(visitTypeLabel('follow_up')).toBe('Follow-up');
    expect(visitTypeLabel('measure')).toBe('Measure');
    expect(visitTypeLabel('other')).toBe('Other');
    expect(visitTitle('measure', 'Dave Whitfield')).toBe('Measure — Dave Whitfield');
  });

  it('allows change only for booked visits that have not ended', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    expect(canChangeVisit({ status: 'booked', end: '2026-10-10T10:00:00.000Z' }, now)).toBe(true);
    expect(canChangeVisit({ status: 'booked', end: '2026-03-10T10:00:00.000Z' }, now)).toBe(false);
    expect(canChangeVisit({ status: 'cancelled', end: '2026-10-10T10:00:00.000Z' }, now)).toBe(false);
    expect(canChangeVisit({ status: 'done', end: '2026-10-10T10:00:00.000Z' }, now)).toBe(false);
  });

  it('allows completing any booked visit', () => {
    expect(canCompleteVisit({ status: 'booked', end: '2026-03-10T10:00:00.000Z' })).toBe(true);
    expect(canCompleteVisit({ status: 'done' })).toBe(false);
    expect(canCompleteVisit({ status: 'cancelled' })).toBe(false);
  });

  it('defaults the staff visit list to uncompleted', () => {
    expect(normalizeStaffVisitView(null)).toBe('uncompleted');
    expect(normalizeStaffVisitView('completed')).toBe('completed');
    expect(normalizeStaffVisitView('all')).toBe('all');
    const visits = [
      { status: 'booked' },
      { status: 'done' },
      { status: 'cancelled' },
    ];
    expect(staffVisitCounts(visits)).toEqual({ uncompleted: 1, completed: 1, all: 2 });
    expect(visitMatchesView(visits[0], 'uncompleted')).toBe(true);
    expect(visitMatchesView(visits[1], 'uncompleted')).toBe(false);
    expect(visitMatchesView(visits[1], 'completed')).toBe(true);
  });
});

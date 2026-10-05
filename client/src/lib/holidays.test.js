import { describe, it, expect } from 'vitest';
import {
  HOLIDAY_KIND_MULTI,
  HOLIDAY_KIND_SINGLE,
  holidayDateRange,
  holidayKindLabel,
  holidayKindOf,
  holidayPayload,
  kindFromDates,
} from './holidays.js';

describe('holiday kinds', () => {
  it('treats matching dates as a single day', () => {
    expect(kindFromDates('2026-09-26', '2026-09-26')).toBe(HOLIDAY_KIND_SINGLE);
    expect(kindFromDates('2026-09-26', '2026-09-28')).toBe(HOLIDAY_KIND_MULTI);
  });

  it('formats a single date or an inclusive range', () => {
    expect(holidayDateRange({ start_date: '2026-09-26', end_date: '2026-09-26' })).toBe('2026-09-26');
    expect(holidayDateRange({ start_date: '2026-09-26', end_date: '2026-09-28' })).toBe('2026-09-26 – 2026-09-28');
    expect(holidayKindLabel(holidayKindOf({ kind: 'multi' }))).toBe('Multi day');
  });

  it('sends matching start and end for a single day', () => {
    expect(holidayPayload({
      kind: HOLIDAY_KIND_SINGLE, start: '2026-09-26', end: '2026-09-28', reason: '', userId: '4',
    })).toEqual({
      kind: 'single', start_date: '2026-09-26', end_date: '2026-09-26', reason: '', user_id: 4,
    });
    expect(holidayPayload({
      kind: HOLIDAY_KIND_MULTI, start: '2026-09-26', end: '2026-09-28', reason: 'Family',
    })).toEqual({
      kind: 'multi', start_date: '2026-09-26', end_date: '2026-09-28', reason: 'Family',
    });
  });
});

import { describe, it, expect } from 'vitest';
import { formatClockTime } from './clockTime';

describe('formatClockTime', () => {
  it('converts a UTC ISO timestamp to the local clock time', () => {
    const iso = '2026-10-02T14:29:00.000Z';
    const d = new Date(iso);
    const expected = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(formatClockTime(iso)).toBe(expected);
  });

  it('returns an empty string for a missing value', () => {
    expect(formatClockTime(null)).toBe('');
    expect(formatClockTime('')).toBe('');
  });
});

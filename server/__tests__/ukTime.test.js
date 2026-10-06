'use strict';

const { ymdInZone, addCalendarDays, zoneDayStart, zoneDayEnd } = require('../ukTime');

describe('ukTime (Europe/London report calendar)', () => {
  test('formats a BST afternoon as the London calendar day', () => {
    expect(ymdInZone(new Date('2026-09-28T12:00:00.000Z'))).toBe('2026-09-28');
  });

  test('keeps the previous London day just after UK midnight in winter', () => {
    expect(ymdInZone(new Date('2026-01-15T00:30:00.000Z'))).toBe('2026-01-15');
    expect(ymdInZone(new Date('2026-01-15T00:10:00.000Z'))).toBe('2026-01-15');
  });

  test('BST midnight is the previous UTC calendar day', () => {
    expect(ymdInZone(new Date('2026-10-06T23:10:00.000Z'))).toBe('2026-10-07');
  });

  test('adds whole calendar days', () => {
    expect(addCalendarDays('2026-09-28', -30)).toBe('2026-08-29');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('London day bounds follow BST in October', () => {
    expect(zoneDayStart('2026-10-06').toISOString()).toBe('2026-10-05T23:00:00.000Z');
    expect(zoneDayEnd('2026-10-06').toISOString()).toBe('2026-10-06T22:59:59.999Z');
  });
});

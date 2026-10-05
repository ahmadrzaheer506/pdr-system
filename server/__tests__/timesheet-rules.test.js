const {
  parseTimesheets,
  parseHolidayAllowanceDays,
  parseUserHolidayAllowance,
  KEYS,
} = require('../timesheetRules');

describe('timesheet rules parse (requirement 17.3)', () => {
  test('accepts the eight stored keys', () => {
    expect(KEYS).toEqual([
      'enabled',
      'require_location',
      'site_radius_m',
      'require_photo_on_clockout',
      'auto_break_minutes',
      'auto_break_after_hours',
      'round_to_minutes',
      'max_shift_hours',
    ]);
    const parsed = parseTimesheets({
      enabled: false,
      require_location: true,
      site_radius_m: 100,
      require_photo_on_clockout: false,
      auto_break_minutes: 15,
      auto_break_after_hours: 4,
      round_to_minutes: 5,
      max_shift_hours: 10,
    });
    expect(parsed.value.enabled).toBe(false);
    expect(parsed.value.site_radius_m).toBe(100);
  });

  test('rejects a boolean sent as a string', () => {
    expect(parseTimesheets({ enabled: 'true' }).error).toMatch(/enabled/);
  });

  test('keeps only the eight stored keys', () => {
    const parsed = parseTimesheets({ enabled: true, extra: 1 });
    expect(parsed.value.enabled).toBe(true);
    expect(parsed.value.extra).toBeUndefined();
  });
});

describe('holiday allowance parse (requirement 17.3)', () => {
  test('company default is 0–365', () => {
    expect(parseHolidayAllowanceDays(28).value).toBe(28);
    expect(parseHolidayAllowanceDays(-1).error).toMatch(/0–365/);
  });

  test('blank create inherits; blank update omits', () => {
    expect(parseUserHolidayAllowance('', { allowInherit: true })).toEqual({ inherit: true });
    expect(parseUserHolidayAllowance('   ', { allowInherit: true })).toEqual({ inherit: true });
    expect(parseUserHolidayAllowance(undefined)).toEqual({ omit: true });
    expect(parseUserHolidayAllowance(20).value).toBe(20);
  });
});

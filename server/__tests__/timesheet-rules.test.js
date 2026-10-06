const {
  parseTimesheets,
  publicTimesheets,
  parseHolidayAllowanceDays,
  parseUserHolidayAllowance,
  KEYS,
} = require('../timesheetRules');

describe('timesheet rules parse (requirement 17.3)', () => {
  test('accepts the stored timesheet keys', () => {
    expect(KEYS).toEqual([
      'enabled',
      'require_location',
      'site_radius_m',
      'require_photo_on_clockout',
      'round_to_minutes',
      'max_shift_hours',
    ]);
    const parsed = parseTimesheets({
      enabled: false,
      require_location: true,
      site_radius_m: 100,
      require_photo_on_clockout: false,
      round_to_minutes: 5,
      max_shift_hours: 10,
    });
    expect(parsed.value.enabled).toBe(false);
    expect(parsed.value.site_radius_m).toBe(100);
  });

  test('rejects a boolean sent as a string', () => {
    expect(parseTimesheets({ enabled: 'true' }).error).toMatch(/enabled/);
  });

  test('keeps only the stored timesheet keys and drops auto-break', () => {
    const parsed = parseTimesheets({
      enabled: true,
      extra: 1,
      auto_break_minutes: 15,
      auto_break_after_hours: 4,
    });
    expect(parsed.value.enabled).toBe(true);
    expect(parsed.value.extra).toBeUndefined();
    expect(parsed.value.auto_break_minutes).toBeUndefined();
    expect(parsed.value.auto_break_after_hours).toBeUndefined();
  });

  test('publicTimesheets hides retired auto-break keys from stored JSON', () => {
    expect(publicTimesheets({
      enabled: true,
      site_radius_m: 250,
      auto_break_minutes: 30,
      auto_break_after_hours: 6,
    })).toEqual({ enabled: true, site_radius_m: 250 });
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

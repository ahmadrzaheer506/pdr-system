/**
 * Company timesheet rules stored in settings JSON (requirement 17.3).
 * Clock-in/out reads enabled, site_radius_m, round_to_minutes, and max_shift_hours.
 */
const KEYS = Object.freeze([
  'enabled',
  'require_location',
  'site_radius_m',
  'require_photo_on_clockout',
  'round_to_minutes',
  'max_shift_hours',
]);

const BOOL_KEYS = Object.freeze([
  'enabled',
  'require_location',
  'require_photo_on_clockout',
]);

const NUMBER_LIMITS = Object.freeze({
  site_radius_m: [0, 10000],
  round_to_minutes: [0, 60],
  max_shift_hours: [0, 24],
});

function asBool(value, key) {
  if (typeof value === 'boolean') return { value };
  return { error: `${key} must be true or false` };
}

function asNumber(value, key, [min, max]) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    return { error: `${key} must be a number from ${min} to ${max}` };
  }
  return { value: n };
}

/**
 * @returns {{ value: object }|{ error: string }}
 */
function parseTimesheets(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Invalid timesheet rules' };
  }
  const next = {};
  for (const key of KEYS) {
    if (raw[key] === undefined) continue;
    if (BOOL_KEYS.includes(key)) {
      const parsed = asBool(raw[key], key);
      if (parsed.error) return parsed;
      next[key] = parsed.value;
      continue;
    }
    const parsed = asNumber(raw[key], key, NUMBER_LIMITS[key]);
    if (parsed.error) return parsed;
    next[key] = parsed.value;
  }
  return { value: next };
}

/**
 * Drop retired keys (auto-break) so they never leave the API or persist on save.
 */
function publicTimesheets(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const next = {};
  for (const key of KEYS) {
    if (src[key] !== undefined) next[key] = src[key];
  }
  return next;
}

/**
 * Company default annual holiday allowance in days (requirement 17.3).
 * @returns {{ value: number }|{ error: string }}
 */
function parseHolidayAllowanceDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 365) {
    return { error: 'Holiday allowance must be 0–365 days' };
  }
  return { value: n };
}

/**
 * Per-user allowance. Empty/omitted on create means inherit the company default.
 * @returns {{ value: number }|{ inherit: true }|{ error: string }}
 */
function parseUserHolidayAllowance(raw, { allowInherit } = {}) {
  if (typeof raw === 'string') raw = raw.trim();
  if (raw === undefined || raw === null || raw === '') {
    if (allowInherit) return { inherit: true };
    return { omit: true };
  }
  return parseHolidayAllowanceDays(raw);
}

module.exports = {
  KEYS,
  parseTimesheets,
  publicTimesheets,
  parseHolidayAllowanceDays,
  parseUserHolidayAllowance,
};

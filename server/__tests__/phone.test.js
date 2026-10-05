const { normalisePhone } = require('../phone');

describe('normalisePhone (requirement 2.5)', () => {
  test('keeps UK national digits and strips spaces', () => {
    expect(normalisePhone('07700 900100')).toBe('07700900100');
    expect(normalisePhone('0118-123-4567')).toBe('01181234567');
  });

  test('maps +44 and leading 44 onto a leading 0', () => {
    expect(normalisePhone('+447700900100')).toBe('07700900100');
    expect(normalisePhone('+44 7700 900100')).toBe('07700900100');
    expect(normalisePhone('447700900100')).toBe('07700900100');
  });

  test('returns null for empty or non-numeric input', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('not a number')).toBeNull();
  });
});

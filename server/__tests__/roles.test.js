jest.mock('../models', () => ({
  User: { findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const jwt = require('jsonwebtoken');
const { ROLES, ROLE_VALUES, isValidRole, signToken } = require('../auth');

describe('three-role model (requirement 1.4)', () => {
  test('has exactly three stored values: ADMIN, OFFICE, STAFF', () => {
    expect(ROLE_VALUES).toEqual(['ADMIN', 'OFFICE', 'STAFF']);
    expect(ROLES.ADMIN).toBe('ADMIN');
    expect(ROLES.OFFICE).toBe('OFFICE');
    expect(ROLES.STAFF).toBe('STAFF');
  });

  test('isValidRole accepts only the stored values, not spec names', () => {
    expect(isValidRole(ROLES.ADMIN)).toBe(true);
    expect(isValidRole(ROLES.OFFICE)).toBe(true);
    expect(isValidRole(ROLES.STAFF)).toBe(true);
    expect(isValidRole('DIRECTOR')).toBe(false);
    expect(isValidRole('OPERATIVE')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
  });

  test('JWT payload carries the stored role string', () => {
    for (const role of ROLE_VALUES) {
      const token = signToken({ id: 1, role });
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      expect(payload.role).toBe(role);
    }
  });
});

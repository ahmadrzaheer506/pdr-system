import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_VALUES, isValidRole, canSeeLabourCosts } from './roles';

describe('three-role model (requirement 1.4)', () => {
  it('stores Director, Office, and Operative as ADMIN, OFFICE, STAFF', () => {
    expect(ROLE_VALUES).toEqual(['ADMIN', 'OFFICE', 'STAFF']);
    expect(ROLES.ADMIN).toBe('ADMIN');
    expect(ROLES.OFFICE).toBe('OFFICE');
    expect(ROLES.STAFF).toBe('STAFF');
  });

  it('accepts only those three stored values', () => {
    expect(isValidRole('ADMIN')).toBe(true);
    expect(isValidRole('OFFICE')).toBe(true);
    expect(isValidRole('STAFF')).toBe(true);
    expect(isValidRole('DIRECTOR')).toBe(false);
    expect(isValidRole('OPERATIVE')).toBe(false);
    expect(isValidRole('SUPERUSER')).toBe(false);
  });

  it('gates labour costing for restricted office users (requirement 1.6)', () => {
    expect(canSeeLabourCosts({ role: 'ADMIN', financials_restricted: true })).toBe(true);
    expect(canSeeLabourCosts({ role: 'OFFICE', financials_restricted: false })).toBe(true);
    expect(canSeeLabourCosts({ role: 'OFFICE', financials_restricted: true })).toBe(false);
    expect(canSeeLabourCosts({ role: 'STAFF' })).toBe(false);
  });
});

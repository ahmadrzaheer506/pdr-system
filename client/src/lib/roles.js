/**
 * Requirement 1.4 — three-role model.
 * Spec names: Director, Office, Operative.
 * Stored and API values stay ADMIN, OFFICE, STAFF (no rename, no UI label change).
 */
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  OFFICE: 'OFFICE',
  STAFF: 'STAFF',
});

export const ROLE_VALUES = Object.freeze([ROLES.ADMIN, ROLES.OFFICE, ROLES.STAFF]);

export function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}

/**
 * Job costing / labour-cost for office users (requirement 1.6).
 * Pay rates (hourly_cost, cis_status) are requirement 1.8 — OFFICE may see them; only ADMIN edits.
 */
export function canSeeLabourCosts(user) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.OFFICE) return !user.financials_restricted;
  return false;
}

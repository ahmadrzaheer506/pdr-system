/**
 * Requirement 1.4 — three-role model.
 *
 * Spec names: Director, Office, Operative.
 * Stored, API, and JWT values stay ADMIN, OFFICE, STAFF (no rename).
 */
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  OFFICE: 'OFFICE',
  STAFF: 'STAFF',
});

const ROLE_VALUES = Object.freeze([ROLES.ADMIN, ROLES.OFFICE, ROLES.STAFF]);

/**
 * @param {unknown} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}

module.exports = { ROLES, ROLE_VALUES, isValidRole };

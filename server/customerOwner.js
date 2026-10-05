/**
 * Pipeline card owner (requirement 4.4). Office users only — not field staff.
 * Auto-set on create; editable afterwards. Inbound webhooks stay unassigned.
 */
const { Op } = require('sequelize');
const { User } = require('./models');
const { ROLES } = require('./roles');
const { plain } = require('./db');

const OFFICE_OWNER_ROLES = Object.freeze([ROLES.ADMIN, ROLES.OFFICE]);

/**
 * @param {unknown} value
 * @returns {{ skip: true }|{ value: number|null }|{ error: string }}
 */
function parseOwnerAssignment(value) {
  if (value === undefined) return { skip: true };
  if (value === null || value === '' || value === 'unassigned') return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid owner' };
  return { value: n };
}

/**
 * @param {number|null} ownerId
 * @returns {Promise<{ value: number|null }|{ error: string }>}
 */
async function assertAssignableOwner(ownerId) {
  if (ownerId == null) return { value: null };
  const user = await User.findByPk(ownerId);
  if (!user || !user.active || !OFFICE_OWNER_ROLES.includes(user.role)) {
    return { error: 'Owner must be an active office user' };
  }
  return { value: user.id };
}

/** Active director/office users for owner pickers and the pipeline filter. */
async function listOfficeOwners() {
  const rows = await User.findAll({
    where: { active: true, role: { [Op.in]: OFFICE_OWNER_ROLES } },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
  });
  return plain(rows).map((u) => ({ id: u.id, name: u.name }));
}

module.exports = {
  OFFICE_OWNER_ROLES,
  parseOwnerAssignment,
  assertAssignableOwner,
  listOfficeOwners,
};

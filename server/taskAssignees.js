/**
 * Office / field-staff assignees on a task. Directors (ADMIN) cannot be assigned.
 */
const { Op } = require('sequelize');
const { User, TaskAssignee } = require('./models');
const { ROLES } = require('./roles');

const ASSIGNABLE_ROLES = [ROLES.OFFICE, ROLES.STAFF];

/**
 * @param {unknown} raw
 * @returns {{ ids: number[] }|{ error: string }}
 */
function parseAssigneeIds(raw) {
  const source = Array.isArray(raw) ? raw : (raw != null && raw !== '' ? [raw] : []);
  const ids = [];
  for (const item of source) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1) return { error: 'Invalid assignee' };
    if (!ids.includes(n)) ids.push(n);
  }
  return { ids };
}

/**
 * @param {number[]} ids
 * @returns {Promise<{ ids: number[] }|{ error: string }>}
 */
async function assertAssignableUsers(ids) {
  if (!ids.length) return { error: 'Assign at least one office or field staff user' };
  const users = await User.findAll({
    where: {
      id: { [Op.in]: ids },
      role: { [Op.in]: ASSIGNABLE_ROLES },
      active: true,
    },
    attributes: ['id'],
  });
  if (users.length !== ids.length) {
    return { error: 'Assign office or field staff only' };
  }
  return { ids };
}

/**
 * @param {number} taskId
 * @param {number[]} ids
 * @param {{ transaction?: object }} [opts]
 */
async function replaceAssignees(taskId, ids, opts = {}) {
  await TaskAssignee.destroy({ where: { task_id: taskId }, transaction: opts.transaction });
  if (!ids.length) return;
  await TaskAssignee.bulkCreate(
    ids.map((user_id) => ({ task_id: taskId, user_id })),
    { transaction: opts.transaction },
  );
}

/**
 * @param {Array<{ id: number, name: string, role: string }>} users
 */
function publicAssignees(users) {
  return (users || []).map((u) => {
    const o = u && typeof u.toJSON === 'function' ? u.toJSON() : u;
    return { id: o.id, name: o.name, role: o.role };
  });
}

/**
 * Task ids assigned to a user (requirement 12.3 — field staff see only their own).
 * @param {number} userId
 * @returns {Promise<number[]>}
 */
async function assignedTaskIds(userId) {
  const rows = await TaskAssignee.findAll({
    where: { user_id: userId },
    attributes: ['task_id'],
  });
  return [...new Set(rows.map((row) => Number(row.task_id)).filter((id) => Number.isInteger(id) && id > 0))];
}

module.exports = {
  ASSIGNABLE_ROLES,
  parseAssigneeIds,
  assertAssignableUsers,
  replaceAssignees,
  publicAssignees,
  assignedTaskIds,
};

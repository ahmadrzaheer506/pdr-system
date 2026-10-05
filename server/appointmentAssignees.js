/**
 * Office / field-staff assignees on a site visit (same rules as tasks).
 */
const { AppointmentAssignee, User } = require('./models');
const {
  parseAssigneeIds,
  assertAssignableUsers,
  publicAssignees,
} = require('./taskAssignees');

async function replaceAppointmentAssignees(appointmentId, ids, opts = {}) {
  await AppointmentAssignee.destroy({
    where: { appointment_id: appointmentId },
    transaction: opts.transaction,
  });
  if (!ids.length) return;
  await AppointmentAssignee.bulkCreate(
    ids.map((user_id) => ({ appointment_id: appointmentId, user_id })),
    { transaction: opts.transaction },
  );
}

async function assignedAppointmentIds(userId) {
  const rows = await AppointmentAssignee.findAll({
    where: { user_id: userId },
    attributes: ['appointment_id'],
  });
  return [...new Set(
    rows.map((row) => Number(row.appointment_id)).filter((id) => Number.isInteger(id) && id > 0),
  )];
}

async function userAssignedToVisit(appointmentId, userId) {
  const row = await AppointmentAssignee.findOne({
    where: { appointment_id: appointmentId, user_id: Number(userId) },
  });
  return !!row;
}

const assigneeInclude = {
  association: 'assignees',
  attributes: ['id', 'name', 'role'],
  through: { attributes: [] },
};

function decorateAssignees(appointment) {
  const assignees = publicAssignees(appointment.assignees);
  return {
    assignees,
    assignee_ids: assignees.map((a) => a.id),
    assignee_name: assignees.map((a) => a.name).join(', ') || null,
  };
}

module.exports = {
  parseAssigneeIds,
  assertAssignableUsers,
  publicAssignees,
  replaceAppointmentAssignees,
  assignedAppointmentIds,
  userAssignedToVisit,
  assigneeInclude,
  decorateAssignees,
};

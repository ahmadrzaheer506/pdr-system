/**
 * Hard-delete helpers for customers and staff accounts.
 * Previews list related / pending work so the UI can warn before confirm.
 */
const { Op } = require('sequelize');
const {
  sequelize,
  Customer,
  Lead,
  Message,
  Quote,
  Job,
  Invoice,
  Appointment,
  AppointmentAssignee,
  Task,
  TaskAssignee,
  JobAssignment,
  JobDayAssignment,
  JobMessage,
  TeamMessage,
  Activity,
  StageHistory,
  CalendarSyncLink,
  Notification,
  HolidayRequest,
  Timesheet,
  InvoicePayment,
  CustomerNote,
  CustomerFile,
  User,
  AiProposal,
} = require('./models');

const PENDING_JOB_STATUSES = Object.freeze(['PENDING', 'SCHEDULED', 'IN_PROGRESS']);
const CONTACT_NULL = { site_id: null, phone_id: null, email_id: null };

function noun(n, one, many) {
  const count = Number(n) || 0;
  return `${count} ${count === 1 ? one : many}`;
}

function uniqueIds(rows, key = 'id') {
  return [...new Set((rows || []).map((row) => Number(row[key])).filter((id) => Number.isFinite(id) && id > 0))];
}

function customerDeleteWarning(counts) {
  const sentences = [];
  if (counts.leads > 0) {
    sentences.push(`This customer has ${noun(counts.leads, 'lead', 'leads')}.`);
  }
  const related = [];
  if (counts.messages > 0) related.push(noun(counts.messages, 'message', 'messages'));
  if (counts.quotes > 0) related.push(noun(counts.quotes, 'quote', 'quotes'));
  if (counts.appointments > 0) related.push(noun(counts.appointments, 'site visit', 'site visits'));
  if (counts.jobs > 0) related.push(noun(counts.jobs, 'job', 'jobs'));
  if (counts.invoices > 0) related.push(noun(counts.invoices, 'invoice', 'invoices'));
  if (counts.notes > 0) related.push(noun(counts.notes, 'internal note', 'internal notes'));
  if (counts.files > 0) related.push(noun(counts.files, 'file', 'files'));
  if (related.length > 0) {
    sentences.push(`Deleting this customer also deletes related records (${related.join(', ')}).`);
  }
  if (sentences.length === 0) {
    return 'Are you sure you want to delete this customer?';
  }
  sentences.push('This cannot be undone.');
  return sentences.join(' ');
}

function staffDeleteWarning(counts) {
  const pending = [];
  if (counts.pending_tasks > 0) {
    pending.push(`This user has ${noun(counts.pending_tasks, 'pending task', 'pending tasks')}.`);
  }
  if (counts.pending_visits > 0) {
    pending.push(`This user has ${noun(counts.pending_visits, 'pending site visit', 'pending site visits')}.`);
  }
  if (counts.pending_jobs > 0) {
    pending.push(`This user has ${noun(counts.pending_jobs, 'job still on the schedule', 'jobs still on the schedule')}.`);
  }
  if (pending.length === 0) {
    return 'Are you sure you want to delete this user?';
  }
  return `${pending.join(' ')} Deleting this account unassigns them from that work. This cannot be undone.`;
}

async function customerDeleteImpact(customerId) {
  const id = Number(customerId);
  const [leads, messages, quotes, jobs, invoices, appointments, notes, files] = await Promise.all([
    Lead.count({ where: { customer_id: id } }),
    Message.count({ where: { customer_id: id } }),
    Quote.count({ where: { customer_id: id } }),
    Job.count({ where: { customer_id: id } }),
    Invoice.count({ where: { customer_id: id } }),
    Appointment.count({ where: { customer_id: id } }),
    CustomerNote.count({ where: { customer_id: id } }),
    CustomerFile.count({ where: { customer_id: id } }),
  ]);
  const counts = { leads, messages, quotes, jobs, invoices, appointments, notes, files };
  return { ...counts, warning: customerDeleteWarning(counts) };
}

async function idsForCustomer(customerId, Model) {
  const rows = await Model.findAll({ where: { customer_id: customerId }, attributes: ['id'] });
  return uniqueIds(rows);
}

async function destroyCustomer(customerId, { transaction } = {}) {
  const id = Number(customerId);
  const run = async (t) => {
    const [leadIds, quoteIds, jobIds, invoiceIds, appointmentIds] = await Promise.all([
      idsForCustomer(id, Lead),
      idsForCustomer(id, Quote),
      idsForCustomer(id, Job),
      idsForCustomer(id, Invoice),
      idsForCustomer(id, Appointment),
    ]);

    const entityOr = [
      { entity_type: 'customer', entity_id: id },
      leadIds.length ? { entity_type: { [Op.in]: ['lead'] }, entity_id: { [Op.in]: leadIds } } : null,
      quoteIds.length ? { entity_type: 'quote', entity_id: { [Op.in]: quoteIds } } : null,
      jobIds.length ? { entity_type: 'job', entity_id: { [Op.in]: jobIds } } : null,
      invoiceIds.length ? { entity_type: 'invoice', entity_id: { [Op.in]: invoiceIds } } : null,
      appointmentIds.length ? { entity_type: 'appointment', entity_id: { [Op.in]: appointmentIds } } : null,
    ].filter(Boolean);

    if (entityOr.length) {
      await Task.destroy({ where: { [Op.or]: entityOr }, transaction: t });
      const calendarOr = [];
      if (appointmentIds.length) calendarOr.push({ entity_type: 'appointment', entity_id: { [Op.in]: appointmentIds } });
      if (jobIds.length) calendarOr.push({ entity_type: 'job', entity_id: { [Op.in]: jobIds } });
      if (calendarOr.length) {
        await CalendarSyncLink.destroy({ where: { [Op.or]: calendarOr }, transaction: t });
      }
    }

    if (invoiceIds.length) {
      await Invoice.update({ job_id: null }, { where: { id: { [Op.in]: invoiceIds } }, transaction: t });
    }
    if (jobIds.length) {
      await Job.update(
        { quote_id: null, lead_id: null, ...CONTACT_NULL },
        { where: { id: { [Op.in]: jobIds } }, transaction: t },
      );
    }
    if (quoteIds.length) {
      await Quote.update(
        { lead_id: null, revised_from_id: null, ...CONTACT_NULL },
        { where: { id: { [Op.in]: quoteIds } }, transaction: t },
      );
    }
    if (appointmentIds.length) {
      await Appointment.update(
        { lead_id: null, ...CONTACT_NULL },
        { where: { id: { [Op.in]: appointmentIds } }, transaction: t },
      );
    }
    if (leadIds.length) {
      await Lead.update(CONTACT_NULL, { where: { id: { [Op.in]: leadIds } }, transaction: t });
    }

    await Customer.destroy({ where: { id }, transaction: t });
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

async function openTaskIdsForUser(userId) {
  const joinRows = await TaskAssignee.findAll({ where: { user_id: userId }, attributes: ['task_id'] });
  const joinIds = uniqueIds(joinRows, 'task_id');
  const or = [{ assignee_id: userId }];
  if (joinIds.length) or.push({ id: { [Op.in]: joinIds } });
  const rows = await Task.findAll({
    where: { status: 'open', [Op.or]: or },
    attributes: ['id'],
  });
  return uniqueIds(rows);
}

async function bookedVisitIdsForUser(userId) {
  const rows = await AppointmentAssignee.findAll({
    where: { user_id: userId },
    attributes: ['appointment_id'],
  });
  const appointmentIds = uniqueIds(rows, 'appointment_id');
  if (!appointmentIds.length) return [];
  const visits = await Appointment.findAll({
    where: { id: { [Op.in]: appointmentIds }, status: 'booked' },
    attributes: ['id'],
  });
  return uniqueIds(visits);
}

async function pendingJobIdsForUser(userId) {
  const [crew, days] = await Promise.all([
    JobAssignment.findAll({ where: { user_id: userId }, attributes: ['job_id'] }),
    JobDayAssignment.findAll({ where: { user_id: userId }, attributes: ['job_id'] }),
  ]);
  const jobIds = [...new Set([...uniqueIds(crew, 'job_id'), ...uniqueIds(days, 'job_id')])];
  if (!jobIds.length) return [];
  const jobs = await Job.findAll({
    where: { id: { [Op.in]: jobIds }, status: { [Op.in]: PENDING_JOB_STATUSES } },
    attributes: ['id'],
  });
  return uniqueIds(jobs);
}

async function staffDeleteImpact(userId) {
  const [taskIds, visitIds, jobIds] = await Promise.all([
    openTaskIdsForUser(userId),
    bookedVisitIdsForUser(userId),
    pendingJobIdsForUser(userId),
  ]);
  const counts = {
    pending_tasks: taskIds.length,
    pending_visits: visitIds.length,
    pending_jobs: jobIds.length,
  };
  return { ...counts, warning: staffDeleteWarning(counts) };
}

async function destroyStaffUser(userId, { transaction } = {}) {
  const id = Number(userId);
  const run = async (t) => {
    await Task.update({ assignee_id: null }, { where: { assignee_id: id }, transaction: t });
    await TaskAssignee.destroy({ where: { user_id: id }, transaction: t });
    await AppointmentAssignee.destroy({ where: { user_id: id }, transaction: t });
    await JobAssignment.destroy({ where: { user_id: id }, transaction: t });
    await JobDayAssignment.destroy({ where: { user_id: id }, transaction: t });
    await JobMessage.destroy({ where: { user_id: id }, transaction: t });
    await TeamMessage.destroy({ where: { user_id: id }, transaction: t });
    await Notification.destroy({ where: { user_id: id }, transaction: t });
    await CalendarSyncLink.destroy({ where: { user_id: id }, transaction: t });
    await HolidayRequest.destroy({ where: { user_id: id }, transaction: t });
    await Timesheet.destroy({ where: { user_id: id }, transaction: t });

    await Message.update({ user_id: null }, { where: { user_id: id }, transaction: t });
    await Customer.update({ owner_id: null }, { where: { owner_id: id }, transaction: t });
    await Quote.update({ created_by: null }, { where: { created_by: id }, transaction: t });
    await Appointment.update({ created_by: null }, { where: { created_by: id }, transaction: t });
    await Activity.update({ user_id: null }, { where: { user_id: id }, transaction: t });
    await StageHistory.update({ user_id: null }, { where: { user_id: id }, transaction: t });
    await CustomerNote.update({ user_id: null }, { where: { user_id: id }, transaction: t });
    await CustomerFile.update({ user_id: null }, { where: { user_id: id }, transaction: t });
    await InvoicePayment.update({ recorded_by: null }, { where: { recorded_by: id }, transaction: t });
    await HolidayRequest.update({ decided_by: null }, { where: { decided_by: id }, transaction: t });
    await Timesheet.update({ approved_by: null }, { where: { approved_by: id }, transaction: t });
    await AiProposal.update({ created_by: null }, { where: { created_by: id }, transaction: t });

    await User.destroy({ where: { id }, transaction: t });
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

module.exports = {
  PENDING_JOB_STATUSES,
  customerDeleteWarning,
  staffDeleteWarning,
  customerDeleteImpact,
  staffDeleteImpact,
  destroyCustomer,
  destroyStaffUser,
};

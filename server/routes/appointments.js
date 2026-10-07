const express = require('express');
const { Op } = require('sequelize');
const { Appointment, AppointmentAssignee, Customer, Lead, User } = require('../models');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { ROLES } = require('../roles');
const { setStage, logActivity, resolveLeadForCustomer } = require('../services/pipeline');
const { plain } = require('../db');
const contacts = require('../customerContacts');
const { parseVisitType, visitTitle, visitChangeBlock, VISIT_TYPE_VALUES } = require('../visitTypes');
const visitAssignees = require('../appointmentAssignees');
const calendarSync = require('../calendarSync');
const { completeVisit } = require('../services/taskEngine');

const router = express.Router();
router.use(requireAuth, requireOffice);

const assigneeInclude = {
  association: 'assignees',
  attributes: ['id', 'name', 'role'],
  through: { attributes: [] },
};

function leadDisplayName(lead, customerName) {
  const name = String(customerName || '').trim() || 'Unknown';
  const ref = String(lead?.ref || '').trim();
  return ref ? `${ref} - ${name}` : name;
}

function publicAppointment(row) {
  const o = plain(row);
  o.customer_name = o.Customer?.name;
  o.lead_ref = o.Lead?.ref || null;
  o.lead_name = leadDisplayName(o.Lead, o.customer_name);
  o.phone = o.selectedPhone?.value || null;
  Object.assign(o, visitAssignees.decorateAssignees(o));
  delete o.Customer;
  delete o.Lead;
  delete o.selectedPhone;
  return o;
}

async function parseRequiredAssignees(body) {
  const parsed = visitAssignees.parseAssigneeIds(
    body?.assignee_ids != null ? body.assignee_ids : body?.assignee_id,
  );
  if (parsed.error) return parsed;
  return visitAssignees.assertAssignableUsers(parsed.ids);
}

async function notifyStaffAssignees(userIds, { message, appointmentId }) {
  const { safeNotify, notifyUsers } = require('../notifications');
  const staffIds = [];
  if (userIds.length) {
    const users = await User.findAll({
      where: { id: { [Op.in]: userIds }, role: ROLES.STAFF, active: true },
      attributes: ['id'],
    });
    staffIds.push(...users.map((u) => u.id));
  }
  if (!staffIds.length) return;
  await safeNotify(() => notifyUsers(staffIds, {
    kind: 'visit_booked',
    message,
    entity_type: 'appointment',
    entity_id: appointmentId,
  }));
}

function parseDayBound(value, endOfDay) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

const LIST_STATUSES = Object.freeze(['booked', 'done', 'cancelled']);

function visitCounts(rows) {
  const counts = { all: 0, booked: 0, done: 0, cancelled: 0 };
  for (const row of rows) {
    counts.all += 1;
    if (row.status === 'booked') counts.booked += 1;
    else if (row.status === 'done') counts.done += 1;
    else if (row.status === 'cancelled') counts.cancelled += 1;
  }
  return counts;
}

router.get('/', asyncHandler(async (req, res) => {
  const { from, to, status, visit_type, q } = req.query;
  const where = {};
  if (status == null || status === '') {
    where.status = { [Op.ne]: 'cancelled' };
  } else if (status !== 'ALL') {
    if (!LIST_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    where.status = status;
  }
  if (visit_type && visit_type !== 'ALL') {
    if (!VISIT_TYPE_VALUES.includes(visit_type)) {
      return res.status(400).json({ error: 'Invalid visit type' });
    }
    where.visit_type = visit_type;
  }
  const fromAt = parseDayBound(from, false);
  const toAt = parseDayBound(to, true);
  if (from && !fromAt) return res.status(400).json({ error: 'Invalid from date' });
  if (to && !toAt) return res.status(400).json({ error: 'Invalid to date' });
  if (fromAt || toAt) {
    where.start = {};
    if (fromAt) where.start[Op.gte] = fromAt;
    if (toAt) where.start[Op.lte] = toAt;
  }
  const search = String(q || '').trim();
  if (search) {
    const like = `%${search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    where[Op.or] = [
      { title: { [Op.iLike]: like } },
      { address: { [Op.iLike]: like } },
      { '$Customer.name$': { [Op.iLike]: like } },
      { '$Lead.ref$': { [Op.iLike]: like } },
    ];
  }
  const visitIncludes = [
    { model: Customer, attributes: ['name'] },
    { model: Lead, attributes: ['id', 'ref'] },
    { association: 'selectedPhone', attributes: ['id', 'value'] },
    assigneeInclude,
  ];
  const rows = await Appointment.findAll({
    where,
    include: visitIncludes,
    order: [['start', 'ASC']],
  });
  const listed = rows.map(publicAppointment);
  let counts;
  if (!status || status === '' || status === 'ALL') {
    counts = visitCounts(listed);
  } else {
    const countWhere = { ...where };
    delete countWhere.status;
    const countRows = await Appointment.findAll({
      where: countWhere,
      include: [
        { model: Customer, attributes: ['name'] },
        { model: Lead, attributes: ['id', 'ref'] },
      ],
      attributes: ['id', 'status'],
    });
    counts = visitCounts(countRows.map(plain));
  }
  res.json({ appointments: listed, counts });
}));

function parseAppointmentTime(value, field) {
  if (value == null || value === '') return { error: `${field} required` };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `Invalid ${field}` };
  return { date };
}

router.post('/', asyncHandler(async (req, res) => {
  const { customer_id, title, start, end, address, notes } = req.body || {};
  if (!customer_id || !start) return res.status(400).json({ error: 'customer_id and start required' });
  const visitType = parseVisitType(req.body.visit_type, { required: true });
  if (visitType.error) return res.status(400).json({ error: visitType.error });
  const startAt = parseAppointmentTime(start, 'start');
  if (startAt.error) return res.status(400).json({ error: startAt.error });
  const assigned = await parseRequiredAssignees(req.body || {});
  if (assigned.error) return res.status(400).json({ error: assigned.error });
  const customer = await contacts.loadCustomerWithContacts(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  let lead = null;
  try {
    lead = await resolveLeadForCustomer(customer_id, req.body.lead_id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const picked = await contacts.resolveCustomerContactSelection(customer_id, req.body || {});
  if (picked.error) return res.status(400).json({ error: picked.error });
  let endTime = new Date(startAt.date.getTime() + 60 * 60 * 1000);
  if (end) {
    const endAt = parseAppointmentTime(end, 'end');
    if (endAt.error) return res.status(400).json({ error: endAt.error });
    endTime = endAt.date;
  }
  const useAddress = address || contacts.formatSite(picked.site) || customer.address;
  const useTitle = title || visitTitle(visitType.value, customer.name);

  const created = await Appointment.create({
    customer_id,
    lead_id: lead?.id || null,
    title: useTitle,
    start: startAt.date,
    end: endTime,
    address: useAddress,
    notes: notes || null,
    gcal_event_id: null,
    gcal_status: 'not_synced',
    created_by: req.user.id,
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
    visit_type: visitType.value,
  });
  await visitAssignees.replaceAppointmentAssignees(created.id, assigned.ids);
  await calendarSync.syncAppointment(created.id);
  const synced = await Appointment.findByPk(created.id, { attributes: ['gcal_status'] });
  const gcalStatus = synced?.gcal_status || 'not_synced';

  /** Requirement 5.1: only Enquiry moves to Site visit booked. Later stages stay put. */
  const enquiryStage = lead?.stage || customer.stage;
  if (enquiryStage === 'ENQUIRY') {
    if (lead?.id) {
      await setStage(customer_id, 'SITE_VISIT_BOOKED', req.user.id, 'Site visit booked', { leadId: lead.id });
    } else {
      await setStage(customer_id, 'SITE_VISIT_BOOKED', req.user.id, 'Site visit booked');
    }
  }
  await logActivity(customer_id, req.user.id, 'appointment_booked',
    `Site visit booked for ${startAt.date.toLocaleString('en-GB', { timeZone: 'Europe/London' })}${gcalStatus === 'synced' ? ' (in Google Calendar)' : ''}`,
    'appointment', created.id);
  {
    const { safeNotify, notifyOffice } = require('../notifications');
    const when = startAt.date.toLocaleString('en-GB', { timeZone: 'Europe/London' });
    await safeNotify(() => notifyOffice({
      kind: 'visit_booked',
      message: `${customer.name} — ${useTitle} on ${when}`,
      entity_type: 'customer',
      entity_id: customer.id,
    }, { excludeId: req.user.id }));
    await notifyStaffAssignees(assigned.ids, {
      message: `You're assigned to ${useTitle} on ${when}`,
      appointmentId: created.id,
    });
  }
  res.json({ id: created.id, gcal_status: gcalStatus });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const a = await Appointment.findByPk(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  const blocked = visitChangeBlock(a);
  if (blocked) return res.status(400).json({ error: blocked.error });

  const { title, start, end, address, notes, status, site_id, phone_id, email_id } = req.body || {};
  const cancelling = status === 'cancelled';
  if (status && status !== 'cancelled' && status !== 'booked') {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const visitType = parseVisitType(req.body.visit_type);
  if (visitType.error) return res.status(400).json({ error: visitType.error });
  const nextType = visitType.skip ? a.visit_type : visitType.value;

  let nextAssignees = null;
  if (req.body?.assignee_ids !== undefined || req.body?.assignee_id !== undefined) {
    const assigned = await parseRequiredAssignees(req.body);
    if (assigned.error) return res.status(400).json({ error: assigned.error });
    nextAssignees = assigned.ids;
  }

  let newStart = a.start;
  let newEnd = a.end;
  if (!cancelling) {
    if (start) {
      const startAt = parseAppointmentTime(start, 'start');
      if (startAt.error) return res.status(400).json({ error: startAt.error });
      newStart = startAt.date;
    }
    if (end) {
      const endAt = parseAppointmentTime(end, 'end');
      if (endAt.error) return res.status(400).json({ error: endAt.error });
      newEnd = endAt.date;
    } else if (start) {
      const span = new Date(a.end).getTime() - new Date(a.start).getTime();
      newEnd = new Date(newStart.getTime() + (Number.isFinite(span) && span > 0 ? span : 60 * 60 * 1000));
    }
  }

  const picked = await contacts.resolveCustomerContactSelection(a.customer_id, {
    site_id: site_id !== undefined ? site_id : a.site_id,
    phone_id: phone_id !== undefined ? phone_id : a.phone_id,
    email_id: email_id !== undefined ? email_id : a.email_id,
  });
  if (picked.error) return res.status(400).json({ error: picked.error });
  const useAddress = address !== undefined ? address : (site_id !== undefined ? contacts.formatSite(picked.site) : a.address);
  const customer = await contacts.loadCustomerWithContacts(a.customer_id);
  const useTitle = title || (visitType.skip ? a.title : visitTitle(nextType, customer?.name || 'Customer'));

  let previousAssigneeIds = [];
  if (nextAssignees) {
    const current = await AppointmentAssignee.findAll({
      where: { appointment_id: a.id },
      attributes: ['user_id'],
    });
    previousAssigneeIds = current.map((row) => row.user_id);
  }

  await a.update({
    title: useTitle,
    start: newStart,
    end: newEnd,
    address: useAddress,
    notes: notes !== undefined ? notes : a.notes,
    status: cancelling ? 'cancelled' : a.status,
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
    visit_type: nextType,
  });
  if (nextAssignees) {
    await visitAssignees.replaceAppointmentAssignees(a.id, nextAssignees);
  }
  await calendarSync.syncAppointment(a.id);
  const cancelNote = String(req.body.cancel_note || '').trim();
  const activity = cancelling
    ? (cancelNote ? `Site visit cancelled: ${cancelNote}` : 'Site visit cancelled')
    : 'Site visit updated';
  await logActivity(a.customer_id, req.user.id, 'appointment_updated', activity, 'appointment', a.id);
  if (nextAssignees && !cancelling) {
    const added = nextAssignees.filter((id) => !previousAssigneeIds.includes(id));
    if (added.length) {
      const when = new Date(newStart).toLocaleString('en-GB', { timeZone: 'Europe/London' });
      await notifyStaffAssignees(added, {
        message: `You're assigned to ${useTitle} on ${when}`,
        appointmentId: a.id,
      });
    }
  }
  res.json({ ok: true });
}));

function visitCompletedActivity(result, completeNote) {
  const summary = result.hasQuote
    ? 'Site visit completed — quote already on the lead'
    : 'Site visit completed — quote needed';
  return completeNote ? `${summary}. Remarks: ${completeNote}` : summary;
}

router.post('/:id/complete', asyncHandler(async (req, res) => {
  const a = await Appointment.findByPk(req.params.id, {
    include: [{ model: Customer, attributes: ['id', 'name', 'stage'] }],
  });
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  const completeNote = String(req.body?.complete_note || '').trim();
  try {
    const result = await completeVisit(a, setStage, req.user.id, completeNote);
    if (!result.already) {
      await logActivity(
        a.customer_id,
        req.user.id,
        'appointment_completed',
        visitCompletedActivity(result, completeNote),
        'appointment',
        a.id,
      );
    }
    res.json({ ok: true, already: !!result.already, has_quote: result.hasQuote, task_id: result.taskId || null });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

module.exports = router;

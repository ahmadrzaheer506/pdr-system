const express = require('express');
const { Op } = require('sequelize');
const { Appointment, AppointmentAssignee, Customer, User } = require('../models');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { ROLES } = require('../roles');
const { setStage, logActivity, resolveLeadForCustomer } = require('../services/pipeline');
const gcal = require('../integrations/gcal');
const { plain } = require('../db');
const contacts = require('../customerContacts');
const { parseVisitType, visitTitle, visitChangeBlock } = require('../visitTypes');
const visitAssignees = require('../appointmentAssignees');
const { completeVisit } = require('../services/taskEngine');

const router = express.Router();
router.use(requireAuth, requireOffice);

const assigneeInclude = {
  association: 'assignees',
  attributes: ['id', 'name', 'role'],
  through: { attributes: [] },
};

function publicAppointment(row) {
  const o = plain(row);
  o.customer_name = o.Customer?.name;
  o.phone = o.selectedPhone?.value || null;
  Object.assign(o, visitAssignees.decorateAssignees(o));
  delete o.Customer;
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

router.get('/', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const where = { status: { [Op.ne]: 'cancelled' } };
  if (from) where.start = { ...(where.start || {}), [Op.gte]: new Date(from) };
  if (to) where.start = { ...(where.start || {}), [Op.lte]: new Date(to) };
  const rows = await Appointment.findAll({
    where,
    include: [
      { model: Customer, attributes: ['name'] },
      { association: 'selectedPhone', attributes: ['id', 'value'] },
      assigneeInclude,
    ],
    order: [['start', 'ASC']],
  });
  res.json({ appointments: rows.map(publicAppointment) });
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

  let eventId = null, gcalStatus = 'simulated';
  try {
    const ev = await gcal.createEvent({
      title: useTitle,
      start: startAt.date.toISOString(),
      end: endTime.toISOString(),
      address: useAddress,
      notes,
      customerName: customer.name,
      userId: req.user.id,
    });
    eventId = ev.eventId;
    gcalStatus = ev.simulated ? 'simulated' : 'synced';
  } catch (err) {
    gcalStatus = 'not_synced';
    await logActivity(customer_id, req.user.id, 'gcal_error', `Calendar sync failed: ${String(err.message).slice(0, 150)}`);
  }

  const created = await Appointment.create({
    customer_id,
    lead_id: lead?.id || null,
    title: useTitle,
    start: startAt.date,
    end: endTime,
    address: useAddress,
    notes: notes || null,
    gcal_event_id: eventId,
    gcal_status: gcalStatus,
    created_by: req.user.id,
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
    visit_type: visitType.value,
  });
  await visitAssignees.replaceAppointmentAssignees(created.id, assigned.ids);

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
  if (a.gcal_event_id) {
    try {
      if (cancelling) await gcal.cancelEvent(a.gcal_event_id, a.created_by);
      else await gcal.updateEvent(a.gcal_event_id, { title: useTitle, start: newStart, end: newEnd, address: useAddress, notes: notes !== undefined ? notes : a.notes }, a.created_by);
    } catch { /* sync failure is non-fatal */ }
  }
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

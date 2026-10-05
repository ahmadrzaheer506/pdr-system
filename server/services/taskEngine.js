// ============================================================
// Reminders & Task Engine (PRD §10.4).
// System tasks are deduplicated by rule_key — a rule can fire
// repeatedly without spamming duplicates while one is open.
// ============================================================
const { Op } = require('sequelize');
const { Task, Appointment, Customer, Job, Invoice, Quote, User } = require('../models');
const { todayStr, plain } = require('../db');
const { resolveLeadForCustomer } = require('./pipeline');

async function ensureTask({ ruleKey, title, detail = null, dueDate = null, priority = 'normal', assigneeId = null, entityType = null, entityId = null }) {
  if (ruleKey) {
    const existing = await Task.findOne({ where: { rule_key: ruleKey, status: 'open' } });
    if (existing) return existing.id;
    const start = new Date(`${todayStr()}T00:00:00`);
    const end = new Date(start.getTime() + 86400000);
    const doneToday = await Task.findOne({
      where: {
        rule_key: ruleKey,
        status: { [Op.ne]: 'open' },
        done_at: { [Op.gte]: start, [Op.lt]: end },
      },
    });
    if (doneToday) return null;
  }
  const created = await Task.create({
    type: 'system',
    rule_key: ruleKey,
    title,
    detail,
    due_date: dueDate,
    priority,
    assignee_id: assigneeId,
    entity_type: entityType,
    entity_id: entityId,
  });
  return created.id;
}

async function resolveRule(ruleKey) {
  await Task.update(
    { status: 'done', done_at: new Date() },
    { where: { rule_key: ruleKey, status: 'open' } }
  );
}

function quoteFollowupRuleKey(quoteId) {
  return `quote_followup:quote:${quoteId}`;
}

function dueDateOnly(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? todayStr() : d.toISOString().slice(0, 10);
}

/**
 * One unassigned follow-up task per sent quote (requirement 12.2).
 * Due date is the first sequence step. Resend updates the open row; a later
 * send after resolve creates a new task even if the old one was done today.
 */
async function ensureQuoteFollowupTask(quote, firstStepAt) {
  const dueDate = dueDateOnly(firstStepAt);
  const ruleKey = quoteFollowupRuleKey(quote.id);
  const title = `Follow up quote ${quote.ref}`;
  const detail = `Automatic follow-up sequence is running. First step due ${dueDate}.`;
  const existing = await Task.findOne({ where: { rule_key: ruleKey, status: 'open' } });
  if (existing) {
    await existing.update({
      title,
      detail,
      due_date: dueDate,
      entity_type: 'quote',
      entity_id: quote.id,
    });
    return existing.id;
  }
  const created = await Task.create({
    type: 'system',
    rule_key: ruleKey,
    title,
    detail,
    due_date: dueDate,
    priority: 'normal',
    assignee_id: null,
    entity_type: 'quote',
    entity_id: quote.id,
  });
  return created.id;
}

async function resolveQuoteFollowupTask(quoteId) {
  await resolveRule(quoteFollowupRuleKey(quoteId));
}

async function customerHasQuote(customerId, leadId = null) {
  if (leadId) {
    const n = await Quote.count({ where: { lead_id: leadId } });
    return n > 0;
  }
  const n = await Quote.count({ where: { customer_id: customerId } });
  return n > 0;
}

/**
 * Tick a booked visit complete. Time passing must not call this.
 * No quote on the lead → Quote pending + produce-quote task.
 * Quote already on the lead → Quoted, no extra task.
 */
async function completeVisit(appointment, setStage, actorId = null, completeNote = '') {
  if (!appointment) {
    const err = new Error('Appointment not found');
    err.status = 404;
    throw err;
  }
  if (appointment.status === 'done') return { already: true, hasQuote: null, taskId: null };
  if (appointment.status !== 'booked') {
    const err = new Error('Only a booked visit can be completed');
    err.status = 400;
    throw err;
  }

  const note = String(completeNote || '').trim();
  appointment.status = 'done';
  appointment.stage_advanced = true;
  if (note) appointment.complete_note = note;
  if (typeof appointment.save === 'function') await appointment.save();
  else {
    await Appointment.update(
      { status: 'done', stage_advanced: true, ...(note ? { complete_note: note } : {}) },
      { where: { id: appointment.id } },
    );
  }

  const customer = appointment.Customer
    || await Customer.findByPk(appointment.customer_id, { attributes: ['id', 'name', 'stage'] });
  const lead = await resolveLeadForCustomer(appointment.customer_id, appointment.lead_id);
  const leadKey = lead?.id || appointment.lead_id || null;
  const stage = lead?.stage || customer?.stage;
  const name = customer?.name || 'the customer';
  const hasQuote = await customerHasQuote(appointment.customer_id, leadKey);

  if (hasQuote) {
    if (['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING'].includes(stage)) {
      await setStage(appointment.customer_id, 'QUOTED', actorId, 'Site visit completed — quote already on the lead', { leadId: leadKey });
    }
    return { already: false, hasQuote: true, taskId: null };
  }

  if (['ENQUIRY', 'SITE_VISIT_BOOKED'].includes(stage)) {
    await setStage(appointment.customer_id, 'QUOTE_PENDING', actorId, 'Site visit completed — quote needed', { leadId: leadKey });
  }
  const taskId = await ensureTask({
    ruleKey: leadKey ? `produce_quote:lead:${leadKey}` : `produce_quote:customer:${appointment.customer_id}`,
    title: `Produce quote for ${name}`,
    detail: `Site visit "${appointment.title}" completed — quotation needs producing.`,
    dueDate: todayStr(),
    priority: 'high',
    entityType: 'customer',
    entityId: appointment.customer_id,
  });
  return { already: false, hasQuote: false, taskId };
}

/**
 * Visits stay booked until someone ticks Visit completed.
 * Time passing must not mark them done or advance the pipeline.
 */
async function scanAppointments() {
  return 0;
}

async function scanJobsTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${y}-${m}-${d}`;

  const rows = await Job.findAll({
    where: { status: 'SCHEDULED', start_date: tomorrowStr },
    include: [{ model: Customer, attributes: ['name'] }],
  });
  for (const jb of rows) {
    await ensureTask({
      ruleKey: `job_tomorrow:job:${jb.id}`,
      title: `Job starts tomorrow — ${jb.title}`,
      detail: `${jb.Customer?.name} · ${jb.address || 'no address'}. Confirm materials and team.${jb.materials ? ` Materials: ${jb.materials}` : ''}`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'job',
      entityId: jb.id,
    });
  }
  return rows.length;
}

async function scanUninvoicedJobs() {
  const invoicedJobIds = (await Invoice.findAll({ attributes: ['job_id'], where: { job_id: { [Op.ne]: null } } }))
    .map((i) => i.job_id);
  const rows = await Job.findAll({
    where: {
      status: 'COMPLETED',
      id: invoicedJobIds.length ? { [Op.notIn]: invoicedJobIds } : { [Op.ne]: null },
    },
    include: [{ model: Customer, attributes: ['name'] }],
  });
  for (const jb of rows) {
    await ensureTask({
      ruleKey: `invoice_job:job:${jb.id}`,
      title: `Invoice job — ${jb.title}`,
      detail: `${jb.Customer?.name}'s job is completed and has no invoice yet.`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'job',
      entityId: jb.id,
    });
  }
  return rows.length;
}

async function scanOverdueInvoices(logActivity) {
  const rows = await Invoice.findAll({
    where: {
      status: { [Op.in]: ['sent', 'part_paid'] },
      due_date: { [Op.ne]: null, [Op.lt]: todayStr() },
    },
    include: [{ model: Customer, attributes: ['name'] }],
  });
  for (const inv of rows) {
    inv.status = 'overdue';
    await inv.save();
    await logActivity(inv.customer_id, null, 'invoice_overdue', `Invoice ${inv.ref} is overdue`);
    await ensureTask({
      ruleKey: `chase_payment:invoice:${inv.id}`,
      title: `Payment overdue — ${inv.ref} (${inv.Customer?.name})`,
      detail: `Invoice ${inv.ref} was due ${inv.due_date} and is unpaid. Chase payment.`,
      dueDate: todayStr(),
      priority: 'high',
      entityType: 'invoice',
      entityId: inv.id,
    });
    const { safeNotify, notifyOffice } = require('../notifications');
    await safeNotify(() => notifyOffice({
      kind: 'invoice_overdue',
      message: `Invoice ${inv.ref} (${inv.Customer?.name}) is overdue`,
      entity_type: 'invoice',
      entity_id: inv.id,
    }, { dedupe: true }));
  }
  return rows.length;
}

async function scanExpiredQuotes(logActivity) {
  const rows = await Quote.findAll({
    where: {
      status: 'sent',
      valid_until: { [Op.ne]: null, [Op.lt]: todayStr() },
    },
    include: [{ model: Customer, attributes: ['name'] }],
  });
  for (const q of rows) {
    q.status = 'expired';
    await q.save();
    await logActivity(q.customer_id, null, 'quote_expired', `Quote ${q.ref} passed its valid-until date`);
    const { cancelPendingForQuote } = require('./followups');
    await cancelPendingForQuote(q.id, 'quote expired');
    await resolveQuoteFollowupTask(q.id);
    await ensureTask({
      ruleKey: `quote_expired:quote:${q.id}`,
      title: `Quote expired — ${q.ref} (${q.Customer?.name})`,
      detail: 'Quote passed its validity date with no decision. Re-issue or mark lost.',
      dueDate: todayStr(),
      priority: 'normal',
      entityType: 'quote',
      entityId: q.id,
    });
  }
  return rows.length;
}

async function scanJobStarts(setStage) {
  const rows = await Job.findAll({
    where: {
      status: 'SCHEDULED',
      start_date: { [Op.lte]: todayStr() },
    },
  });
  for (const jb of rows) {
    jb.status = 'IN_PROGRESS';
    await jb.save();
    const cust = await Customer.findByPk(jb.customer_id, { attributes: ['stage'] });
    const lead = await resolveLeadForCustomer(jb.customer_id, jb.lead_id);
    if ((lead?.stage || cust?.stage) === 'SCHEDULED') {
      await setStage(jb.customer_id, 'IN_PROGRESS', null, 'Job start date reached', { leadId: lead?.id || jb.lead_id });
    }
  }
  return rows.length;
}

async function scanTaskReminders() {
  const { safeNotify, notifyOffice, notifyUsers } = require('../notifications');
  const rows = await Task.findAll({
    where: { status: 'open', due_date: todayStr() },
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] }, required: false }],
  });
  for (const t of rows) {
    const fields = {
      kind: 'task_reminder',
      message: t.title,
      entity_type: 'task',
      entity_id: t.id,
      work_date: t.due_date,
    };
    await safeNotify(async () => {
      const extra = (t.assignees || []).map((u) => u.id);
      const ids = [...new Set([...extra, t.assignee_id].filter(Boolean))];
      if (ids.length) return notifyUsers(ids, fields, { dedupe: true });
      return notifyOffice(fields, { dedupe: true });
    });
  }
  return rows.length;
}

async function runAllScans({ setStage, logActivity }) {
  return {
    appointments: await scanAppointments(setStage),
    jobsTomorrow: await scanJobsTomorrow(),
    uninvoiced: await scanUninvoicedJobs(),
    overdueInvoices: await scanOverdueInvoices(logActivity),
    expiredQuotes: await scanExpiredQuotes(logActivity),
    jobStarts: await scanJobStarts(setStage),
    taskReminders: await scanTaskReminders(),
  };
}

module.exports = {
  ensureTask, resolveRule, runAllScans, scanAppointments, completeVisit, scanJobsTomorrow, scanUninvoicedJobs,
  scanOverdueInvoices, scanExpiredQuotes, scanJobStarts, scanTaskReminders,
  quoteFollowupRuleKey, ensureQuoteFollowupTask, resolveQuoteFollowupTask,
};

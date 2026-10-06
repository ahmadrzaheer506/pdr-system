const express = require('express');
const { Op, literal } = require('sequelize');
const { Customer, Quote, Task, Message, Activity, Job, User, Invoice, InvoicePayment, Appointment, Lead, Followup, StageHistory } = require('../models');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { STAGES, STAGE_LABELS, setStage, logActivity, sumPipelineBoardTotals, resolveLeadForCustomer } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');
const { plain, nextRef } = require('../db');
const { resolveCustomerType, typeFields } = require('../customerType');
const contacts = require('../customerContacts');
const { buildCustomerTimeline, conversationMessages } = require('../customerTimeline');
const notes = require('../customerNotes');
const files = require('../customerFiles');
const { findContactConflicts } = require('../customerDuplicates');
const { buildCustomerListWhere } = require('../customerSearch');
const { parseLostReason } = require('../lostReason');
const { buildPipelineBoardWhere, LEAD_LATEST_QUOTE_SQL, LEAD_PIPELINE_VALUE_SQL, OPEN_TASKS_SQL } = require('../pipelineFilters');
const { parseOwnerAssignment, assertAssignableOwner, listOfficeOwners } = require('../customerOwner');
const jobDays = require('../jobDays');
const invoiceTax = require('../invoiceTax');
const invoicePayments = require('../invoicePayments');
const visitAssignees = require('../appointmentAssignees');

const router = express.Router();
router.use(requireAuth, requireOffice);

const PRIMARY_SCALARS = [
  [literal(`(SELECT s.address FROM customer_sites s WHERE s.customer_id = "Customer".id AND s.is_primary LIMIT 1)`), 'address'],
  [literal(`(SELECT s.postcode FROM customer_sites s WHERE s.customer_id = "Customer".id AND s.is_primary LIMIT 1)`), 'postcode'],
  [literal(`(SELECT p.value FROM customer_phones p WHERE p.customer_id = "Customer".id AND p.is_primary LIMIT 1)`), 'phone'],
  [literal(`(SELECT e.value FROM customer_emails e WHERE e.customer_id = "Customer".id AND e.is_primary LIMIT 1)`), 'email'],
];

router.get('/', asyncHandler(async (req, res) => {
  const built = buildCustomerListWhere(req.query, Customer.sequelize);
  if (built.error) return res.status(400).json({ error: built.error });
  const rows = await Customer.findAll({
    where: built.where,
    attributes: {
      include: [
        ...PRIMARY_SCALARS,
        [literal(`(SELECT COALESCE(SUM(q.total),0) FROM quotes q WHERE q.customer_id = "Customer".id AND q.status IN ('sent','accepted'))`), 'quoted_value'],
      ],
    },
    order: [['updated_at', 'DESC']],
    limit: 300,
  });
  res.json({ customers: plain(rows) });
}));

/** Visual Kanban payload — one card per enquiry (requirement 4.1). Filters: 4.4. Totals: 4.5. */
router.get('/pipeline/board', asyncHandler(async (req, res) => {
  const built = buildPipelineBoardWhere(req.query, Customer.sequelize);
  if (built.error) return res.status(400).json({ error: built.error });
  const includeCustomer = {
    model: Customer,
    required: true,
    attributes: { include: PRIMARY_SCALARS },
  };
  if (built.customerWhere?.[Op.and] || Object.keys(built.customerWhere || {}).length) {
    includeCustomer.where = built.customerWhere;
  }
  const rows = await Lead.findAll({
    where: built.where,
    include: [includeCustomer],
    attributes: {
      include: [
        [literal(LEAD_LATEST_QUOTE_SQL), 'latest_quote_total'],
        [literal(LEAD_PIPELINE_VALUE_SQL), 'pipeline_value'],
        [literal(OPEN_TASKS_SQL), 'open_tasks'],
      ],
    },
    order: [['board_order', 'ASC'], ['id', 'ASC']],
  });
  const board = {};
  for (const s of STAGES) board[s] = [];
  for (const row of rows) {
    const o = plain(row);
    const customer = o.Customer || {};
    delete o.Customer;
    const card = {
      ...o,
      id: o.id,
      lead_id: o.id,
      customer_id: o.customer_id,
      name: customer.name,
      company_name: customer.company_name || null,
      customer_type: customer.customer_type || null,
      owner_id: customer.owner_id ?? null,
      address: customer.address || null,
      postcode: customer.postcode || null,
      phone: customer.phone || null,
      email: customer.email || null,
      lost_reason: o.lost_reason || customer.lost_reason || null,
    };
    (board[card.stage] || (board[card.stage] = [])).push(card);
  }
  const owners = await listOfficeOwners();
  const customerRows = await Customer.findAll({
    attributes: ['id', 'name', 'company_name'],
    order: [['name', 'ASC']],
    limit: 500,
  });
  const customers = plain(customerRows).map((c) => ({
    id: c.id,
    name: c.name,
    company_name: c.company_name || null,
  }));
  const totals = sumPipelineBoardTotals(board);
  res.json({ board, stages: STAGES, labels: STAGE_LABELS, owners, customers, totals });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, notes, source = 'manual', customer_type, company_name, vat_number } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  const type = resolveCustomerType(customer_type, 'domestic');
  if (type.error) return res.status(400).json({ error: type.error });
  const typed = typeFields(type.value, { company_name, vat_number });
  if (typed.error) return res.status(400).json({ error: typed.error });
  const lists = contacts.parseContactInput(req.body || {});
  if (lists.error) return res.status(400).json({ error: lists.error });
  const clash = await findContactConflicts(lists);
  if (clash) return sendContactResult(res, clash);
  let ownerId = req.user.id;
  if (req.body?.owner_id !== undefined) {
    const parsed = parseOwnerAssignment(req.body.owner_id);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!parsed.skip) {
      const ok = await assertAssignableOwner(parsed.value);
      if (ok.error) return res.status(400).json({ error: ok.error });
      ownerId = ok.value;
    }
  }
  const created = await Customer.create({
    name: String(name).trim(),
    notes: notes || null,
    source,
    owner_id: ownerId,
    customer_type: typed.customer_type,
    company_name: typed.company_name,
    vat_number: typed.vat_number,
  });
  await contacts.saveContactLists(created.id, lists);
  const picked = await contacts.resolveLeadContactsForCreate(created.id, {});
  const contactIds = picked.error
    ? { site_id: null, phone_id: null, email_id: null }
    : { site_id: picked.site_id, phone_id: picked.phone_id, email_id: picked.email_id };
  await Lead.create({
    customer_id: created.id,
    ref: await nextRef('lead'),
    source,
    message: notes ? String(notes).slice(0, 2000) : null,
    status: 'NEW',
    next_action: 'Review & respond',
    stage: 'ENQUIRY',
    meta: contactIds,
    ...contactIds,
  });
  await logActivity(created.id, req.user.id, 'customer_created', 'Customer created');
  res.json({ id: created.id });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const c = await Customer.findByPk(req.params.id, {
    include: [{ model: User, as: 'owner', attributes: ['id', 'name'] }],
  });
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const id = c.id;

  const messageRows = await Message.findAll({
    where: { customer_id: id },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });
  const messages = messageRows.map((m) => {
    const o = plain(m);
    o.user_name = o.User?.name || null;
    o.meta = o.meta || {};
    delete o.User;
    return o;
  });

  const activityWhere = {
    customer_id: id,
    [Op.or]: [
      { entity_type: { [Op.in]: ['quote', 'job', 'invoice'] } },
      { kind: { [Op.like]: 'quote_%' } },
      { kind: { [Op.like]: 'job_%' } },
      { kind: { [Op.like]: 'invoice_%' } },
    ],
  };
  const activityRows = await Activity.findAll({
    where: activityWhere,
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });
  const activity = activityRows.map((a) => {
    const o = plain(a);
    o.user_name = o.User?.name || null;
    delete o.User;
    return o;
  });
  const timeline = buildCustomerTimeline(conversationMessages(messages), activity);
  const internal_notes = await notes.listNotes(id);
  const customer_files = await files.listFiles(id);

  const quotes = plain(await Quote.findAll({ where: { customer_id: id }, order: [['id', 'DESC']] }));

  const jobRows = await Job.findAll({
    where: { customer_id: id },
    include: [{ model: Quote, attributes: ['id', 'ref'] }],
    order: [['id', 'DESC']],
  });
  const withCrew = await jobDays.attachDayAssignmentsMany(jobRows.map((j) => {
    const o = plain(j);
    o.quote_ref = o.Quote?.ref || null;
    delete o.Quote;
    return o;
  }));
  const jobs = withCrew.map((o) => {
    const crew = jobDays.uniqueCrewNames(o.day_assignments).join(', ');
    const row = { ...o, crew };
    delete row.day_assignments;
    return row;
  });

  const invoices = plain(await Invoice.findAll({
    where: { customer_id: id },
    include: [
      { model: InvoicePayment, as: 'payments', separate: true, order: [['paid_at', 'DESC'], ['id', 'DESC']] },
      { model: Job, attributes: ['id', 'lead_id'], required: false },
    ],
    order: [['id', 'DESC']],
  })).map((inv) => {
    const leadId = inv.Job?.lead_id || null;
    delete inv.Job;
    return invoicePayments.decorateBalance(invoiceTax.decorateTaxView({ ...inv, lead_id: leadId }));
  });
  const appointments = plain(await Appointment.findAll({
    where: { customer_id: id },
    include: [{
      association: 'assignees',
      attributes: ['id', 'name', 'role'],
      through: { attributes: [] },
    }],
    order: [['start', 'DESC']],
  })).map((a) => ({ ...a, ...visitAssignees.decorateAssignees(a) }));
  const leadRows = plain(await Lead.findAll({ where: { customer_id: id }, order: [['id', 'DESC']] }));

  const followupRows = await Followup.findAll({
    where: { customer_id: id },
    include: [{ model: Quote, attributes: ['ref'] }],
    order: [['scheduled_at', 'ASC']],
  });
  const followups = followupRows.map((f) => {
    const o = plain(f);
    o.quote_ref = o.Quote?.ref;
    delete o.Quote;
    return o;
  });
  const quoteIds = [...new Set(followups.map((f) => f.quote_id).filter(Boolean))];
  const followupTaskRows = quoteIds.length
    ? await Task.findAll({
      where: {
        status: 'open',
        entity_type: 'quote',
        entity_id: { [Op.in]: quoteIds },
        rule_key: { [Op.like]: 'quote_followup:quote:%' },
      },
      attributes: ['id', 'title', 'due_date', 'status', 'entity_id'],
    })
    : [];
  const taskByQuote = new Map(plain(followupTaskRows).map((t) => [t.entity_id, {
    id: t.id, title: t.title, due_date: t.due_date, status: t.status,
  }]));
  for (const f of followups) {
    f.followup_task = taskByQuote.get(f.quote_id) || null;
  }

  const histRows = await StageHistory.findAll({
    where: { customer_id: id },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'DESC']],
  });
  const stageHistory = histRows.map((sh) => {
    const o = plain(sh);
    o.user_name = o.User?.name || null;
    delete o.User;
    return o;
  });

  const raw = plain(c);
  const ownerName = raw.owner?.name || null;
  delete raw.owner;
  const listed = await contacts.listContacts(c.id);
  const customer = contacts.applyPrimaryContacts({
    ...raw,
    ...listed,
    owner_name: ownerName,
  });
  const leads = leadRows.map((lead) => {
    const chosen = contacts.applyLeadContacts(listed, lead);
    return {
      ...lead,
      phone: chosen.phone,
      email: chosen.email,
      address: chosen.address,
      site_id: chosen.site_id,
      phone_id: chosen.phone_id,
      email_id: chosen.email_id,
    };
  });
  res.json({
    customer, messages, activity, timeline, internal_notes, files: customer_files,
    quotes, jobs, invoices, appointments, leads, followups, stageHistory,
    stages: STAGES, labels: STAGE_LABELS,
  });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const c = await Customer.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const body = req.body || {};
  const fields = ['name', 'notes', 'lost_reason'];
  const patch = {};
  for (const f of fields) if (body[f] !== undefined) patch[f] = body[f];

  if (body.owner_id !== undefined) {
    const parsed = parseOwnerAssignment(body.owner_id);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!parsed.skip) {
      const ok = await assertAssignableOwner(parsed.value);
      if (ok.error) return res.status(400).json({ error: ok.error });
      patch.owner_id = ok.value;
    }
  }

  if (body.customer_type !== undefined || body.company_name !== undefined || body.vat_number !== undefined) {
    const type = resolveCustomerType(body.customer_type, c.customer_type || 'domestic');
    if (type.error) return res.status(400).json({ error: type.error });
    const typed = typeFields(type.value, body, c);
    if (typed.error) return res.status(400).json({ error: typed.error });
    patch.customer_type = typed.customer_type;
    patch.company_name = typed.company_name;
    patch.vat_number = typed.vat_number;
  }

  if (Object.keys(patch).length) await c.update(patch);
  res.json({ ok: true });
}));

router.put('/:id/stage', asyncHandler(async (req, res) => {
  const { stage, note, before_id, lead_id } = req.body || {};
  const c = await Customer.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });

  let fromStage = c.stage;
  if (lead_id != null && lead_id !== '') {
    try {
      const lead = await resolveLeadForCustomer(Number(req.params.id), lead_id);
      fromStage = lead.stage;
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  let lost_reason;
  if (stage === 'LOST' && fromStage !== 'LOST') {
    const parsed = parseLostReason(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    lost_reason = parsed.lost_reason;
  } else if (stage !== 'LOST' && fromStage === 'LOST') {
    lost_reason = null;
  }

  try {
    await setStage(Number(req.params.id), stage, req.user.id, note, {
      beforeId: before_id == null ? null : Number(before_id),
      ...(lead_id != null && lead_id !== '' ? { leadId: Number(lead_id) } : {}),
    });
    if (lost_reason !== undefined) {
      await Customer.update({ lost_reason }, { where: { id: req.params.id } });
      if (lead_id != null && lead_id !== '') {
        await Lead.update({ lost_reason }, { where: { id: Number(lead_id), customer_id: req.params.id } });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.post('/:id/messages', asyncHandler(async (req, res) => {
  const { channel, body, subject } = req.body || {};
  if (!channel || !body) return res.status(400).json({ error: 'channel and body required' });
  if (channel === 'note') {
    return res.status(400).json({ error: 'Use internal notes — notes are not sent as messages' });
  }
  try {
    const result = await sendToCustomer(Number(req.params.id), channel, body, { userId: req.user.id, subject });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.post('/:id/notes', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await notes.addNote(Number(req.params.id), req.user.id, req.body?.body));
}));
router.delete('/:id/notes/:noteId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await notes.removeNote(Number(req.params.id), Number(req.params.noteId)));
}));

router.post('/:id/files', files.handleUpload, asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await files.addFile(Number(req.params.id), req.user.id, req.file));
}));
router.get('/:id/files/:fileId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  const row = await files.getFileRow(Number(req.params.id), Number(req.params.fileId));
  if (!row) return res.status(404).json({ error: 'File not found' });
  const disk = files.diskPath(row.stored_name);
  if (!disk) return res.status(400).json({ error: 'Invalid file' });
  const download = req.query.download === '1';
  res.setHeader('Content-Type', row.mime);
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${String(row.original_name).replace(/"/g, '')}"`,
  );
  res.sendFile(disk, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}));
router.delete('/:id/files/:fileId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await files.removeFile(Number(req.params.id), Number(req.params.fileId)));
}));

function sendContactResult(res, result) {
  if (result.error) {
    const body = { error: result.error };
    if (result.customer_id != null) {
      body.customer_id = result.customer_id;
      body.name = result.name || null;
    }
    return res.status(result.status || 400).json(body);
  }
  return res.json(result);
}

async function requireCustomer(req, res) {
  const c = await Customer.findByPk(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'Customer not found' });
    return null;
  }
  return c;
}

router.post('/:id/sites', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.addSite(Number(req.params.id), req.body || {}));
}));
router.put('/:id/sites/:siteId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.updateSite(Number(req.params.id), Number(req.params.siteId), req.body || {}));
}));
router.delete('/:id/sites/:siteId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.removeSite(Number(req.params.id), Number(req.params.siteId)));
}));

router.post('/:id/phones', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.addPhone(Number(req.params.id), req.body || {}));
}));
router.put('/:id/phones/:phoneId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.updatePhone(Number(req.params.id), Number(req.params.phoneId), req.body || {}));
}));
router.delete('/:id/phones/:phoneId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.removePhone(Number(req.params.id), Number(req.params.phoneId)));
}));

router.post('/:id/emails', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.addEmail(Number(req.params.id), req.body || {}));
}));
router.put('/:id/emails/:emailId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.updateEmail(Number(req.params.id), Number(req.params.emailId), req.body || {}));
}));
router.delete('/:id/emails/:emailId', asyncHandler(async (req, res) => {
  if (!(await requireCustomer(req, res))) return;
  sendContactResult(res, await contacts.removeEmail(Number(req.params.id), Number(req.params.emailId)));
}));

module.exports = router;

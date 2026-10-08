const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Op } = require('sequelize');
const { Quote, Customer, Followup, Job } = require('../models');
const { nextRef, getSetting, money, DATA_DIR, plain } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { setStage, logActivity, resolveLeadForCustomer } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');
const { scheduleForQuote, render, cancelPendingForQuote, updateFollowupSchedule, cancelFollowup } = require('../services/followups');
const { resolveRule, ensureTask, resolveQuoteFollowupTask } = require('../services/taskEngine');
const { quotePdf } = require('../services/pdf');
const contacts = require('../customerContacts');
const geocode = require('../geocode');
const quickbooks = require('../integrations/quickbooks');

const router = express.Router();
router.use(requireAuth, requireOffice);

const ukTax = require('../services/ukTax');
const catalogue = require('../catalogue');
const { normaliseExtras, pickAcceptedExtras, jobValueFromQuote } = require('../quoteExtras');

function buildTotals(items, opts, customer) {
  return ukTax.documentTotals(items, opts, customer, opts.uk || {});
}

/** Copy a saved quote into a new draft with a fresh ref (requirement 6.5). */
function revisionFields(source, { ref, userId, validUntil, title }) {
  const src = plain(source);
  const nextTitle = String(title || src.title || '').trim();
  return {
    customer_id: src.customer_id,
    ref,
    title: nextTitle || src.title,
    items: src.items || [],
    subtotal: src.subtotal,
    vat_rate: src.vat_rate,
    vat_amount: src.vat_amount,
    total: src.total,
    valid_until: validUntil,
    status: 'draft',
    notes: src.notes || null,
    created_by: userId,
    vat_treatment: src.vat_treatment,
    labour_total: src.labour_total,
    materials_total: src.materials_total,
    vat_breakdown: src.vat_breakdown || [],
    cis_applies: !!src.cis_applies,
    cis_rate: src.cis_rate,
    cis_deduction: src.cis_deduction,
    retention_percent: src.retention_percent,
    retention_amount: src.retention_amount,
    due_now: src.due_now,
    payment_schedule: src.payment_schedule || [],
    inclusions: src.inclusions || null,
    exclusions: src.exclusions || null,
    warranty_years: src.warranty_years,
    warranty_text: src.warranty_text || null,
    lead_time: src.lead_time || null,
    duration_estimate: src.duration_estimate || null,
    access_requirements: src.access_requirements || null,
    provisional_sums: src.provisional_sums || [],
    provisional_sums_in_total: !!src.provisional_sums_in_total,
    optional_extras: normaliseExtras(src.optional_extras),
    accepted_optional_extras: [],
    cancellation_rights_apply: !!src.cancellation_rights_apply,
    waiver_signed: false,
    site_id: src.site_id || null,
    phone_id: src.phone_id || null,
    email_id: src.email_id || null,
    lead_id: src.lead_id || null,
    revised_from_id: src.id,
  };
}

function fileToken(filename) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me').update(filename).digest('hex').slice(0, 24);
}
function publicPdfUrl(filename) {
  const base = String(process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}/public-files/${fileToken(filename)}/${filename}`;
}

/**
 * Generate (or regenerate) the branded quote PDF and store the filename.
 * Does not send the quote or change status (requirement 6.6).
 */
async function generateAndStoreQuotePdf(quote) {
  const customer = await contacts.loadCustomerWithContacts(quote.customer_id);
  if (!customer) return { error: 'Customer not found', status: 404 };
  const forDoc = contacts.applySelectedContacts(customer, quote);
  const filename = await quotePdf(plain(quote), forDoc);
  await quote.update({ pdf_file: filename });
  return { filename, customer, forDoc };
}

router.get('/', asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  const customerWhere = {};
  if (q) {
    const like = `%${q}%`;
    where[Op.or] = [{ ref: { [Op.iLike]: like } }, { title: { [Op.iLike]: like } }];
    customerWhere.name = { [Op.iLike]: like };
  }
  const rows = await Quote.findAll({
    where,
    include: [{ model: Customer, attributes: ['name'], required: true }],
    order: [['id', 'DESC']],
    limit: 200,
  });
  const quotes = rows.map((r) => {
    const o = plain(r);
    o.customer_name = o.Customer?.name;
    delete o.Customer;
    return o;
  });
  res.json({ quotes });
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { customer_id, title, items = [], notes, valid_until } = b;
  if (!customer_id || !title) return res.status(400).json({ error: 'customer_id and title required' });

  const customer = await Customer.findByPk(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  let lead = null;
  try {
    lead = await resolveLeadForCustomer(customer_id, b.lead_id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const picked = await contacts.resolveCustomerContactSelection(customer_id, b);
  if (picked.error) return res.status(400).json({ error: picked.error });

  const defaults = (await getSetting('quote_defaults')) || {};
  const uk = (await getSetting('uk')) || {};
  const { calc, cols } = buildTotals(items, {
    uk,
    vat_treatment: b.vat_treatment,
    cis_applies: b.cis_applies,
    cis_rate: b.cis_rate,
    retention_percent: b.retention_percent,
    payment_schedule: b.payment_schedule || defaults.payment_schedule || [],
    provisional_sums: b.provisional_sums || [],
    provisional_sums_in_total: b.provisional_sums_in_total,
    optional_extras: b.optional_extras || [],
  }, customer);

  const ref = await nextRef('quote');
  const validUntil = valid_until || new Date(Date.now() + (await getSetting('quote_validity_days')) * 86400000).toISOString().slice(0, 10);
  const isDomestic = (customer.customer_type || 'domestic') === 'domestic';

  const created = await Quote.create({
    customer_id, lead_id: lead?.id || null, ref, title, items,
    subtotal: cols.subtotal,
    vat_rate: await getSetting('vat_rate'),
    vat_amount: cols.vat_amount,
    total: cols.total,
    valid_until: validUntil,
    notes: notes || null,
    created_by: req.user.id,
    vat_treatment: cols.vat_treatment,
    labour_total: cols.labour_total,
    materials_total: cols.materials_total,
    vat_breakdown: cols.vat_breakdown,
    cis_applies: cols.cis_applies,
    cis_rate: cols.cis_rate,
    cis_deduction: cols.cis_deduction,
    retention_percent: cols.retention_percent,
    retention_amount: cols.retention_amount,
    due_now: cols.due_now,
    payment_schedule: cols.payment_schedule,
    inclusions: b.inclusions ?? defaults.inclusions ?? null,
    exclusions: b.exclusions ?? defaults.exclusions ?? null,
    warranty_years: b.warranty_years ?? defaults.warranty_years ?? null,
    warranty_text: b.warranty_text ?? defaults.warranty_text ?? null,
    lead_time: b.lead_time ?? defaults.lead_time ?? null,
    duration_estimate: b.duration_estimate ?? null,
    access_requirements: b.access_requirements ?? null,
    provisional_sums: b.provisional_sums || [],
    provisional_sums_in_total: !!cols.provisional_sums_in_total,
    optional_extras: normaliseExtras(b.optional_extras),
    accepted_optional_extras: [],
    cancellation_rights_apply: isDomestic,
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
  });

  await resolveRule(`produce_quote:customer:${customer_id}`);
  if (lead?.id) await resolveRule(`produce_quote:lead:${lead.id}`);
  const enquiryStage = lead?.stage || customer.stage;
  if (['ENQUIRY', 'SITE_VISIT_BOOKED'].includes(enquiryStage)) {
    if (lead?.id) {
      await setStage(customer_id, 'QUOTE_PENDING', req.user.id, `Quote ${ref} created`, { leadId: lead.id });
    } else {
      await setStage(customer_id, 'QUOTE_PENDING', req.user.id, `Quote ${ref} created`);
    }
  }
  await logActivity(customer_id, req.user.id, 'quote_created', `Quote ${ref} created — ${money(cols.total)}`, 'quote', created.id);
  res.json({ id: created.id, ref, calc });
}));

router.post('/preview', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const uk = (await getSetting('uk')) || {};
  let customer = null;
  if (b.customer_id) customer = await Customer.findByPk(b.customer_id);
  const { calc } = buildTotals(b.items || [], { ...b, uk }, customer);
  res.json(calc);
}));

router.get('/meta/options', asyncHandler(async (req, res) => {
  const uk = (await getSetting('uk')) || {};
  res.json({
    vat_rates: ukTax.mergeVatRates(uk.vat_rates),
    cis_rates: ukTax.CIS_RATES,
    uk,
    defaults: await getSetting('quote_defaults'),
    catalogue: await catalogue.listItems(),
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const q = await Quote.findByPk(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  const customer = await contacts.loadCustomerWithContacts(q.customer_id);
  const quote = plain(q);
  const forDoc = contacts.applySelectedContacts(customer, quote);
  quote.customer_name = customer.name;
  quote.phone = forDoc.phone;
  quote.email = forDoc.email;
  const followups = plain(await Followup.findAll({ where: { quote_id: q.id }, order: [['step', 'ASC']] }));
  res.json({ quote, followups, customer });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (['accepted', 'declined'].includes(quote.status)) {
    return res.status(400).json({ error: 'Quote already decided — clone it with a new title instead' });
  }
  const b = req.body || {};
  const newItems = b.items !== undefined ? b.items : (quote.items || []);
  const uk = (await getSetting('uk')) || {};
  const customer = await Customer.findByPk(quote.customer_id);
  const { calc, cols } = buildTotals(newItems, {
    uk,
    vat_treatment: b.vat_treatment ?? quote.vat_treatment,
    cis_applies: b.cis_applies ?? quote.cis_applies,
    cis_rate: b.cis_rate ?? quote.cis_rate,
    retention_percent: b.retention_percent ?? quote.retention_percent,
    payment_schedule: b.payment_schedule ?? quote.payment_schedule ?? [],
    provisional_sums: b.provisional_sums ?? quote.provisional_sums ?? [],
    provisional_sums_in_total: b.provisional_sums_in_total ?? quote.provisional_sums_in_total,
    optional_extras: b.optional_extras ?? quote.optional_extras ?? [],
  }, customer);

  const picked = await contacts.resolveCustomerContactSelection(quote.customer_id, {
    site_id: b.site_id !== undefined ? b.site_id : quote.site_id,
    phone_id: b.phone_id !== undefined ? b.phone_id : quote.phone_id,
    email_id: b.email_id !== undefined ? b.email_id : quote.email_id,
  });
  if (picked.error) return res.status(400).json({ error: picked.error });

  await quote.update({
    title: b.title || quote.title,
    items: newItems,
    subtotal: cols.subtotal,
    vat_amount: cols.vat_amount,
    total: cols.total,
    notes: b.notes ?? quote.notes,
    valid_until: b.valid_until || quote.valid_until,
    vat_treatment: cols.vat_treatment,
    labour_total: cols.labour_total,
    materials_total: cols.materials_total,
    vat_breakdown: cols.vat_breakdown,
    cis_applies: cols.cis_applies,
    cis_rate: cols.cis_rate,
    cis_deduction: cols.cis_deduction,
    retention_percent: cols.retention_percent,
    retention_amount: cols.retention_amount,
    due_now: cols.due_now,
    payment_schedule: cols.payment_schedule,
    inclusions: b.inclusions ?? quote.inclusions,
    exclusions: b.exclusions ?? quote.exclusions,
    warranty_years: b.warranty_years ?? quote.warranty_years,
    warranty_text: b.warranty_text ?? quote.warranty_text,
    lead_time: b.lead_time ?? quote.lead_time,
    duration_estimate: b.duration_estimate ?? quote.duration_estimate,
    access_requirements: b.access_requirements ?? quote.access_requirements,
    provisional_sums: b.provisional_sums ?? quote.provisional_sums ?? [],
    provisional_sums_in_total: cols.provisional_sums_in_total,
    optional_extras: b.optional_extras !== undefined ? normaliseExtras(b.optional_extras) : (quote.optional_extras || []),
    cancellation_rights_apply: b.cancellation_rights_apply !== undefined ? !!b.cancellation_rights_apply : quote.cancellation_rights_apply,
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
  });
  res.json({ ok: true, calc });
}));

async function copyQuoteAsDraft(req, res, { title, activityDetail }) {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const validUntil = new Date(Date.now() + (await getSetting('quote_validity_days')) * 86400000).toISOString().slice(0, 10);
  const ref = await nextRef('quote');
  const created = await Quote.create(revisionFields(quote, {
    ref,
    userId: req.user.id,
    validUntil,
    title,
  }));
  await logActivity(
    quote.customer_id,
    req.user.id,
    'quote_created',
    activityDetail(ref, quote, created),
    'quote',
    created.id
  );
  res.json({ id: created.id, ref, quote: plain(created) });
}

router.post('/:id/revise', asyncHandler(async (req, res) => {
  await copyQuoteAsDraft(req, res, {
    title: req.body?.title,
    activityDetail: (ref, quote, created) => (
      `Quote ${ref} created as a revision of ${quote.ref} — ${money(created.total)}`
    ),
  });
}));

router.post('/:id/clone', asyncHandler(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Quote title is required' });
  await copyQuoteAsDraft(req, res, {
    title,
    activityDetail: (ref, quote, created) => (
      `Quote ${ref} cloned from ${quote.ref} — ${money(created.total)}`
    ),
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const job = await Job.findOne({ where: { quote_id: quote.id } });
  if (job) {
    return res.status(400).json({ error: 'This quote has a job and cannot be deleted' });
  }
  await cancelPendingForQuote(quote.id, 'quote deleted');
  await resolveQuoteFollowupTask(quote.id);
  await Followup.destroy({ where: { quote_id: quote.id } });
  await quote.destroy();
  await logActivity(
    quote.customer_id,
    req.user.id,
    'quote_deleted',
    `Quote ${quote.ref} deleted`,
    'quote',
    quote.id
  );
  res.json({ ok: true });
}));

router.post('/:id/pdf', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const result = await generateAndStoreQuotePdf(quote);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ pdf: result.filename, quote: plain(quote) });
}));

router.post('/:id/send', asyncHandler(async (req, res) => {
  const { channels = ['whatsapp'] } = req.body || {};
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (!['draft', 'sent'].includes(quote.status)) {
    return res.status(400).json({ error: 'This quote cannot be sent — clone it with a new title instead' });
  }
  const result = await generateAndStoreQuotePdf(quote);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const { filename, customer, forDoc } = result;

  const templates = await getSetting('templates');
  const vars = { name: (customer.name || '').split(' ')[0], ref: quote.ref, title: quote.title, total: money(quote.total), valid_until: quote.valid_until };
  const results = {};
  const errors = [];

  for (const ch of channels) {
    try {
      if (ch === 'whatsapp') {
        results.whatsapp = await sendToCustomer(customer.id, 'whatsapp', render(templates.quote_sent_whatsapp, vars), {
          userId: req.user.id,
          docUrl: publicPdfUrl(filename),
          docName: `${quote.ref}.pdf`,
          template: process.env.WHATSAPP_TEMPLATE_QUOTE || 'quote_sent',
          templateParams: [vars.name],
          phone: forDoc.phone,
        });
      } else if (ch === 'email') {
        results.email = await sendToCustomer(customer.id, 'email', render(templates.quote_email_body, vars), {
          userId: req.user.id,
          subject: render(templates.quote_email_subject, vars),
          attachments: [{ filename: `${quote.ref}.pdf`, path: path.join(DATA_DIR, 'files', filename) }],
          email: forDoc.email,
        });
      }
    } catch (err) {
      errors.push(`${ch}: ${err.message}`);
    }
  }

  if (Object.keys(results).length === 0) {
    const detail = errors.length === 1
      ? errors[0].replace(/^(whatsapp|email):\s*/i, '')
      : `Could not send on any channel — ${errors.join('; ')}`;
    return res.status(400).json({ error: detail });
  }

  await quote.update({ status: 'sent', sent_at: new Date(), sent_via: Object.keys(results).join('+') });
  try {
    const qbo = await quickbooks.pushEstimate({ ...plain(quote), pdf_file: filename }, customer);
    if (qbo?.qboId) {
      await quote.update({
        qbo_id: qbo.qboId,
        qbo_sync_token: qbo.syncToken || quote.qbo_sync_token || null,
        qbo_attachable_id: qbo.attachableId || quote.qbo_attachable_id || null,
        qbo_synced_at: new Date(),
      });
    }
  } catch (err) {
    await logActivity(customer.id, req.user.id, 'qbo_error', `QuickBooks estimate failed: ${String(err.message).slice(0, 150)}`, 'quote', quote.id);
  }
  const fresh = await Quote.findByPk(quote.id);
  await scheduleForQuote(plain(fresh));
  await setStage(customer.id, 'QUOTED', req.user.id, `Quote ${quote.ref} sent (${Object.keys(results).join(', ')})`, { leadId: quote.lead_id });
  await logActivity(customer.id, req.user.id, 'quote_sent', `Quote ${quote.ref} (${money(quote.total)}) sent via ${Object.keys(results).join(' & ')}`, 'quote', quote.id);
  res.json({ ok: true, results, errors, pdf: filename });
}));

router.post('/:id/decision', asyncHandler(async (req, res) => {
  const { decision, reason, accepted_extra_indexes } = req.body || {};
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be accepted or declined' });
  const customer = await contacts.loadCustomerWithContacts(quote.customer_id);

  let acceptedExtras = [];
  if (decision === 'accepted') {
    const existingJob = await Job.findOne({ where: { quote_id: quote.id } });
    if (existingJob) {
      return res.json({ ok: true, job_id: existingJob.id, job_value: existingJob.value });
    }
    const picked = pickAcceptedExtras(quote.optional_extras, accepted_extra_indexes);
    if (picked.error) return res.status(400).json({ error: picked.error });
    acceptedExtras = picked.extras;
  }

  await quote.update({
    status: decision,
    decided_at: new Date(),
    accepted_optional_extras: decision === 'accepted' ? acceptedExtras : [],
  });
  await cancelPendingForQuote(quote.id, `quote ${decision}`);
  await resolveQuoteFollowupTask(quote.id);

  if (decision === 'accepted') {
    const jobValue = jobValueFromQuote(quote, acceptedExtras);
    await setStage(customer.id, 'WON', req.user.id, `Quote ${quote.ref} accepted`, { leadId: quote.lead_id });
    const job = await Job.create({
      customer_id: customer.id,
      lead_id: quote.lead_id || null,
      quote_id: quote.id,
      title: quote.title,
      description: quote.notes || null,
      address: contacts.formatSite((customer.sites || []).find((s) => s.id === quote.site_id)) || customer.address,
      status: 'PENDING',
      value: jobValue,
      required_skills: [],
      site_id: quote.site_id,
      phone_id: quote.phone_id,
      email_id: quote.email_id,
    });
    await geocode.ensureJobSitePoint(job, { refresh: true });
    await ensureTask({
      ruleKey: `schedule_job:job:${job.id}`,
      title: `Schedule job — ${quote.title}`,
      detail: `${customer.name} accepted quote ${quote.ref} (${money(jobValue)}). Job needs lads and dates.`,
      priority: 'high',
      entityType: 'job',
      entityId: job.id,
    });
    await logActivity(customer.id, req.user.id, 'quote_accepted', `Quote ${quote.ref} accepted — job created`, 'job', job.id);
    const { safeNotify, notifyOffice } = require('../notifications');
    await safeNotify(() => notifyOffice({
      kind: 'quote_accepted',
      message: `${customer.name} accepted quote ${quote.ref}.`,
      entity_type: 'customer',
      entity_id: customer.id,
    }, { excludeId: req.user.id }));
    return res.json({ ok: true, job_id: job.id, job_value: jobValue });
  }

  await setStage(customer.id, 'LOST', req.user.id, `Quote ${quote.ref} declined${reason ? ` — ${reason}` : ''}`, { leadId: quote.lead_id });
  if (reason) await Customer.update({ lost_reason: reason }, { where: { id: customer.id } });
  await logActivity(customer.id, req.user.id, 'quote_declined', `Quote ${quote.ref} declined${reason ? ` — ${reason}` : ''}`, 'quote', quote.id);
  res.json({ ok: true });
}));

router.post('/:id/followups/cancel', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const cancelled = await cancelPendingForQuote(quote.id, 'cancelled by office');
  await resolveQuoteFollowupTask(quote.id);
  if (cancelled > 0) {
    await logActivity(quote.customer_id, req.user.id, 'followups_cancelled', `Office cancelled remaining follow-ups for quote ${quote.ref}`, 'quote', quote.id);
  }
  res.json({ ok: true, cancelled });
}));

router.post('/:id/followups/:followupId/cancel', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  try {
    const followup = await cancelFollowup({
      quoteId: quote.id,
      followupId: req.params.followupId,
      userId: req.user.id,
      quote,
    });
    res.json({ ok: true, followup: plain(followup) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

router.put('/:id/followups/:followupId', asyncHandler(async (req, res) => {
  const quote = await Quote.findByPk(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  try {
    const followup = await updateFollowupSchedule({
      quoteId: quote.id,
      followupId: req.params.followupId,
      scheduledAt: req.body?.scheduled_at,
      userId: req.user.id,
      quote,
    });
    res.json({ ok: true, followup: plain(followup) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

module.exports = router;

const express = require('express');
const path = require('path');
const { Op } = require('sequelize');
const { Invoice, Job, Customer, Quote, InvoicePayment } = require('../models');
const { nextRef, getSetting, money, DATA_DIR, plain, todayStr } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { setStage, logActivity, resolveLeadForCustomer } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');
const { resolveRule } = require('../services/taskEngine');
const { invoicePdf } = require('../services/pdf');
const ukTax = require('../services/ukTax');
const quickbooks = require('../integrations/quickbooks');
const contacts = require('../customerContacts');
const invoiceFromJob = require('../invoiceFromJob');
const invoiceTax = require('../invoiceTax');
const invoicePayments = require('../invoicePayments');

const PAYMENT_INCLUDE = [{ model: InvoicePayment, as: 'payments', separate: true, order: [['paid_at', 'DESC'], ['id', 'DESC']] }];
const JOB_LEAD_INCLUDE = { model: Job, attributes: ['id', 'lead_id'], required: false };

function viewInvoice(row, customerName) {
  const o = plain(row);
  if (customerName !== undefined) o.customer_name = customerName;
  else if (o.Customer?.name) o.customer_name = o.Customer.name;
  o.lead_id = o.Job?.lead_id ?? o.lead_id ?? null;
  delete o.Customer;
  delete o.Job;
  return invoicePayments.decorateBalance(invoiceTax.decorateTaxView(o));
}

const CAN_EMAIL_STATUSES = Object.freeze(['draft', 'sent']);

/**
 * Generate (or regenerate) the branded invoice PDF and store the filename.
 * Does not email or change status (requirement 11.3).
 */
async function generateAndStoreInvoicePdf(invoice) {
  const customer = await contacts.loadCustomerWithContacts(invoice.customer_id);
  if (!customer) return { error: 'Customer not found', status: 404 };
  const filename = await invoicePdf(plain(invoice), customer);
  await invoice.update({ pdf_file: filename });
  return { filename, customer };
}

function customerHasEmail(customer) {
  return !!(customer && String(customer.email || '').trim());
}

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (q) {
    const like = `%${q}%`;
    where[Op.or] = [{ ref: { [Op.iLike]: like } }];
  }
  const rows = await Invoice.findAll({
    where,
    include: [
      { model: Customer, attributes: ['name'], required: true },
      JOB_LEAD_INCLUDE,
      ...PAYMENT_INCLUDE,
    ],
    order: [['id', 'DESC']],
    limit: 200,
  });
  res.json({
    invoices: rows.map((r) => viewInvoice(r)),
  });
}));

router.get('/ready', asyncHandler(async (req, res) => {
  const invoiced = await Invoice.findAll({
    attributes: ['job_id'],
    where: { job_id: { [Op.ne]: null } },
  });
  const taken = invoiced.map((row) => row.job_id);
  const where = { status: 'COMPLETED' };
  if (taken.length) where.id = { [Op.notIn]: taken };
  const rows = await Job.findAll({
    where,
    include: [{ model: Customer, attributes: ['name'] }],
    order: [['id', 'DESC']],
    limit: 100,
  });
  res.json({
    jobs: rows.map((jb) => {
      const o = plain(jb);
      o.customer_name = o.Customer?.name;
      delete o.Customer;
      return {
        id: o.id,
        title: o.title,
        customer_id: o.customer_id,
        customer_name: o.customer_name,
        value: o.value,
        status: o.status,
      };
    }),
  });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  res.json(await invoicePayments.balanceSummary());
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { job_id, customer_id, items, notes } = b;
  let custId = customer_id;
  let lineItems = items;
  let quote = null;
  let leadId = null;
  if (job_id) {
    const jb = await Job.findByPk(job_id);
    if (!jb) return res.status(404).json({ error: 'Job not found' });
    const existing = await invoiceFromJob.invoiceIdForJob(job_id);
    if (existing) return res.status(400).json({ error: 'This job already has an invoice', invoice_id: existing.id });
    custId = jb.customer_id;
    leadId = jb.lead_id || null;
    if (jb.quote_id) quote = await Quote.findByPk(jb.quote_id);
    if (!lineItems) lineItems = await invoiceFromJob.linesFromJobRecord(jb, quote);
  }
  if (!custId || !lineItems || !lineItems.length) return res.status(400).json({ error: 'customer_id/job_id and items required' });
  const customer = await Customer.findByPk(custId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const uk = (await getSetting('uk')) || {};
  const provisionalSums = b.provisional_sums ?? quote?.provisional_sums ?? [];
  const { calc, cols } = ukTax.documentTotals(lineItems, {
    vat_treatment: b.vat_treatment ?? quote?.vat_treatment,
    cis_applies: b.cis_applies ?? quote?.cis_applies,
    cis_rate: b.cis_rate ?? quote?.cis_rate,
    retention_percent: b.retention_percent ?? quote?.retention_percent,
    provisional_sums: provisionalSums,
    provisional_sums_in_total: b.provisional_sums_in_total ?? quote?.provisional_sums_in_total,
  }, customer, uk);

  const vatRate = await getSetting('vat_rate');
  const ref = await nextRef('invoice');
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + (await getSetting('invoice_due_days')) * 86400000).toISOString().slice(0, 10);
  let created;
  try {
    created = await Invoice.create({
      customer_id: custId,
      job_id: job_id || null,
      ref,
      items: lineItems,
      subtotal: cols.subtotal,
      vat_rate: vatRate,
      vat_amount: cols.vat_amount,
      total: cols.grand_total,
      issue_date: issueDate,
      due_date: dueDate,
      notes: notes || null,
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
      provisional_sums: provisionalSums,
      provisional_sums_in_total: !!cols.provisional_sums_in_total,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError' && job_id) {
      return res.status(400).json({ error: 'This job already has an invoice' });
    }
    throw err;
  }
  if (job_id) {
    await Job.update({ status: 'INVOICED' }, { where: { id: job_id } });
    await resolveRule(`invoice_job:job:${job_id}`);
    const lead = leadId ? await resolveLeadForCustomer(custId, leadId) : null;
    if ((lead?.stage || customer.stage) === 'COMPLETED') {
      await setStage(custId, 'INVOICED', req.user.id, `Invoice ${ref} created`, { leadId: lead?.id || leadId });
    }
  }
  await logActivity(custId, req.user.id, 'invoice_created', `Invoice ${ref} created — ${money(cols.grand_total)}`, 'invoice', created.id);
  res.json({ id: created.id, ref, calc });
}));

router.put('/:id/tax', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, { include: [JOB_LEAD_INCLUDE] });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const customer = await Customer.findByPk(invoice.customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const uk = (await getSetting('uk')) || {};
  const applied = invoiceTax.applyDraftTax(invoice, req.body, customer, uk);
  if (applied.error) return res.status(applied.status || 400).json({ error: applied.error });
  await invoice.update(applied.cols);
  await logActivity(invoice.customer_id, req.user.id, 'invoice_tax', `Invoice ${invoice.ref} VAT/CIS updated`, 'invoice', invoice.id);
  res.json({
    invoice: viewInvoice({ ...plain(invoice), customer_name: customer.name }),
    calc: applied.calc,
  });
}));

router.post('/:id/pdf', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const result = await generateAndStoreInvoicePdf(invoice);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ pdf: result.filename });
}));

router.post('/:id/send', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!CAN_EMAIL_STATUSES.includes(invoice.status)) {
    return res.status(400).json({ error: 'This invoice cannot be emailed' });
  }
  const customer = await contacts.loadCustomerWithContacts(invoice.customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!customerHasEmail(customer)) {
    return res.status(400).json({ error: 'Customer has no email address on record' });
  }

  const filename = await invoicePdf(plain(invoice), customer);
  await invoice.update({ pdf_file: filename });

  let qbo = { simulated: true };
  try {
    qbo = await quickbooks.pushInvoice({ ...plain(invoice), pdf_file: filename }, customer);
    await invoice.update({ qbo_id: qbo.qboId, qbo_synced_at: new Date() });
  } catch (err) {
    await logActivity(invoice.customer_id, req.user.id, 'qbo_error', `QuickBooks push failed: ${String(err.message).slice(0, 150)}`);
  }

  const templates = await getSetting('templates');
  const vars = { name: (customer.name || '').split(' ')[0], ref: invoice.ref, title: 'your completed work', total: money(invoice.total), due_date: invoice.due_date };
  let emailResult;
  try {
    emailResult = await sendToCustomer(customer.id, 'email', templates.invoice_email_body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''), {
      userId: req.user.id,
      subject: templates.invoice_email_subject.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''),
      attachments: [{ filename: `${invoice.ref}.pdf`, path: path.join(DATA_DIR, 'files', filename) }],
      email: customer.email,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not send invoice email' });
  }

  await invoice.update({ status: 'sent', sent_at: new Date() });
  await logActivity(invoice.customer_id, req.user.id, 'invoice_sent', `Invoice ${invoice.ref} sent${qbo.simulated ? ' (QuickBooks simulated)' : ' and pushed to QuickBooks'}`, 'invoice', invoice.id);
  res.json({ ok: true, qbo, email: emailResult, pdf: filename });
}));

router.post('/:id/payment', asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, { include: [JOB_LEAD_INCLUDE] });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const applied = await invoicePayments.recordPayment(invoice, req.body, {
    userId: req.user.id,
    today: todayStr(),
  });
  if (applied.error) return res.status(applied.status || 400).json({ error: applied.error });

  await invoice.update(applied.cols);
  const payments = plain(await invoicePayments.paymentsForInvoice(invoice.id));
  if (applied.cols.status === 'paid') {
    if (invoice.job_id) await Job.update({ status: 'PAID' }, { where: { id: invoice.job_id } });
    const job = invoice.job_id ? await Job.findByPk(invoice.job_id, { attributes: ['lead_id'] }) : null;
    await setStage(invoice.customer_id, 'PAID', req.user.id, `Invoice ${invoice.ref} paid in full`, { leadId: job?.lead_id });
    await resolveRule(`chase_payment:invoice:${invoice.id}`);
  }
  await logActivity(
    invoice.customer_id,
    req.user.id,
    'payment_recorded',
    `Payment of ${money(applied.payment.amount)} recorded against ${invoice.ref}`,
    'invoice',
    invoice.id,
  );
  res.json({
    ok: true,
    status: applied.cols.status,
    amount_paid: applied.cols.amount_paid,
    outstanding: invoicePayments.outstanding(invoice),
    payment: plain(applied.payment),
    invoice: viewInvoice({ ...plain(invoice), payments }),
  });
}));

module.exports = router;

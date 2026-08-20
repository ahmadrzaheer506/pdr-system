// Invoicing + QuickBooks push/sync (PRD §10.3)
const express = require('express');
const path = require('path');
const { db, pj, j, nextRef, getSetting, money, DATA_DIR } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { setStage, logActivity } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');
const { resolveRule } = require('../services/taskEngine');
const { invoicePdf } = require('../services/pdf');
const quickbooks = require('../integrations/quickbooks');

const router = express.Router();
router.use(requireAuth, requireOffice);

function computeTotals(items, vatRate) {
  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0), 0);
  const vat = subtotal * (Number(vatRate) / 100);
  return { subtotal: +subtotal.toFixed(2), vat_amount: +vat.toFixed(2), total: +(subtotal + vat).toFixed(2) };
}

router.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = `SELECT i.*, c.name AS customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'ALL') { sql += ' AND i.status = ?'; params.push(status); }
  if (q) { sql += ' AND (c.name LIKE ? OR i.ref LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY i.id DESC LIMIT 200';
  res.json({ invoices: db.prepare(sql).all(...params).map((r) => ({ ...r, items: pj(r.items, []) })) });
});

/** Create an invoice from a completed job (pre-fills from the job/quote — PRD §10.3). */
router.post('/', (req, res) => {
  const { job_id, customer_id, items, notes } = req.body || {};
  let custId = customer_id, lineItems = items, title = 'Work carried out';
  if (job_id) {
    const jb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id);
    if (!jb) return res.status(404).json({ error: 'Job not found' });
    custId = jb.customer_id;
    title = jb.title;
    if (!lineItems) {
      lineItems = jb.quote_id
        ? pj(db.prepare('SELECT items FROM quotes WHERE id = ?').get(jb.quote_id)?.items, [])
        : [{ description: jb.title, qty: 1, unit_price: jb.value || 0 }];
    }
  }
  if (!custId || !lineItems || !lineItems.length) return res.status(400).json({ error: 'customer_id/job_id and items required' });
  const vatRate = getSetting('vat_rate');
  const totals = computeTotals(lineItems, vatRate);
  const ref = nextRef('invoice');
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + getSetting('invoice_due_days') * 86400000).toISOString().slice(0, 10);
  const r = db.prepare(
    `INSERT INTO invoices (customer_id, job_id, ref, items, subtotal, vat_rate, vat_amount, total, issue_date, due_date, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(custId, job_id || null, ref, j(lineItems), totals.subtotal, vatRate, totals.vat_amount, totals.total, issueDate, dueDate, notes || null);
  if (job_id) {
    db.prepare("UPDATE jobs SET status = 'INVOICED', updated_at = datetime('now') WHERE id = ?").run(job_id);
    resolveRule(`invoice_job:job:${job_id}`);
    const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(custId);
    if (cust && cust.stage === 'COMPLETED') setStage(custId, 'INVOICED', req.user.id, `Invoice ${ref} created`);
  }
  logActivity(custId, req.user.id, 'invoice_created', `Invoice ${ref} created — ${money(totals.total)}`, 'invoice', r.lastInsertRowid);
  res.json({ id: r.lastInsertRowid, ref });
});

/** Send invoice (email w/ PDF) and push to QuickBooks. */
router.post('/:id/send', async (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id);

  const filename = invoicePdf(invoice, customer);
  db.prepare('UPDATE invoices SET pdf_file = ? WHERE id = ?').run(filename, invoice.id);

  let qbo = { simulated: true };
  try {
    qbo = await quickbooks.pushInvoice({ ...invoice, pdf_file: filename }, customer);
    db.prepare("UPDATE invoices SET qbo_id = ?, qbo_synced_at = datetime('now') WHERE id = ?").run(qbo.qboId, invoice.id);
  } catch (err) {
    logActivity(invoice.customer_id, req.user.id, 'qbo_error', `QuickBooks push failed: ${String(err.message).slice(0, 150)}`);
  }

  const templates = getSetting('templates');
  const vars = { name: (customer.name || '').split(' ')[0], ref: invoice.ref, title: 'your completed work', total: money(invoice.total), due_date: invoice.due_date };
  let emailResult = null;
  if (customer.email) {
    try {
      emailResult = await sendToCustomer(customer.id, 'email', templates.invoice_email_body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''), {
        userId: req.user.id,
        subject: templates.invoice_email_subject.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''),
        attachments: [{ filename: `${invoice.ref}.pdf`, path: path.join(DATA_DIR, 'files', filename) }],
      });
    } catch (err) { /* non-fatal */ }
  }

  db.prepare("UPDATE invoices SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(invoice.id);
  logActivity(invoice.customer_id, req.user.id, 'invoice_sent', `Invoice ${invoice.ref} sent${qbo.simulated ? ' (QuickBooks simulated)' : ' and pushed to QuickBooks'}`, 'invoice', invoice.id);
  res.json({ ok: true, qbo, email: emailResult, pdf: filename });
});

/** Manual payment recording (works even without QuickBooks connected). */
router.post('/:id/payment', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { amount } = req.body || {};
  const paid = Math.min(invoice.total, invoice.amount_paid + Number(amount || invoice.total));
  const status = paid >= invoice.total ? 'paid' : 'part_paid';
  db.prepare(`UPDATE invoices SET amount_paid = ?, status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END WHERE id = ?`)
    .run(paid, status, status, invoice.id);
  if (status === 'paid') {
    if (invoice.job_id) db.prepare("UPDATE jobs SET status = 'PAID' WHERE id = ?").run(invoice.job_id);
    setStage(invoice.customer_id, 'PAID', req.user.id, `Invoice ${invoice.ref} paid in full`);
    resolveRule(`chase_payment:invoice:${invoice.id}`);
  }
  logActivity(invoice.customer_id, req.user.id, 'payment_recorded', `Payment of ${money(amount || invoice.total)} recorded against ${invoice.ref}`, 'invoice', invoice.id);
  res.json({ ok: true, status, amount_paid: paid });
});

module.exports = router;

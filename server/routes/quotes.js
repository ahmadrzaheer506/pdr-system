// Quotation creation & sending (PRD §9.4) + decision flow
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { db, pj, j, nextRef, getSetting, money, DATA_DIR } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { setStage, logActivity } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');
const { scheduleForQuote, render } = require('../services/followups');
const { resolveRule, ensureTask } = require('../services/taskEngine');
const { quotePdf } = require('../services/pdf');

const router = express.Router();
router.use(requireAuth, requireOffice);

const ukTax = require('../services/ukTax');

/**
 * Build the full UK breakdown for a quote and return the column values
 * ready to write. Keeps create and update in perfect agreement.
 */
function buildTotals(items, opts) {
  const uk = getSetting('uk') || {};
  const treatment = opts.vat_treatment || (uk.vat_registered === false ? 'not_registered' : 'standard');
  const calc = ukTax.calculate(items, {
    vat_treatment: treatment,
    cis_applies: !!opts.cis_applies,
    cis_rate: opts.cis_rate ?? uk.default_cis_rate ?? 20,
    retention_percent: opts.retention_percent || 0,
    payment_schedule: opts.payment_schedule || [],
  });
  return {
    calc,
    cols: {
      subtotal: calc.subtotal,
      vat_amount: calc.vat_total,
      total: calc.total,
      vat_treatment: calc.vat_treatment,
      labour_total: calc.labour_total,
      materials_total: calc.materials_total,
      vat_breakdown: j(calc.vat_breakdown),
      cis_applies: calc.cis_applies ? 1 : 0,
      cis_rate: calc.cis_rate,
      cis_deduction: calc.cis_deduction,
      retention_percent: calc.retention_percent,
      retention_amount: calc.retention_amount,
      due_now: calc.due_now,
      payment_schedule: j(calc.payment_schedule),
    },
  };
}

/** Signed public token so WhatsApp/Meta can fetch the PDF without auth. */
function fileToken(filename) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret-change-me').update(filename).digest('hex').slice(0, 24);
}
function publicPdfUrl(filename) {
  return `${process.env.APP_URL || 'http://localhost:4000'}/public-files/${fileToken(filename)}/${filename}`;
}

router.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = `SELECT q.*, c.name AS customer_name FROM quotes q JOIN customers c ON c.id = q.customer_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'ALL') { sql += ' AND q.status = ?'; params.push(status); }
  if (q) { sql += ' AND (c.name LIKE ? OR q.ref LIKE ? OR q.title LIKE ?)'; params.push(...Array(3).fill(`%${q}%`)); }
  sql += ' ORDER BY q.id DESC LIMIT 200';
  const quotes = db.prepare(sql).all(...params).map((r) => ({ ...r, items: pj(r.items, []) }));
  res.json({ quotes });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const { customer_id, title, items = [], notes, valid_until } = b;
  if (!customer_id || !title) return res.status(400).json({ error: 'customer_id and title required' });

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const defaults = getSetting('quote_defaults') || {};
  const { calc, cols } = buildTotals(items, {
    vat_treatment: b.vat_treatment,
    cis_applies: b.cis_applies,
    cis_rate: b.cis_rate,
    retention_percent: b.retention_percent,
    payment_schedule: b.payment_schedule || defaults.payment_schedule || [],
  });

  const ref = nextRef('quote');
  const validUntil = valid_until || new Date(Date.now() + getSetting('quote_validity_days') * 86400000).toISOString().slice(0, 10);

  // The 14-day cancellation right applies to consumers, not businesses.
  const isDomestic = (customer.customer_type || 'domestic') === 'domestic';

  const r = db.prepare(
    `INSERT INTO quotes (
       customer_id, ref, title, items, subtotal, vat_rate, vat_amount, total, valid_until, notes, created_by,
       vat_treatment, labour_total, materials_total, vat_breakdown,
       cis_applies, cis_rate, cis_deduction, retention_percent, retention_amount, due_now,
       payment_schedule, inclusions, exclusions, warranty_years, warranty_text,
       lead_time, duration_estimate, access_requirements, provisional_sums,
       cancellation_rights_apply
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?)`
  ).run(
    customer_id, ref, title, j(items), cols.subtotal, getSetting('vat_rate'), cols.vat_amount, cols.total, validUntil, notes || null, req.user.id,
    cols.vat_treatment, cols.labour_total, cols.materials_total, cols.vat_breakdown,
    cols.cis_applies, cols.cis_rate, cols.cis_deduction, cols.retention_percent, cols.retention_amount, cols.due_now,
    cols.payment_schedule,
    b.inclusions ?? defaults.inclusions ?? null,
    b.exclusions ?? defaults.exclusions ?? null,
    b.warranty_years ?? defaults.warranty_years ?? null,
    b.warranty_text ?? defaults.warranty_text ?? null,
    b.lead_time ?? defaults.lead_time ?? null,
    b.duration_estimate ?? null,
    b.access_requirements ?? null,
    j(b.provisional_sums || []),
    isDomestic ? 1 : 0
  );

  resolveRule(`produce_quote:customer:${customer_id}`);
  logActivity(customer_id, req.user.id, 'quote_created', `Quote ${ref} created — ${money(cols.total)}`, 'quote', r.lastInsertRowid);
  res.json({ id: r.lastInsertRowid, ref, calc });
});

/** Live totals preview for the quote builder — no database write. */
router.post('/preview', (req, res) => {
  const b = req.body || {};
  const { calc } = buildTotals(b.items || [], b);
  res.json(calc);
});

/** Reference data the quote builder needs (VAT codes, CIS rates, defaults). */
router.get('/meta/options', (req, res) => {
  res.json({
    vat_rates: ukTax.VAT_RATES,
    cis_rates: ukTax.CIS_RATES,
    uk: getSetting('uk'),
    defaults: getSetting('quote_defaults'),
  });
});

router.get('/:id', (req, res) => {
  const q = db.prepare('SELECT q.*, c.name AS customer_name, c.phone, c.email FROM quotes q JOIN customers c ON c.id = q.customer_id WHERE q.id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  q.items = pj(q.items, []);
  const followups = db.prepare('SELECT * FROM followups WHERE quote_id = ? ORDER BY step').all(q.id);
  res.json({ quote: q, followups });
});

router.put('/:id', (req, res) => {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (['accepted', 'declined'].includes(quote.status)) return res.status(400).json({ error: 'Quote already decided — create a new revision instead' });
  const b = req.body || {};
  const newItems = b.items !== undefined ? b.items : pj(quote.items, []);

  const { calc, cols } = buildTotals(newItems, {
    vat_treatment: b.vat_treatment ?? quote.vat_treatment,
    cis_applies: b.cis_applies ?? quote.cis_applies,
    cis_rate: b.cis_rate ?? quote.cis_rate,
    retention_percent: b.retention_percent ?? quote.retention_percent,
    payment_schedule: b.payment_schedule ?? pj(quote.payment_schedule, []),
  });

  db.prepare(
    `UPDATE quotes SET title = ?, items = ?, subtotal = ?, vat_amount = ?, total = ?, notes = ?, valid_until = ?,
       vat_treatment = ?, labour_total = ?, materials_total = ?, vat_breakdown = ?,
       cis_applies = ?, cis_rate = ?, cis_deduction = ?, retention_percent = ?, retention_amount = ?, due_now = ?,
       payment_schedule = ?, inclusions = ?, exclusions = ?, warranty_years = ?, warranty_text = ?,
       lead_time = ?, duration_estimate = ?, access_requirements = ?, provisional_sums = ?,
       cancellation_rights_apply = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.title || quote.title, j(newItems), cols.subtotal, cols.vat_amount, cols.total,
    b.notes ?? quote.notes, b.valid_until || quote.valid_until,
    cols.vat_treatment, cols.labour_total, cols.materials_total, cols.vat_breakdown,
    cols.cis_applies, cols.cis_rate, cols.cis_deduction, cols.retention_percent, cols.retention_amount, cols.due_now,
    cols.payment_schedule,
    b.inclusions ?? quote.inclusions,
    b.exclusions ?? quote.exclusions,
    b.warranty_years ?? quote.warranty_years,
    b.warranty_text ?? quote.warranty_text,
    b.lead_time ?? quote.lead_time,
    b.duration_estimate ?? quote.duration_estimate,
    b.access_requirements ?? quote.access_requirements,
    j(b.provisional_sums ?? pj(quote.provisional_sums, [])),
    b.cancellation_rights_apply !== undefined ? (b.cancellation_rights_apply ? 1 : 0) : quote.cancellation_rights_apply,
    quote.id
  );
  res.json({ ok: true, calc });
});

/** Send the quote via WhatsApp and/or email (PDF attached), start follow-ups, stage → QUOTED. */
router.post('/:id/send', async (req, res) => {
  const { channels = ['whatsapp'] } = req.body || {};
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id);

  // (re)generate the PDF
  const filename = quotePdf(quote, customer);
  db.prepare('UPDATE quotes SET pdf_file = ? WHERE id = ?').run(filename, quote.id);

  const templates = getSetting('templates');
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
        });
      } else if (ch === 'email') {
        results.email = await sendToCustomer(customer.id, 'email', render(templates.quote_email_body, vars), {
          userId: req.user.id,
          subject: render(templates.quote_email_subject, vars),
          attachments: [{ filename: `${quote.ref}.pdf`, path: path.join(DATA_DIR, 'files', filename) }],
        });
      }
    } catch (err) {
      errors.push(`${ch}: ${err.message}`);
    }
  }

  if (Object.keys(results).length === 0) {
    return res.status(400).json({ error: `Could not send on any channel — ${errors.join('; ')}` });
  }

  db.prepare(`UPDATE quotes SET status = 'sent', sent_at = datetime('now'), sent_via = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(Object.keys(results).join('+'), quote.id);
  const fresh = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote.id);
  scheduleForQuote(fresh);
  setStage(customer.id, 'QUOTED', req.user.id, `Quote ${quote.ref} sent (${Object.keys(results).join(', ')})`);
  logActivity(customer.id, req.user.id, 'quote_sent', `Quote ${quote.ref} (${money(quote.total)}) sent via ${Object.keys(results).join(' & ')}`, 'quote', quote.id);
  res.json({ ok: true, results, errors, pdf: filename });
});

/** Record the customer's decision. Accept → WON + Job auto-created (PRD flow). */
router.post('/:id/decision', (req, res) => {
  const { decision, reason } = req.body || {}; // 'accepted' | 'declined'
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be accepted or declined' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(quote.customer_id);

  db.prepare(`UPDATE quotes SET status = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(decision, quote.id);
  db.prepare("UPDATE followups SET status = 'cancelled', stop_reason = ? WHERE quote_id = ? AND status = 'pending'").run(`quote ${decision}`, quote.id);

  if (decision === 'accepted') {
    setStage(customer.id, 'WON', req.user.id, `Quote ${quote.ref} accepted`);
    const jr = db.prepare(
      `INSERT INTO jobs (customer_id, quote_id, title, description, address, status, value, required_skills)
       VALUES (?,?,?,?,?,'PENDING',?, '[]')`
    ).run(customer.id, quote.id, quote.title, quote.notes || null, customer.address, quote.total);
    ensureTask({
      ruleKey: `schedule_job:job:${jr.lastInsertRowid}`,
      title: `Schedule job — ${quote.title}`,
      detail: `${customer.name} accepted quote ${quote.ref} (${money(quote.total)}). Job needs lads and dates.`,
      priority: 'high',
      entityType: 'job',
      entityId: jr.lastInsertRowid,
    });
    logActivity(customer.id, req.user.id, 'quote_accepted', `Quote ${quote.ref} accepted — job created`, 'job', jr.lastInsertRowid);
    return res.json({ ok: true, job_id: jr.lastInsertRowid });
  }

  setStage(customer.id, 'LOST', req.user.id, `Quote ${quote.ref} declined${reason ? ` — ${reason}` : ''}`);
  if (reason) db.prepare('UPDATE customers SET lost_reason = ? WHERE id = ?').run(reason, customer.id);
  logActivity(customer.id, req.user.id, 'quote_declined', `Quote ${quote.ref} declined${reason ? ` — ${reason}` : ''}`, 'quote', quote.id);
  res.json({ ok: true });
});

module.exports = router;

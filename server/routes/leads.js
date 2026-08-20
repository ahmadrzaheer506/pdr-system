// Unified lead inbox (PRD §9.1)
const express = require('express');
const { db, pj } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { ingestInbound } = require('../services/messenger');
const { logActivity } = require('../services/pipeline');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', (req, res) => {
  const { status = 'NEW', source, q } = req.query;
  let sql = `
    SELECT l.*, c.name AS customer_name, c.phone, c.email, c.stage, c.address
    FROM leads l JOIN customers c ON c.id = l.customer_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'ALL') { sql += ' AND l.status = ?'; params.push(status); }
  if (source) { sql += ' AND l.source = ?'; params.push(source); }
  if (q) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR l.message LIKE ?)'; params.push(...Array(4).fill(`%${q}%`)); }
  sql += ' ORDER BY l.created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params).map((r) => ({ ...r, meta: pj(r.meta, {}) }));
  const counts = db.prepare("SELECT status, COUNT(*) c FROM leads GROUP BY status").all();
  res.json({ leads: rows, counts: Object.fromEntries(counts.map((r) => [r.status, r.c])) });
});

/** Manual "Log enquiry" quick-add — phone calls to personal mobiles etc. */
router.post('/', (req, res) => {
  const { source = 'manual', name, phone, email, address, message, subject } = req.body || {};
  if (!name && !phone && !email) return res.status(400).json({ error: 'Give at least a name, phone or email' });
  const result = ingestInbound({
    source,
    channel: source === 'manual' ? 'note' : source,
    name, phone, email, address,
    body: message || '',
    subject: subject || null,
  });
  logActivity(result.customerId, req.user.id, 'lead_logged', `Enquiry logged manually (${source})`);
  res.json(result);
});

router.put('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { status, next_action } = req.body || {};
  if (status) db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, lead.id);
  if (next_action !== undefined) db.prepare('UPDATE leads SET next_action = ? WHERE id = ?').run(next_action, lead.id);
  res.json({ ok: true });
});

module.exports = router;

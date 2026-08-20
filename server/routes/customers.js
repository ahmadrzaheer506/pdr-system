// CRM pipeline + customer records with full timeline (PRD §9.2)
const express = require('express');
const { db, pj } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { STAGES, STAGE_LABELS, setStage, logActivity } = require('../services/pipeline');
const { sendToCustomer } = require('../services/messenger');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', (req, res) => {
  const { q, stage } = req.query;
  let sql = `SELECT c.*, (SELECT COALESCE(SUM(q.total),0) FROM quotes q WHERE q.customer_id = c.id AND q.status IN ('sent','accepted')) AS quoted_value
             FROM customers c WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.address LIKE ?)'; params.push(...Array(4).fill(`%${q}%`)); }
  if (stage) { sql += ' AND c.stage = ?'; params.push(stage); }
  sql += ' ORDER BY c.updated_at DESC LIMIT 300';
  res.json({ customers: db.prepare(sql).all(...params) });
});

/** Kanban board — customers grouped by stage with headline value. */
router.get('/pipeline/board', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.stage, c.source, c.address, c.updated_at,
      (SELECT q.total FROM quotes q WHERE q.customer_id = c.id ORDER BY q.id DESC LIMIT 1) AS latest_quote_total,
      (SELECT COUNT(*) FROM tasks t WHERE t.entity_type='customer' AND t.entity_id=c.id AND t.status='open') AS open_tasks
    FROM customers c ORDER BY c.updated_at DESC`).all();
  const board = {};
  for (const s of STAGES) board[s] = [];
  for (const r of rows) (board[r.stage] || (board[r.stage] = [])).push(r);
  res.json({ board, stages: STAGES, labels: STAGE_LABELS });
});

router.post('/', (req, res) => {
  const { name, phone, email, address, postcode, notes, source = 'manual' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO customers (name, phone, email, address, postcode, notes, source) VALUES (?,?,?,?,?,?,?)')
    .run(name, phone || null, email || null, address || null, postcode || null, notes || null, source);
  logActivity(r.lastInsertRowid, req.user.id, 'customer_created', 'Customer created');
  res.json({ id: r.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const id = c.id;
  const messages = db.prepare('SELECT m.*, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.customer_id = ? ORDER BY m.created_at, m.id').all(id)
    .map((m) => ({ ...m, meta: pj(m.meta, {}) }));
  const activity = db.prepare('SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.customer_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 100').all(id);
  const quotes = db.prepare('SELECT * FROM quotes WHERE customer_id = ? ORDER BY id DESC').all(id).map((q) => ({ ...q, items: pj(q.items, []) }));
  const jobs = db.prepare(`SELECT j.*, (SELECT GROUP_CONCAT(u.name, ', ') FROM job_assignments ja JOIN users u ON u.id = ja.user_id WHERE ja.job_id = j.id) AS crew FROM jobs j WHERE j.customer_id = ? ORDER BY j.id DESC`).all(id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY id DESC').all(id).map((i) => ({ ...i, items: pj(i.items, []) }));
  const appointments = db.prepare('SELECT * FROM appointments WHERE customer_id = ? ORDER BY start DESC').all(id);
  const leads = db.prepare('SELECT * FROM leads WHERE customer_id = ? ORDER BY id DESC').all(id);
  const followups = db.prepare('SELECT f.*, q.ref AS quote_ref FROM followups f JOIN quotes q ON q.id = f.quote_id WHERE f.customer_id = ? ORDER BY f.scheduled_at').all(id);
  const stageHistory = db.prepare('SELECT sh.*, u.name AS user_name FROM stage_history sh LEFT JOIN users u ON u.id = sh.user_id WHERE sh.customer_id = ? ORDER BY sh.created_at DESC').all(id);
  res.json({ customer: c, messages, activity, quotes, jobs, invoices, appointments, leads, followups, stageHistory, stages: STAGES, labels: STAGE_LABELS });
});

router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const fields = ['name', 'phone', 'email', 'address', 'postcode', 'notes', 'lost_reason'];
  for (const f of fields) {
    if (req.body[f] !== undefined) db.prepare(`UPDATE customers SET ${f} = ?, updated_at = datetime('now') WHERE id = ?`).run(req.body[f], c.id);
  }
  res.json({ ok: true });
});

router.put('/:id/stage', (req, res) => {
  const { stage, note } = req.body || {};
  try {
    setStage(Number(req.params.id), stage, req.user.id, note);
    if (stage === 'LOST' && req.body.lost_reason) {
      db.prepare('UPDATE customers SET lost_reason = ? WHERE id = ?').run(req.body.lost_reason, req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Send a message to the customer on any channel (WhatsApp/email/FB) or log a note/call. */
router.post('/:id/messages', async (req, res) => {
  const { channel, body, subject } = req.body || {};
  if (!channel || !body) return res.status(400).json({ error: 'channel and body required' });
  try {
    const result = await sendToCustomer(Number(req.params.id), channel, body, { userId: req.user.id, subject });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

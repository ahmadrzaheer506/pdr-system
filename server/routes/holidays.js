// Staff holiday management with enforced notice rule (PRD §11.2)
const express = require('express');
const { db, getSetting } = require('../db');
const { requireAuth, requireOffice } = require('../auth');

const router = express.Router();

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}
function noticeDaysUntil(date) {
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(date) - today) / 86400000);
}

router.get('/', requireAuth, requireOffice, (req, res) => {
  const { status, user_id } = req.query;
  let sql = `SELECT h.*, u.name AS user_name, u.color FROM holiday_requests h JOIN users u ON u.id = h.user_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND h.status = ?'; params.push(status); }
  if (user_id) { sql += ' AND h.user_id = ?'; params.push(user_id); }
  sql += ' ORDER BY h.created_at DESC';
  res.json({ holidays: db.prepare(sql).all(...params), notice_days: getSetting('holiday_notice_days') });
});

/** Everyone's approved holiday in a date range — for the scheduling view overlay (PRD §11.2). */
router.get('/calendar', requireAuth, (req, res) => {
  const { from, to } = req.query;
  const rows = db.prepare(
    `SELECT h.id, h.user_id, u.name AS user_name, u.color, h.start_date, h.end_date FROM holiday_requests h
     JOIN users u ON u.id = h.user_id
     WHERE h.status = 'approved' AND date(h.start_date) <= date(?) AND date(h.end_date) >= date(?)`
  ).all(to || '2100-01-01', from || '1900-01-01');
  res.json({ holidays: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { start_date, end_date, reason, user_id } = req.body || {};
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });
  const targetUser = req.user.role === 'STAFF' ? req.user.id : (user_id || req.user.id);
  const exists = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(targetUser);
  if (!exists) return res.status(400).json({ error: 'That staff member does not exist or is inactive' });
  if (new Date(end_date) < new Date(start_date)) return res.status(400).json({ error: 'End date cannot be before the start date' });
  const noticeDays = getSetting('holiday_notice_days');
  const notice = noticeDaysUntil(start_date);
  if (notice < noticeDays) {
    return res.status(400).json({ error: `Requires ${noticeDays} days' notice — this date is only ${Math.max(notice, 0)} days away`, notice_days: noticeDays });
  }
  const days = daysBetween(start_date, end_date);
  const r = db.prepare(
    'INSERT INTO holiday_requests (user_id, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?)'
  ).run(targetUser, start_date, end_date, days, reason || null, 'pending');
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id/decision', requireAuth, requireOffice, (req, res) => {
  const h = db.prepare('SELECT * FROM holiday_requests WHERE id = ?').get(req.params.id);
  if (!h) return res.status(404).json({ error: 'Request not found' });
  const { decision, decline_reason } = req.body || {}; // approved | declined
  if (!['approved', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or declined' });
  db.prepare("UPDATE holiday_requests SET status = ?, decided_by = ?, decided_at = datetime('now'), decline_reason = ? WHERE id = ?")
    .run(decision, req.user.id, decline_reason || null, h.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const h = db.prepare('SELECT * FROM holiday_requests WHERE id = ?').get(req.params.id);
  if (!h) return res.status(404).json({ error: 'Request not found' });
  if (req.user.role === 'STAFF' && h.user_id !== req.user.id) return res.status(403).json({ error: 'Not permitted' });
  if (h.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be withdrawn' });
  db.prepare('DELETE FROM holiday_requests WHERE id = ?').run(h.id);
  res.json({ ok: true });
});

module.exports = router;

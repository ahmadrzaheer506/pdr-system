// Reminders & Task engine API (PRD §10.4)
const express = require('express');
const { db, todayStr } = require('../db');
const { requireAuth, requireOffice } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', (req, res) => {
  const { status = 'open', when } = req.query; // when: today|overdue|upcoming
  let sql = `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'ALL') { sql += ' AND t.status = ?'; params.push(status); }
  if (when === 'today') { sql += " AND date(t.due_date) = date('now')"; }
  if (when === 'overdue') { sql += " AND date(t.due_date) < date('now')"; }
  if (when === 'upcoming') { sql += " AND date(t.due_date) > date('now')"; }
  sql += ` ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.due_date IS NULL, t.due_date`;
  const tasks = db.prepare(sql).all(...params);
  const counts = {
    open: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status='open'").get().c,
    overdue: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status='open' AND date(due_date) < date('now')").get().c,
    today: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status='open' AND date(due_date) = date('now')").get().c,
  };
  res.json({ tasks, counts });
});

router.post('/', (req, res) => {
  const { title, detail, due_date, priority, assignee_id, entity_type, entity_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const r = db.prepare(
    `INSERT INTO tasks (type, title, detail, due_date, priority, assignee_id, entity_type, entity_id) VALUES ('manual',?,?,?,?,?,?,?)`
  ).run(title, detail || null, due_date || todayStr(), priority || 'normal', assignee_id || null, entity_type || null, entity_id || null);
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const { status, title, detail, due_date, priority } = req.body || {};
  if (status) {
    db.prepare(`UPDATE tasks SET status = ?, done_at = CASE WHEN ? IN ('done','dismissed') THEN datetime('now') ELSE NULL END WHERE id = ?`).run(status, status, t.id);
  }
  const fields = { title, detail, due_date, priority };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) db.prepare(`UPDATE tasks SET ${k} = ? WHERE id = ?`).run(v, t.id);
  res.json({ ok: true });
});

module.exports = router;

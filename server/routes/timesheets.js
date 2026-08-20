// ============================================================
// Timesheets API.
//   /api/timesheets/*        — office/admin: review, approve, report
//   staff clock in/out lives in routes/staff.js so the whole staff
//   surface stays in one file with one permission model.
// Cost figures appear ONLY in this file, never in the staff routes.
// ============================================================
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOffice, requireAdmin } = require('../auth');
const ts = require('../services/timesheets');

const router = express.Router();
router.use(requireAuth, requireOffice);

function defaultRange(req) {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

router.get('/', (req, res) => {
  const { from, to } = defaultRange(req);
  const rows = ts.listTimesheets({
    from, to,
    userId: req.query.user_id ? Number(req.query.user_id) : null,
    jobId: req.query.job_id ? Number(req.query.job_id) : null,
    status: req.query.status || null,
  });
  const counts = {
    awaiting: db.prepare("SELECT COUNT(*) c FROM timesheets WHERE status = 'completed'").get().c,
    flagged: db.prepare("SELECT COUNT(*) c FROM timesheets WHERE location_flag IS NOT NULL AND status != 'approved'").get().c,
    running: db.prepare("SELECT COUNT(*) c FROM timesheets WHERE status = 'active'").get().c,
  };
  res.json({ timesheets: rows, counts, range: { from, to } });
});

/** Who is on the clock right now — the "who's working" board. */
router.get('/live', (req, res) => {
  const rows = db.prepare(
    `SELECT t.id, t.user_id, t.job_id, t.clock_in, t.break_started_at, t.break_minutes,
            t.location_flag, t.in_distance_m,
            u.name AS user_name, u.color, j.title AS job_title, j.address, c.name AS customer_name
     FROM timesheets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN jobs j ON j.id = t.job_id
     LEFT JOIN customers c ON c.id = j.customer_id
     WHERE t.status = 'active' ORDER BY t.clock_in`
  ).all();
  res.json({ active: rows });
});

router.get('/totals', (req, res) => {
  const { from, to } = defaultRange(req);
  res.json({ totals: ts.weeklyTotals(from, to), range: { from, to } });
});

router.get('/costing', (req, res) => {
  res.json({ jobs: ts.jobCosting(req.query.job_id ? Number(req.query.job_id) : null) });
});

/** Office correction of a shift. Always requires a reason — audit trail. */
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM timesheets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Timesheet not found' });
  const { clock_in, clock_out, break_minutes, notes, edit_reason, job_id } = req.body || {};
  if (!edit_reason || !String(edit_reason).trim()) {
    return res.status(400).json({ error: 'A reason is required when editing someone\'s recorded hours' });
  }

  const newIn = clock_in || row.clock_in;
  const newOut = clock_out !== undefined ? clock_out : row.clock_out;
  const newBreak = break_minutes !== undefined ? Number(break_minutes) : Number(row.break_minutes);

  let worked = row.worked_minutes;
  let cost = row.labour_cost;
  if (newOut) {
    const mins = (new Date(String(newOut).replace(' ', 'T') + 'Z') - new Date(String(newIn).replace(' ', 'T') + 'Z')) / 60000;
    worked = Math.max(0, Math.round((mins - newBreak) * 100) / 100);
    const rate = Number(row.cost_rate) || Number(db.prepare('SELECT hourly_cost FROM users WHERE id = ?').get(row.user_id)?.hourly_cost) || 0;
    cost = Math.round((worked / 60) * rate * 100) / 100;
  }

  db.prepare(
    `UPDATE timesheets SET clock_in = ?, clock_out = ?, break_minutes = ?, notes = ?, job_id = ?,
       worked_minutes = ?, labour_cost = ?, edit_reason = ? WHERE id = ?`
  ).run(newIn, newOut, newBreak, notes ?? row.notes, job_id ?? row.job_id, worked, cost, String(edit_reason).trim(), row.id);

  res.json({ ok: true, worked_minutes: worked, labour_cost: cost });
});

router.post('/:id/approve', (req, res) => {
  const row = db.prepare('SELECT * FROM timesheets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Timesheet not found' });
  if (row.status === 'active') return res.status(400).json({ error: 'That shift is still running — it cannot be approved yet' });
  db.prepare("UPDATE timesheets SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?")
    .run(req.user.id, row.id);
  res.json({ ok: true });
});

/** Approve a whole batch — the realistic Friday-afternoon workflow. */
router.post('/approve-batch', (req, res) => {
  const { ids = [] } = req.body || {};
  if (!ids.length) return res.status(400).json({ error: 'No timesheets selected' });
  const stmt = db.prepare("UPDATE timesheets SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ? AND status = 'completed'");
  const tx = db.transaction((list) => { for (const id of list) stmt.run(req.user.id, id); });
  tx(ids);
  res.json({ ok: true, approved: ids.length });
});

router.post('/:id/reject', (req, res) => {
  const { reason } = req.body || {};
  const row = db.prepare('SELECT * FROM timesheets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Timesheet not found' });
  db.prepare("UPDATE timesheets SET status = 'rejected', approved_by = ?, approved_at = datetime('now'), edit_reason = ? WHERE id = ?")
    .run(req.user.id, reason || 'Rejected by office', row.id);
  res.json({ ok: true });
});

/** Office can also clock someone out who forgot (common on a Friday). */
router.post('/:id/force-clockout', (req, res) => {
  const row = db.prepare('SELECT * FROM timesheets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Timesheet not found' });
  if (row.status !== 'active') return res.status(400).json({ error: 'That shift is not running' });
  try {
    const result = ts.clockOut(row.user_id, { notes: `Clocked out by office (${req.user.name})` });
    res.json({ ok: true, timesheet: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** CSV export for payroll. */
router.get('/export.csv', (req, res) => {
  const { from, to } = defaultRange(req);
  const rows = ts.listTimesheets({ from, to });
  const head = ['Date', 'Staff', 'Job', 'Customer', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Rate', 'Cost', 'Status', 'Flag', 'Notes'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.work_date, r.user_name, r.job_title || '', r.customer_name || '',
      r.clock_in || '', r.clock_out || '', r.break_minutes || 0,
      r.worked_minutes ? (r.worked_minutes / 60).toFixed(2) : '',
      r.cost_rate ?? '', r.labour_cost ?? '', r.status, r.location_flag || '', r.notes || '',
    ].map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${from}-to-${to}.csv"`);
  res.send(lines.join('\n'));
});

module.exports = router;

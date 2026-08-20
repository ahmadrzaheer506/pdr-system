// ============================================================
// Field Staff ("the lads") API — PRD §9.5 / §15.1 hard requirement:
// price/financial fields are excluded from the SQL projection
// itself, not filtered client-side. No query in this file ever
// selects value/price/quote/invoice columns.
// ============================================================
const express = require('express');
const { db, getSetting } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function ownJobOr403(req, res, next) {
  if (req.user.role !== 'STAFF') return next(); // office/admin can also use this API to preview
  next();
}

/** My jobs — today/this week. NEVER select value, price, quote or invoice columns here. */
router.get('/jobs', requireAuth, (req, res) => {
  const userId = req.user.role === 'STAFF' ? req.user.id : Number(req.query.user_id || req.user.id);
  const { from, to } = req.query;
  const dateFrom = from || new Date().toISOString().slice(0, 10);
  const dateTo = to || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const jobs = db.prepare(
    `SELECT j.id, j.title, j.description, j.address, j.start_date, j.end_date, j.start_time, j.end_time,
            j.status, j.priority, j.materials, c.name AS customer_name, c.phone AS customer_phone
     FROM jobs j
     JOIN customers c ON c.id = j.customer_id
     JOIN job_assignments ja ON ja.job_id = j.id
     WHERE ja.user_id = ? AND j.start_date IS NOT NULL
       AND date(j.start_date) <= date(?)
       AND date(COALESCE(j.end_date, j.start_date)) >= date(?)
     ORDER BY j.start_date, j.start_time`
  ).all(userId, dateTo, dateFrom);

  const crewByJob = {};
  if (jobs.length) {
    const ids = jobs.map((j) => j.id);
    const crew = db.prepare(
      `SELECT ja.job_id, u.name FROM job_assignments ja JOIN users u ON u.id = ja.user_id WHERE ja.job_id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids);
    for (const c of crew) (crewByJob[c.job_id] ||= []).push(c.name);
  }
  res.json({ jobs: jobs.map((j) => ({ ...j, crew: crewByJob[j.id] || [] })) });
});

/** Single job detail — same field allowlist, plus job chat. */
router.get('/jobs/:id', requireAuth, (req, res) => {
  const jb = db.prepare(
    `SELECT j.id, j.title, j.description, j.address, j.start_date, j.end_date, j.start_time, j.end_time,
            j.status, j.priority, j.materials, c.name AS customer_name, c.phone AS customer_phone
     FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?`
  ).get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (req.user.role === 'STAFF') {
    const assigned = db.prepare('SELECT 1 FROM job_assignments WHERE job_id = ? AND user_id = ?').get(jb.id, req.user.id);
    if (!assigned) return res.status(403).json({ error: 'Not your job' });
  }
  const crew = db.prepare('SELECT u.id, u.name FROM job_assignments ja JOIN users u ON u.id = ja.user_id WHERE ja.job_id = ?').all(jb.id);
  const messages = db.prepare('SELECT jm.id, jm.body, jm.created_at, u.name AS user_name FROM job_messages jm JOIN users u ON u.id = jm.user_id WHERE jm.job_id = ? ORDER BY jm.created_at').all(jb.id);
  res.json({ job: { ...jb, crew }, messages });
});

router.post('/jobs/:id/messages', requireAuth, (req, res) => {
  const jb = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (req.user.role === 'STAFF') {
    const assigned = db.prepare('SELECT 1 FROM job_assignments WHERE job_id = ? AND user_id = ?').get(jb.id, req.user.id);
    if (!assigned) return res.status(403).json({ error: 'Not your job' });
  }
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const r = db.prepare('INSERT INTO job_messages (job_id, user_id, body) VALUES (?,?,?)').run(jb.id, req.user.id, body);
  res.json({ id: r.lastInsertRowid });
});

/** My teammates' approved holiday (for "who's available" — PRD §11.2), no financial data anywhere in this file. */
router.get('/holidays/team', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT h.user_id, u.name AS user_name, h.start_date, h.end_date FROM holiday_requests h
     JOIN users u ON u.id = h.user_id WHERE h.status = 'approved' AND date(h.end_date) >= date('now')`
  ).all();
  res.json({ holidays: rows });
});

router.get('/holidays/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM holiday_requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ holidays: rows, notice_days: getSetting('holiday_notice_days'), allowance: req.user.holiday_allowance });
});

// ============================================================
// Clock in / out (PRD addition).
// Every response here is deliberately free of cost_rate and
// labour_cost — a lad sees his hours, never what he costs.
// ============================================================
const ts = require('../services/timesheets');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../db');

/** Strip anything financial before a timesheet is sent to a STAFF user. */
function safeShift(row) {
  if (!row) return null;
  const { cost_rate, labour_cost, approved_by, ...safe } = row;
  return safe;
}

/** Current shift state — drives the big clock-in button. */
router.get('/clock/status', requireAuth, (req, res) => {
  const shift = ts.activeShift(req.user.id);
  const cfg = getSetting('timesheets') || {};
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  })();
  const week = db.prepare(
    `SELECT COALESCE(SUM(worked_minutes),0)/60.0 AS hours, COUNT(*) AS shifts
     FROM timesheets WHERE user_id = ? AND date(work_date) >= date(?) AND status != 'active'`
  ).get(req.user.id, weekStart);

  res.json({
    active: safeShift(shift),
    on_break: !!(shift && shift.break_started_at),
    enabled: cfg.enabled !== false,
    require_location: !!cfg.require_location,
    require_photo: !!cfg.require_photo_on_clockout,
    week_hours: Math.round((week.hours || 0) * 100) / 100,
    week_shifts: week.shifts,
  });
});

router.post('/clock/in', requireAuth, (req, res) => {
  const { job_id, lat, lng, accuracy } = req.body || {};
  try {
    const shift = ts.clockIn(req.user.id, {
      job_id: job_id ? Number(job_id) : null,
      lat: lat ?? null, lng: lng ?? null, accuracy: accuracy ?? null,
    });
    res.json({ ok: true, shift: safeShift(shift) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clock/break/start', requireAuth, (req, res) => {
  try { res.json({ ok: true, shift: safeShift(ts.startBreak(req.user.id)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/clock/break/end', requireAuth, (req, res) => {
  try { res.json({ ok: true, shift: safeShift(ts.endBreak(req.user.id)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/clock/out', requireAuth, (req, res) => {
  const { lat, lng, accuracy, notes, photo } = req.body || {};
  let photoFile = null;

  // Photo arrives as a base64 data URL from the phone camera.
  if (photo && typeof photo === 'string' && photo.startsWith('data:image/')) {
    try {
      const match = photo.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        // 8MB ceiling — a phone photo is well under this
        if (buf.length <= 8 * 1024 * 1024) {
          photoFile = `shift-${req.user.id}-${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(DATA_DIR, 'files', photoFile), buf);
        }
      }
    } catch { photoFile = null; }
  }

  try {
    const shift = ts.clockOut(req.user.id, {
      lat: lat ?? null, lng: lng ?? null, accuracy: accuracy ?? null,
      notes: notes || null, photo_file: photoFile,
    });
    res.json({
      ok: true,
      shift: safeShift(shift),
      hours: Math.round((shift.worked_minutes / 60) * 100) / 100,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** My own hours — no cost figures anywhere. */
router.get('/timesheets/mine', requireAuth, (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10);
  const rows = ts.myTimesheets(req.user.id, from, to);
  const totalHours = rows.reduce((s, r) => s + (Number(r.worked_minutes) || 0), 0) / 60;
  res.json({ timesheets: rows, total_hours: Math.round(totalHours * 100) / 100, range: { from, to } });
});

module.exports = router;

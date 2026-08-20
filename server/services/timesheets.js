// ============================================================
// Timesheet service — clock in / break / clock out, GPS distance
// checking, hours calculation and labour costing.
//
// Design notes:
//  · A person can have exactly one active shift (enforced by a partial
//    unique index in the schema, not just application logic).
//  · Cost rate is snapshotted onto the shift at clock-out, so changing
//    someone's rate later never rewrites historic job costs.
//  · GPS is best-effort: staff can decline permission and still clock in;
//    the shift is simply flagged 'no_location' for the office to see.
// ============================================================
const { db, getSetting } = require('../db');

// ---------- geo ----------

/** Great-circle distance in metres between two lat/lng pairs (Haversine). */
function distanceMetres(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || isNaN(v))) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Job sites are stored as text addresses, not coordinates. If a job has been
 * given coordinates (via the jobs.lat/lng columns, populated when geocoding is
 * available) we compare against those. Otherwise distance is unknown, which is
 * an honest null rather than a fabricated number.
 */
function jobCoords(jobId) {
  if (!jobId) return null;
  const cols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  if (!cols.includes('lat') || !cols.includes('lng')) return null;
  const row = db.prepare('SELECT lat, lng FROM jobs WHERE id = ?').get(jobId);
  if (!row || row.lat === null || row.lng === null) return null;
  return { lat: row.lat, lng: row.lng };
}

// ---------- time helpers ----------

const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const todayStr = () => new Date().toISOString().slice(0, 10);

function minutesBetween(startSql, endSql) {
  const a = new Date(String(startSql).replace(' ', 'T') + 'Z');
  const b = new Date(String(endSql).replace(' ', 'T') + 'Z');
  return (b - a) / 60000;
}

/** Apply the configured rounding (e.g. to the nearest 15 minutes). */
function roundMinutes(mins) {
  const cfg = getSetting('timesheets') || {};
  const step = Number(cfg.round_to_minutes) || 0;
  if (!step) return Math.max(0, Math.round(mins * 100) / 100);
  return Math.max(0, Math.round(mins / step) * step);
}

// ---------- core operations ----------

function activeShift(userId) {
  return db
    .prepare(
      `SELECT t.*, j.title AS job_title, j.address AS job_address, c.name AS customer_name
       FROM timesheets t
       LEFT JOIN jobs j ON j.id = t.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       WHERE t.user_id = ? AND t.status = 'active'`
    )
    .get(userId);
}

/**
 * Clock in. Returns the created shift.
 * Throws a plain Error with a user-facing message on any rule violation.
 */
function clockIn(userId, { job_id = null, lat = null, lng = null, accuracy = null } = {}) {
  const cfg = getSetting('timesheets') || {};
  if (cfg.enabled === false) throw new Error('Timesheets are turned off for this business');

  if (activeShift(userId)) throw new Error('You are already clocked in — clock out first');

  if (job_id) {
    const assigned = db.prepare('SELECT 1 FROM job_assignments WHERE job_id = ? AND user_id = ?').get(job_id, userId);
    if (!assigned) throw new Error('You are not assigned to that job');
  }

  let distance = null;
  let flag = null;
  const coords = jobCoords(job_id);
  if (lat !== null && lng !== null) {
    if (coords) {
      distance = distanceMetres(lat, lng, coords.lat, coords.lng);
      const radius = Number(cfg.site_radius_m) || 300;
      if (distance !== null && distance > radius) flag = 'far_from_site';
    }
  } else if (cfg.require_location) {
    flag = 'no_location';
  }

  const r = db
    .prepare(
      `INSERT INTO timesheets (user_id, job_id, work_date, clock_in, in_lat, in_lng, in_accuracy, in_distance_m, location_flag, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'active')`
    )
    .run(userId, job_id, todayStr(), nowSql(), lat, lng, accuracy, distance, flag);

  return db.prepare('SELECT * FROM timesheets WHERE id = ?').get(r.lastInsertRowid);
}

function startBreak(userId) {
  const shift = activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');
  if (shift.break_started_at) throw new Error('You are already on a break');
  db.prepare('UPDATE timesheets SET break_started_at = ? WHERE id = ?').run(nowSql(), shift.id);
  return activeShift(userId);
}

function endBreak(userId) {
  const shift = activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');
  if (!shift.break_started_at) throw new Error('You are not on a break');
  const mins = minutesBetween(shift.break_started_at, nowSql());
  db.prepare('UPDATE timesheets SET break_minutes = break_minutes + ?, break_started_at = NULL WHERE id = ?')
    .run(Math.max(0, mins), shift.id);
  return activeShift(userId);
}

/**
 * Clock out. Computes worked minutes (elapsed minus breaks), applies any
 * configured automatic break deduction and rounding, then snapshots the
 * person's cost rate so job costing stays historically accurate.
 */
function clockOut(userId, { lat = null, lng = null, accuracy = null, notes = null, photo_file = null } = {}) {
  const shift = activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');

  const cfg = getSetting('timesheets') || {};
  const out = nowSql();

  // close an open break automatically
  let breakMinutes = Number(shift.break_minutes) || 0;
  if (shift.break_started_at) breakMinutes += Math.max(0, minutesBetween(shift.break_started_at, out));

  let elapsed = minutesBetween(shift.clock_in, out);
  if (elapsed < 0) elapsed = 0;

  // Automatic unpaid break after a long shift, if configured
  const autoBreak = Number(cfg.auto_break_minutes) || 0;
  const autoAfter = (Number(cfg.auto_break_after_hours) || 6) * 60;
  if (autoBreak > 0 && elapsed >= autoAfter && breakMinutes < autoBreak) {
    breakMinutes = autoBreak;
  }

  let worked = roundMinutes(Math.max(0, elapsed - breakMinutes));

  // Safety net for a shift someone forgot to close
  const maxMins = (Number(cfg.max_shift_hours) || 14) * 60;
  let flag = shift.location_flag;
  if (worked > maxMins) {
    worked = maxMins;
    flag = flag || 'over_max_hours';
  }

  let outDistance = null;
  const coords = jobCoords(shift.job_id);
  if (lat !== null && lng !== null && coords) {
    outDistance = distanceMetres(lat, lng, coords.lat, coords.lng);
    const radius = Number(cfg.site_radius_m) || 300;
    if (outDistance !== null && outDistance > radius && !flag) flag = 'far_from_site';
  }

  const user = db.prepare('SELECT hourly_cost FROM users WHERE id = ?').get(userId);
  const rate = Number(user?.hourly_cost) || 0;
  const cost = Math.round((worked / 60) * rate * 100) / 100;

  db.prepare(
    `UPDATE timesheets SET clock_out = ?, break_minutes = ?, break_started_at = NULL,
       out_lat = ?, out_lng = ?, out_accuracy = ?, out_distance_m = ?, location_flag = ?,
       notes = ?, photo_file = ?, worked_minutes = ?, cost_rate = ?, labour_cost = ?, status = 'completed'
     WHERE id = ?`
  ).run(out, breakMinutes, lat, lng, accuracy, outDistance, flag, notes, photo_file, worked, rate, cost, shift.id);

  return db.prepare('SELECT * FROM timesheets WHERE id = ?').get(shift.id);
}

// ---------- reporting ----------

/** A staff member's own hours. Never includes cost figures. */
function myTimesheets(userId, from, to) {
  return db
    .prepare(
      `SELECT t.id, t.job_id, t.work_date, t.clock_in, t.clock_out, t.break_minutes,
              t.worked_minutes, t.status, t.notes, t.location_flag,
              j.title AS job_title, c.name AS customer_name
       FROM timesheets t
       LEFT JOIN jobs j ON j.id = t.job_id
       LEFT JOIN customers c ON c.id = j.customer_id
       WHERE t.user_id = ? AND date(t.work_date) BETWEEN date(?) AND date(?)
       ORDER BY t.work_date DESC, t.clock_in DESC`
    )
    .all(userId, from, to);
}

/** Office view — includes cost. */
function listTimesheets({ from, to, userId = null, jobId = null, status = null }) {
  let sql = `
    SELECT t.*, u.name AS user_name, u.color, j.title AS job_title, c.name AS customer_name
    FROM timesheets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN jobs j ON j.id = t.job_id
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE date(t.work_date) BETWEEN date(?) AND date(?)`;
  const params = [from, to];
  if (userId) { sql += ' AND t.user_id = ?'; params.push(userId); }
  if (jobId) { sql += ' AND t.job_id = ?'; params.push(jobId); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  sql += ' ORDER BY t.work_date DESC, t.clock_in DESC';
  return db.prepare(sql).all(...params);
}

/** Per-person totals for a period — the payroll view. */
function weeklyTotals(from, to) {
  return db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.color, u.hourly_cost,
              COALESCE(SUM(t.worked_minutes), 0) / 60.0 AS hours,
              COALESCE(SUM(t.labour_cost), 0) AS cost,
              COUNT(t.id) AS shifts,
              SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS awaiting_approval,
              SUM(CASE WHEN t.location_flag IS NOT NULL THEN 1 ELSE 0 END) AS flagged
       FROM users u
       LEFT JOIN timesheets t
         ON t.user_id = u.id AND date(t.work_date) BETWEEN date(?) AND date(?)
       WHERE u.role = 'STAFF' AND u.active = 1
       GROUP BY u.id ORDER BY u.name`
    )
    .all(from, to);
}

/**
 * Job profitability — quoted value vs actual labour cost.
 * This is the number that tells Paul which jobs are actually making money.
 */
function jobCosting(jobId = null) {
  let sql = `
    SELECT j.id, j.title, j.status, j.value AS quoted_value, j.start_date,
           c.name AS customer_name,
           COALESCE(SUM(t.worked_minutes), 0) / 60.0 AS actual_hours,
           COALESCE(SUM(t.labour_cost), 0) AS actual_labour_cost,
           COUNT(t.id) AS shift_count
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    LEFT JOIN timesheets t ON t.job_id = j.id AND t.status IN ('completed','approved')
    WHERE 1=1`;
  const params = [];
  if (jobId) { sql += ' AND j.id = ?'; params.push(jobId); }
  sql += ' GROUP BY j.id ORDER BY j.start_date DESC';

  return db.prepare(sql).all(...params).map((r) => {
    const value = Number(r.quoted_value) || 0;
    const labour = Number(r.actual_labour_cost) || 0;
    // Quoted value is VAT-inclusive in this system, so strip VAT for a
    // like-for-like margin against net labour cost.
    const netValue = Math.round((value / 1.2) * 100) / 100;
    const margin = netValue ? Math.round(((netValue - labour) / netValue) * 1000) / 10 : null;
    return {
      ...r,
      actual_hours: Math.round(r.actual_hours * 100) / 100,
      actual_labour_cost: Math.round(labour * 100) / 100,
      net_value: netValue,
      gross_profit: Math.round((netValue - labour) * 100) / 100,
      margin_percent: margin,
      underquoted: margin !== null && margin < 20,
    };
  });
}

module.exports = {
  distanceMetres,
  activeShift,
  clockIn,
  startBreak,
  endBreak,
  clockOut,
  myTimesheets,
  listTimesheets,
  weeklyTotals,
  jobCosting,
};

// ============================================================
// Timesheet service — clock in / break / clock out, GPS distance
// checking, hours calculation and labour costing.
// ============================================================
const { Op, fn, col, literal } = require('sequelize');
const { Timesheet, Job, JobDayAssignment, User, Customer } = require('../models');
const { getSetting, todayStr, plain } = require('../db');
const geocode = require('../geocode');

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

async function jobCoords(jobId) {
  if (!jobId) return null;
  const row = await Job.findByPk(jobId, { attributes: ['id', 'address', 'lat', 'lng'] });
  if (!row) return null;
  return geocode.ensureJobSitePoint(row);
}

function parseOptionalCoord(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Requirement 9.2 — GPS is optional. Missing position flags no_location.
 * Far-from-site is warn-only and wins over no_location. Yard / travel has no site point.
 * @param {{ lat: number|null, lng: number|null, coords: { lat: number, lng: number }|null, radius: number, previous?: string|null }} opts
 */
function locationCapture({ lat, lng, coords, radius, previous = null }) {
  const keep = previous === 'far_from_site' || previous === 'over_max_hours' ? previous : null;
  const hasGps = lat != null && lng != null;
  if (!hasGps) {
    return { distance: null, flag: keep || 'no_location' };
  }
  if (!coords) return { distance: null, flag: keep };
  const distance = distanceMetres(lat, lng, coords.lat, coords.lng);
  if (distance != null && distance > radius) return { distance, flag: 'far_from_site' };
  return { distance, flag: keep };
}

function minutesBetween(start, end) {
  return (new Date(end) - new Date(start)) / 60000;
}

/** Read a stored timesheet number; `0` is valid and must not fall back. */
function timesheetNumber(cfg, key, fallback) {
  const n = Number(cfg?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

async function roundMinutes(mins) {
  const cfg = (await getSetting('timesheets')) || {};
  const step = Number(cfg.round_to_minutes) || 0;
  if (!step) return Math.max(0, Math.round(mins * 100) / 100);
  return Math.max(0, Math.round(mins / step) * step);
}

async function activeShift(userId) {
  const row = await Timesheet.findOne({
    where: { user_id: userId, status: 'active' },
    include: [{
      model: Job,
      attributes: ['title', 'address'],
      include: [{ model: Customer, attributes: ['name'] }],
    }],
  });
  if (!row) return null;
  const o = plain(row);
  o.job_title = o.Job?.title || null;
  o.job_address = o.Job?.address || null;
  o.customer_name = o.Job?.Customer?.name || null;
  delete o.Job;
  return o;
}

const ALREADY_CLOCKED_IN = 'You are already clocked in — clock out first';

/**
 * job_id is optional (yard / travel). A provided id must be a positive integer.
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseOptionalJobId(raw) {
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid job');
  return id;
}

/**
 * Requirement 9.1 — a picked job must have this user on that job's crew.
 * Match any work date: My Jobs lists the next two weeks, so staff clock in from
 * a job they are assigned to even when that day is not "today".
 */
async function assertAssignedToJob(userId, jobId) {
  const job = await Job.findByPk(jobId, { attributes: ['id'] });
  if (!job) throw new Error('Job not found');
  const assigned = await JobDayAssignment.findOne({
    where: { job_id: jobId, user_id: Number(userId) },
  });
  if (!assigned) throw new Error('You are not assigned to that job');
}

/**
 * Start a shift (requirement 9.1).
 * job_id is optional (yard / travel). If set, the user must be on that job's crew.
 * One open shift per person — a second clock-in is rejected until they clock out.
 */
async function clockIn(userId, { job_id = null, lat = null, lng = null, accuracy = null } = {}) {
  const cfg = (await getSetting('timesheets')) || {};
  if (cfg.enabled === false) throw new Error('Timesheets are turned off for this business');

  if (await activeShift(userId)) throw new Error(ALREADY_CLOCKED_IN);

  const jobId = parseOptionalJobId(job_id);
  if (jobId) await assertAssignedToJob(userId, jobId);

  const inLat = parseOptionalCoord(lat);
  const inLng = parseOptionalCoord(lng);
  const coords = await jobCoords(jobId);
  const captured = locationCapture({
    lat: inLat,
    lng: inLng,
    coords,
    radius: timesheetNumber(cfg, 'site_radius_m', 300),
  });

  try {
    const created = await Timesheet.create({
      user_id: userId,
      job_id: jobId,
      work_date: todayStr(),
      clock_in: new Date(),
      in_lat: inLat,
      in_lng: inLng,
      in_accuracy: parseOptionalCoord(accuracy),
      in_distance_m: captured.distance,
      location_flag: captured.flag,
      status: 'active',
    });
    return plain(created);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') throw new Error(ALREADY_CLOCKED_IN);
    throw err;
  }
}

async function startBreak(userId) {
  const shift = await activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');
  if (shift.break_started_at) throw new Error('You are already on a break');
  await Timesheet.update({ break_started_at: new Date() }, { where: { id: shift.id } });
  return activeShift(userId);
}

async function endBreak(userId) {
  const shift = await activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');
  if (!shift.break_started_at) throw new Error('You are not on a break');
  const mins = minutesBetween(shift.break_started_at, new Date());
  await Timesheet.increment({ break_minutes: Math.max(0, mins) }, { where: { id: shift.id } });
  await Timesheet.update({ break_started_at: null }, { where: { id: shift.id } });
  return activeShift(userId);
}

async function clockOut(userId, { lat = null, lng = null, accuracy = null, notes = null, photo_file = null } = {}) {
  const shift = await activeShift(userId);
  if (!shift) throw new Error('You are not clocked in');

  const cfg = (await getSetting('timesheets')) || {};
  const out = new Date();

  let breakMinutes = Number(shift.break_minutes) || 0;
  if (shift.break_started_at) breakMinutes += Math.max(0, minutesBetween(shift.break_started_at, out));

  let elapsed = minutesBetween(shift.clock_in, out);
  if (elapsed < 0) elapsed = 0;

  /** Breaks are a paid log (requirement 9.2) — they do not reduce worked minutes. */
  let worked = await roundMinutes(elapsed);

  const maxMins = timesheetNumber(cfg, 'max_shift_hours', 14) * 60;
  let flag = shift.location_flag;
  if (worked > maxMins) {
    worked = maxMins;
    flag = flag || 'over_max_hours';
  }

  const outLat = parseOptionalCoord(lat);
  const outLng = parseOptionalCoord(lng);
  const coords = await jobCoords(shift.job_id);
  const captured = locationCapture({
    lat: outLat,
    lng: outLng,
    coords,
    radius: timesheetNumber(cfg, 'site_radius_m', 300),
    previous: flag,
  });
  flag = captured.flag;

  const user = await User.findByPk(userId, { attributes: ['hourly_cost'] });
  const rate = Number(user?.hourly_cost) || 0;
  const cost = Math.round((worked / 60) * rate * 100) / 100;

  await Timesheet.update({
    clock_out: out,
    break_minutes: breakMinutes,
    break_started_at: null,
    out_lat: outLat,
    out_lng: outLng,
    out_accuracy: parseOptionalCoord(accuracy),
    out_distance_m: captured.distance,
    location_flag: flag,
    notes,
    photo_file,
    worked_minutes: worked,
    cost_rate: rate,
    labour_cost: cost,
    status: 'completed',
  }, { where: { id: shift.id } });

  return plain(await Timesheet.findByPk(shift.id));
}

async function myTimesheets(userId, from, to) {
  const rows = await Timesheet.findAll({
    where: {
      user_id: userId,
      work_date: { [Op.between]: [from, to] },
    },
    attributes: ['id', 'job_id', 'work_date', 'clock_in', 'clock_out', 'break_minutes', 'worked_minutes', 'status', 'notes', 'location_flag'],
    include: [{
      model: Job,
      attributes: ['title'],
      include: [{ model: Customer, attributes: ['name'] }],
    }],
    order: [['work_date', 'DESC'], ['clock_in', 'DESC']],
  });
  return rows.map((r) => {
    const o = plain(r);
    o.job_title = o.Job?.title || null;
    o.customer_name = o.Job?.Customer?.name || null;
    delete o.Job;
    return o;
  });
}

async function listTimesheets({ from, to, userId = null, jobId = null, status = null }) {
  const where = { work_date: { [Op.between]: [from, to] } };
  if (userId) where.user_id = userId;
  if (jobId) where.job_id = jobId;
  if (status) where.status = status;
  const rows = await Timesheet.findAll({
    where,
    include: [
      { model: User, attributes: ['name', 'color'] },
      { model: Job, attributes: ['title'], include: [{ model: Customer, attributes: ['name'] }] },
    ],
    order: [['work_date', 'DESC'], ['clock_in', 'DESC']],
  });
  return rows.map((r) => {
    const o = plain(r);
    o.user_name = o.User?.name;
    o.color = o.User?.color;
    o.job_title = o.Job?.title || null;
    o.customer_name = o.Job?.Customer?.name || null;
    delete o.User;
    delete o.Job;
    return o;
  });
}

async function weeklyTotals(from, to) {
  const staff = await User.findAll({
    where: { role: 'STAFF', active: true },
    attributes: ['id', 'name', 'color', 'hourly_cost'],
    include: [{
      model: Timesheet,
      required: false,
      where: { work_date: { [Op.between]: [from, to] } },
      attributes: ['worked_minutes', 'labour_cost', 'status', 'location_flag', 'id'],
    }],
    order: [['name', 'ASC']],
  });
  return staff.map((u) => {
    const sheets = u.Timesheets || [];
    const hours = sheets.reduce((s, t) => s + (Number(t.worked_minutes) || 0), 0) / 60;
    const cost = sheets.reduce((s, t) => s + (Number(t.labour_cost) || 0), 0);
    return {
      user_id: u.id,
      name: u.name,
      color: u.color,
      hourly_cost: u.hourly_cost,
      hours,
      cost,
      shifts: sheets.length,
      awaiting_approval: sheets.filter((t) => t.status === 'completed').length,
      flagged: sheets.filter((t) => t.location_flag).length,
    };
  });
}

/**
 * Job profitability — quoted value vs actual labour cost.
 */
async function jobCosting(jobId = null) {
  const where = jobId ? { id: jobId } : {};
  const jobs = await Job.findAll({
    where,
    include: [
      { model: Customer, attributes: ['name'] },
      {
        model: Timesheet,
        required: false,
        where: { status: { [Op.in]: ['completed', 'approved'] } },
        attributes: ['worked_minutes', 'labour_cost', 'id'],
      },
    ],
    order: [['start_date', 'DESC']],
  });
  return jobs.map((j) => {
    const sheets = j.Timesheets || [];
    const actual_hours = sheets.reduce((s, t) => s + (Number(t.worked_minutes) || 0), 0) / 60;
    const labour = sheets.reduce((s, t) => s + (Number(t.labour_cost) || 0), 0);
    const value = Number(j.value) || 0;
    const netValue = Math.round((value / 1.2) * 100) / 100;
    const margin = netValue ? Math.round(((netValue - labour) / netValue) * 1000) / 10 : null;
    return {
      id: j.id,
      title: j.title,
      status: j.status,
      quoted_value: j.value,
      start_date: j.start_date,
      customer_name: j.Customer?.name,
      actual_hours: Math.round(actual_hours * 100) / 100,
      actual_labour_cost: Math.round(labour * 100) / 100,
      shift_count: sheets.length,
      net_value: netValue,
      gross_profit: Math.round((netValue - labour) * 100) / 100,
      margin_percent: margin,
      underquoted: margin !== null && margin < 20,
    };
  });
}

function mapLiveActive(row) {
  const o = plain(row);
  o.user_name = o.User?.name || 'Unknown';
  o.color = o.User?.color || '#64748b';
  o.job_title = o.Job?.title || null;
  o.address = o.Job?.address || null;
  o.customer_name = o.Job?.Customer?.name || null;
  delete o.User;
  delete o.Job;
  return o;
}

/**
 * Office live board: everyone with an open shift, plus today's assigned
 * crew who have not clocked in. Yard / travel clock-ins count as on the clock.
 */
async function liveBoard() {
  const work_date = todayStr();
  const rows = await Timesheet.findAll({
    where: { status: 'active' },
    include: [
      { model: User, attributes: ['name', 'color'] },
      { model: Job, attributes: ['title', 'address'], include: [{ model: Customer, attributes: ['name'] }] },
    ],
    order: [['clock_in', 'ASC']],
  });
  const active = rows.map(mapLiveActive);
  const onClock = new Set(active.map((row) => row.user_id));

  const slots = await JobDayAssignment.findAll({
    where: { work_date },
    include: [
      { model: User, attributes: ['id', 'name', 'color', 'active'] },
      { model: Job, attributes: ['id', 'title'] },
    ],
    order: [['id', 'ASC']],
  });
  const missing = new Map();
  for (const slot of slots) {
    const o = plain(slot);
    const person = o.User;
    if (!person || person.active === false) continue;
    if (onClock.has(person.id)) continue;
    const entry = missing.get(person.id) || {
      user_id: person.id,
      user_name: person.name,
      color: person.color || '#64748b',
      jobs: [],
    };
    const title = o.Job?.title;
    if (title && !entry.jobs.includes(title)) entry.jobs.push(title);
    missing.set(person.id, entry);
  }

  return {
    work_date,
    active,
    not_clocked_in: [...missing.values()].sort((a, b) => String(a.user_name).localeCompare(String(b.user_name))),
  };
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * Office correction (requirement 9.4). Breaks stay a paid log — worked
 * minutes are clock-in → clock-out only, matching clock-out in 9.2.
 */
async function correctShift(id, body = {}) {
  const row = await Timesheet.findByPk(id);
  if (!row) fail(404, 'Timesheet not found');
  if (row.status === 'active') fail(400, 'That shift is still running — clock it out before editing');
  if (row.status !== 'completed' && row.status !== 'approved') {
    fail(400, 'Only completed or approved shifts can be edited');
  }
  const reason = String(body.edit_reason || '').trim();
  if (!reason) fail(400, 'A reason is required when editing someone\'s recorded hours');

  const newIn = body.clock_in || row.clock_in;
  const newOut = body.clock_out !== undefined ? body.clock_out : row.clock_out;
  if (!newOut) fail(400, 'Clock out is required');

  const newBreak = body.break_minutes !== undefined ? Number(body.break_minutes) : Number(row.break_minutes) || 0;
  if (!Number.isFinite(newBreak) || newBreak < 0) fail(400, 'Break minutes must be zero or more');

  let elapsed = minutesBetween(newIn, newOut);
  if (!Number.isFinite(elapsed)) fail(400, 'Invalid clock-in or clock-out time');
  if (elapsed < 0) elapsed = 0;
  const worked = await roundMinutes(elapsed);

  const rate = Number(row.cost_rate) || Number((await User.findByPk(row.user_id, { attributes: ['hourly_cost'] }))?.hourly_cost) || 0;
  const cost = Math.round((worked / 60) * rate * 100) / 100;

  await row.update({
    clock_in: newIn,
    clock_out: newOut,
    break_minutes: newBreak,
    notes: body.notes ?? row.notes,
    job_id: body.job_id !== undefined ? body.job_id : row.job_id,
    worked_minutes: worked,
    cost_rate: rate,
    labour_cost: cost,
    edit_reason: reason,
  });
  return { worked_minutes: worked, labour_cost: cost };
}

async function approveShift(id, actorId) {
  const row = await Timesheet.findByPk(id);
  if (!row) fail(404, 'Timesheet not found');
  if (row.status === 'active') fail(400, 'That shift is still running — it cannot be approved yet');
  if (row.status !== 'completed') fail(400, 'Only completed shifts can be approved');
  await row.update({ status: 'approved', approved_by: actorId, approved_at: new Date() });
  return { ok: true };
}

async function approveBatch(ids, actorId) {
  const list = Array.isArray(ids) ? ids : [];
  if (!list.length) fail(400, 'No timesheets selected');
  const [approved] = await Timesheet.update(
    { status: 'approved', approved_by: actorId, approved_at: new Date() },
    { where: { id: list, status: 'completed' } }
  );
  return { ok: true, approved };
}

async function rejectShift(id, actorId, reason) {
  const row = await Timesheet.findByPk(id);
  if (!row) fail(404, 'Timesheet not found');
  if (row.status !== 'completed') fail(400, 'Only completed shifts can be rejected');
  const why = String(reason || '').trim();
  if (!why) fail(400, 'A reason is required when rejecting a timesheet');
  await row.update({
    status: 'rejected',
    approved_by: actorId,
    approved_at: new Date(),
    edit_reason: why,
  });
  return { ok: true };
}

module.exports = {
  distanceMetres,
  locationCapture,
  activeShift,
  clockIn,
  parseOptionalJobId,
  startBreak,
  endBreak,
  clockOut,
  myTimesheets,
  listTimesheets,
  weeklyTotals,
  jobCosting,
  liveBoard,
  correctShift,
  approveShift,
  approveBatch,
  rejectShift,
};

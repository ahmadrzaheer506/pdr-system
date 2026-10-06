/**
 * Per-day crew slots (requirement 8.1). Replaces job-wide job_assignments.
 */
const { Op } = require('sequelize');
const { JobDayAssignment, User } = require('./models');
const { plain } = require('./db');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const text = String(raw).trim().slice(0, 10);
  return ISO_DATE.test(text) ? text : null;
}

/** Calendar day from a DATEONLY string or a Date at UTC midnight. */
function toIsoDate(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  return parseIsoDate(raw);
}

function addIsoDays(iso, n) {
  const [year, month, day] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + n));
  return dt.toISOString().slice(0, 10);
}

function datesInRange(start, end) {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end) || from;
  if (!from || !to || to < from) return [];
  const dates = [];
  for (let cur = from; cur <= to; cur = addIsoDays(cur, 1)) dates.push(cur);
  return dates;
}

function jobEndDate(job) {
  return parseIsoDate(job?.end_date) || parseIsoDate(job?.start_date);
}

function dateOnJob(job, workDate) {
  const start = parseIsoDate(job?.start_date);
  const end = jobEndDate(job);
  const day = parseIsoDate(workDate);
  if (!start || !end || !day) return false;
  return day >= start && day <= end;
}

/** Move a one-day job or expand a range so workDate is on the job. */
async function alignJobDatesToWorkDate(job, workDate, transaction) {
  const day = parseIsoDate(workDate);
  if (!day || dateOnJob(job, day)) return { moved: false };
  const start = parseIsoDate(job.start_date);
  const end = jobEndDate(job);
  const singleDay = !!(start && end && start === end);
  const nextStart = singleDay || !start || day < start ? day : start;
  const nextEnd = singleDay || !end || day > end ? day : end;
  if (typeof job.update === 'function') {
    await job.update({ start_date: nextStart, end_date: nextEnd }, { transaction });
  }
  job.start_date = nextStart;
  job.end_date = nextEnd;
  if (singleDay) await pruneOutsideRange(job.id, nextStart, nextEnd, transaction);
  return { moved: true, start_date: nextStart, end_date: nextEnd };
}

function parseUserIds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const ids = [];
  const seen = new Set();
  for (const value of list) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Unique ISO days from work_date and/or work_dates (multi-day Place / save). */
function parseAssignmentDays(body) {
  const values = [];
  if (Array.isArray(body?.work_dates)) values.push(...body.work_dates);
  if (body?.work_date != null) values.push(body.work_date);
  const days = [];
  const seen = new Set();
  for (const raw of values) {
    const day = parseIsoDate(raw);
    if (!day || seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }
  return days.sort();
}

function mapSlot(row) {
  const o = plain(row);
  const user = o.User || {};
  return {
    id: o.id,
    job_id: o.job_id,
    work_date: toIsoDate(o.work_date) || o.work_date,
    user_id: o.user_id,
    name: user.name || null,
    color: user.color || null,
    is_driver: !!user.is_driver,
    skills: Array.isArray(user.skills) ? user.skills : [],
  };
}

const userInclude = {
  model: User,
  attributes: ['id', 'name', 'color', 'is_driver', 'skills'],
};

async function listDayAssignments(jobId) {
  const rows = await JobDayAssignment.findAll({
    where: { job_id: jobId },
    include: [userInclude],
    order: [['work_date', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapSlot);
}

async function listDayAssignmentsForJobs(jobIds) {
  if (!jobIds.length) return [];
  const rows = await JobDayAssignment.findAll({
    where: { job_id: jobIds },
    include: [userInclude],
    order: [['work_date', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapSlot);
}

async function attachDayAssignments(jobJson) {
  return { ...jobJson, day_assignments: await listDayAssignments(jobJson.id) };
}

async function attachDayAssignmentsMany(jobs) {
  const slots = await listDayAssignmentsForJobs(jobs.map((j) => j.id));
  const byJob = {};
  for (const slot of slots) (byJob[slot.job_id] ||= []).push(slot);
  return jobs.map((job) => ({ ...job, day_assignments: byJob[job.id] || [] }));
}

function uniqueCrewNames(slots) {
  const names = [];
  const seen = new Set();
  for (const slot of slots || []) {
    if (!slot.name || seen.has(slot.user_id)) continue;
    seen.add(slot.user_id);
    names.push(slot.name);
  }
  return names;
}

function crewForDate(slots, workDate) {
  const day = parseIsoDate(workDate);
  return (slots || []).filter((s) => parseIsoDate(s.work_date) === day);
}

/**
 * Jobs whose start–end range overlaps [from, to].
 * @param {string|undefined} from
 * @param {string|undefined} to
 */
function overlapWhere(from, to) {
  const startBound = parseIsoDate(from) || parseIsoDate(to);
  const endBound = parseIsoDate(to) || parseIsoDate(from);
  if (!startBound || !endBound) return {};
  return {
    start_date: { [Op.ne]: null, [Op.lte]: endBound },
    [Op.or]: [
      { end_date: { [Op.gte]: startBound } },
      { end_date: null, start_date: { [Op.gte]: startBound } },
    ],
  };
}

async function pruneOutsideRange(jobId, start, end, transaction) {
  const keep = datesInRange(start, end);
  const where = { job_id: jobId };
  if (keep.length) where.work_date = { [Op.notIn]: keep };
  await JobDayAssignment.destroy({ where, transaction });
}

async function setDayCrew(job, workDate, userIds, transaction) {
  if (!parseIsoDate(job?.start_date)) {
    return { error: 'Place this job on the schedule before assigning crew', status: 400 };
  }
  const day = parseIsoDate(workDate);
  if (!day) return { error: 'Date is required', status: 400 };
  if (!dateOnJob(job, day)) {
    await alignJobDatesToWorkDate(job, day, transaction);
  }
  if (!dateOnJob(job, day)) return { error: 'Date is not on this job', status: 400 };
  const ids = parseUserIds(userIds);
  const existing = await JobDayAssignment.findAll({
    where: { job_id: job.id, work_date: day },
    attributes: ['user_id'],
    transaction,
  });
  const previous_user_ids = parseUserIds(existing.map((row) => row.user_id));
  await JobDayAssignment.destroy({ where: { job_id: job.id, work_date: day }, transaction });
  for (const uid of ids) {
    await JobDayAssignment.findOrCreate({
      where: { job_id: job.id, work_date: day, user_id: uid },
      transaction,
    });
  }
  return { ok: true, work_date: day, user_ids: ids, previous_user_ids };
}

async function userAssignedToJob(jobId, userId) {
  const row = await JobDayAssignment.findOne({ where: { job_id: jobId, user_id: Number(userId) } });
  return !!row;
}

async function userAssignedOnDate(jobId, userId, workDate) {
  const day = parseIsoDate(workDate);
  if (!day) return false;
  const row = await JobDayAssignment.findOne({
    where: { job_id: jobId, user_id: userId, work_date: day },
  });
  return !!row;
}

function validateJobDates(startRaw, endRaw) {
  const start = parseIsoDate(startRaw);
  if (startRaw !== undefined && startRaw !== null && startRaw !== '' && !start) {
    return { error: 'Invalid start date', status: 400 };
  }
  const end = parseIsoDate(endRaw);
  if (endRaw !== undefined && endRaw !== null && endRaw !== '' && !end) {
    return { error: 'Invalid end date', status: 400 };
  }
  if (start && end && end < start) {
    return { error: 'End date cannot be before the start date', status: 400 };
  }
  return { start, end };
}

function sendResult(res, result) {
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
}

/**
 * Crew slots grouped by work date so unscheduling can notify then wipe.
 * @returns {Promise<Map<string, number[]>>}
 */
async function listCrewByDate(jobId, transaction) {
  const rows = await JobDayAssignment.findAll({
    where: { job_id: jobId },
    attributes: ['work_date', 'user_id'],
    transaction,
  });
  const byDate = new Map();
  for (const row of rows) {
    const day = toIsoDate(row.work_date);
    if (!day) continue;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push(row.user_id);
  }
  return byDate;
}

async function clearAllCrew(jobId, transaction) {
  await JobDayAssignment.destroy({ where: { job_id: jobId }, transaction });
}

module.exports = {
  parseIsoDate,
  toIsoDate,
  addIsoDays,
  datesInRange,
  dateOnJob,
  parseUserIds,
  parseAssignmentDays,
  listDayAssignments,
  attachDayAssignments,
  attachDayAssignmentsMany,
  uniqueCrewNames,
  crewForDate,
  overlapWhere,
  pruneOutsideRange,
  setDayCrew,
  listCrewByDate,
  clearAllCrew,
  userAssignedToJob,
  userAssignedOnDate,
  validateJobDates,
  sendResult,
};

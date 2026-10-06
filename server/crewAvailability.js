/**
 * Crew availability overlays (requirement 8.2). Holiday and already-booked
 * crew need office confirmation on save. Skill / driver stay warn-only.
 * Pending holiday requests are ignored for overlays and assignment.
 */
const { Op } = require('sequelize');
const { HolidayRequest, JobDayAssignment, Job, User } = require('./models');
const { parseIsoDate, parseUserIds } = require('./jobDays');
const { JOB_STATUSES } = require('./jobStatus');

/** Any dated job on the board occupies crew — same rule as week-view “Already booked”. */
const BUSY_JOB_STATUSES = [...JOB_STATUSES];

function asIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return parseIsoDate(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return parseIsoDate(String(value));
}

function displayName(user, fallbackId) {
  return (user && user.name) || `User ${fallbackId}`;
}

/**
 * Approved holidays and live job bookings in [from, to].
 * @param {string} from
 * @param {string} to
 */
async function overlay(from, to) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to) || start;
  if (!start) return { error: 'from date is required', status: 400 };
  if (!end || end < start) return { error: 'Invalid date range', status: 400 };

  const holidayRows = await HolidayRequest.findAll({
    attributes: ['id', 'user_id', 'start_date', 'end_date'],
    where: {
      status: 'approved',
      start_date: { [Op.lte]: end },
      end_date: { [Op.gte]: start },
    },
    include: [{ model: User, attributes: ['name'] }],
  });

  const slotRows = await JobDayAssignment.findAll({
    where: { work_date: { [Op.between]: [start, end] } },
    include: [
      { model: User, attributes: ['id', 'name'] },
      {
        model: Job,
        attributes: ['id', 'title', 'status'],
        required: true,
        where: { status: { [Op.in]: BUSY_JOB_STATUSES } },
      },
    ],
  });

  return {
    from: start,
    to: end,
    holidays: holidayRows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user_name: row.User?.name || null,
      start_date: asIsoDate(row.start_date),
      end_date: asIsoDate(row.end_date),
    })),
    bookings: slotRows.map((row) => ({
      user_id: row.user_id,
      name: row.User?.name || null,
      job_id: row.job_id,
      job_title: row.Job?.title || null,
      work_date: asIsoDate(row.work_date),
    })),
  };
}

function teamSkills(users) {
  const have = new Set();
  for (const user of users || []) {
    const list = Array.isArray(user.skills) ? user.skills : [];
    for (const skill of list) have.add(skill);
  }
  return have;
}

/**
 * Who on this date has approved holiday (used for confirm-before-save).
 * @returns {{ user_id: number, message: string }[]}
 */
async function holidayBlockers(workDate, userIds) {
  const day = parseIsoDate(workDate);
  const ids = parseUserIds(userIds);
  if (!day || !ids.length) return [];

  const holidayRows = await HolidayRequest.findAll({
    attributes: ['user_id'],
    where: {
      status: 'approved',
      user_id: ids,
      start_date: { [Op.lte]: day },
      end_date: { [Op.gte]: day },
    },
  });
  if (!holidayRows.length) return [];

  const blockedIds = [...new Set(holidayRows.map((row) => row.user_id))];
  const users = await User.findAll({
    where: { id: blockedIds },
    attributes: ['id', 'name'],
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return blockedIds.map((uid) => ({
    user_id: uid,
    type: 'holiday',
    name: displayName({ name: nameById.get(uid) }, uid),
    message: `${displayName({ name: nameById.get(uid) }, uid)} is on approved holiday that day`,
    work_date: day,
  }));
}

/**
 * Holiday and other-job conflicts that need office confirmation before save.
 */
async function assignmentConflicts(job, workDate, userIds) {
  const day = parseIsoDate(workDate);
  const ids = parseUserIds(userIds);
  if (!day || !job?.id || !ids.length) return [];

  const holidayRows = await holidayBlockers(workDate, ids);
  const warnings = await assignmentWarnings(job, workDate, ids);
  return [
    ...holidayRows,
    ...warnings.filter((row) => row.type === 'double_book'),
  ];
}

/**
 * Warnings for a crew save. Missing skills and missing driver do not block.
 * Holiday and double-book need confirmation via assignmentConflicts.
 */
async function assignmentWarnings(job, workDate, userIds) {
  const day = parseIsoDate(workDate);
  const ids = parseUserIds(userIds);
  if (!day || !job?.id) return [];

  const users = ids.length
    ? await User.findAll({
      where: { id: ids },
      attributes: ['id', 'name', 'skills', 'is_driver'],
    })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  let slotRows = [];
  if (ids.length) {
    slotRows = await JobDayAssignment.findAll({
      where: {
        work_date: day,
        user_id: ids,
        job_id: { [Op.ne]: job.id },
      },
      include: [{
        model: Job,
        attributes: ['id', 'title', 'status'],
        required: true,
        where: { status: { [Op.in]: BUSY_JOB_STATUSES } },
      }],
    });
  }

  const warnings = [];
  for (const uid of ids) {
    const name = displayName({ name: nameById.get(uid) }, uid);
    for (const slot of slotRows.filter((row) => row.user_id === uid)) {
      const title = slot.Job?.title || 'another job';
      warnings.push({
        user_id: uid,
        type: 'double_book',
        job_id: slot.job_id,
        job_title: title === 'another job' ? null : title,
        name,
        message: `${name} is already booked on "${title}"`,
        work_date: day,
      });
    }
  }

  const required = Array.isArray(job.required_skills) ? job.required_skills : [];
  const covered = teamSkills(users);
  for (const skill of required) {
    if (!covered.has(skill)) {
      warnings.push({
        type: 'skill',
        skill,
        message: `Nobody on this day's crew has required skill "${skill}"`,
      });
    }
  }
  if (job.needs_driver && !users.some((u) => u.is_driver)) {
    warnings.push({
      type: 'driver',
      message: 'This job needs a driver and nobody assigned can drive',
    });
  }
  return warnings;
}

module.exports = {
  BUSY_JOB_STATUSES,
  overlay,
  holidayBlockers,
  assignmentConflicts,
  assignmentWarnings,
};

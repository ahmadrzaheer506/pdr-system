/**
 * Operative holiday requests (10.1), office approve / decline (10.2),
 * and calendar-year allowance tracking (10.3).
 */
const { Op } = require('sequelize');
const { HolidayRequest, User } = require('./models');
const { getSetting } = require('./db');
const { ROLES } = require('./roles');

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function noticeDaysUntil(date) {
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(date) - today) / 86400000);
}

function parseIsoDate(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function fail(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  throw err;
}

function isoDay(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const text = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return isoDay(String(value));
}

function currentYear() {
  return new Date(new Date().toDateString()).getFullYear();
}

function allowanceOf(user) {
  const n = Number(user?.holiday_allowance);
  return Number.isFinite(n) ? n : 28;
}

/**
 * Inclusive days of [start, end] that fall in a calendar year (requirement 10.3).
 * A request that crosses 1 Jan is clipped to each year.
 */
function daysInYear(start, end, year) {
  const from = isoDay(start);
  const to = isoDay(end);
  if (!from || !to || to < from) return 0;
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const clipFrom = from > yStart ? from : yStart;
  const clipTo = to < yEnd ? to : yEnd;
  if (clipTo < clipFrom) return 0;
  return daysBetween(clipFrom, clipTo);
}

function yearsTouched(start, end) {
  const from = isoDay(start);
  const to = isoDay(end);
  if (!from || !to) return [];
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  const years = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years;
}

function kindFromDates(start, end) {
  const from = isoDay(start);
  const to = isoDay(end);
  if (!from) return 'single';
  return from === to ? 'single' : 'multi';
}

function parseKind(raw, start, end) {
  if (raw == null || raw === '') {
    if (!end) return 'single';
    return kindFromDates(start, end);
  }
  const kind = String(raw).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (kind === 'single' || kind === 'single_day') return 'single';
  if (kind === 'multi' || kind === 'multi_day') return 'multi';
  fail(400, 'Holiday type must be single day or multi day');
}

/**
 * Create a holiday request.
 * Field staff submit pending (10.1 notice + 10.2 approval).
 * Office / Admin dashboard bookings skip notice and are approved immediately.
 * kind: single (one date) or multi (inclusive from–to, at least two days).
 */
async function createRequest(actor, { start_date, end_date, reason, user_id, kind: rawKind } = {}) {
  const start = parseIsoDate(start_date);
  if (!start) fail(400, 'start_date is required');
  if (start < todayIso()) fail(400, 'Cannot book a date in the past');
  const kind = parseKind(rawKind, start, parseIsoDate(end_date));
  let end = parseIsoDate(end_date);
  if (kind === 'single') {
    end = start;
  } else {
    if (!end) fail(400, 'end_date is required for a multi-day holiday');
    if (end === start) fail(400, 'A multi-day holiday needs a later end date');
    if (end < start) fail(400, 'End date cannot be before the start date');
  }

  const forSelf = actor.role === ROLES.STAFF;
  const targetId = forSelf ? actor.id : Number(user_id);
  if (!forSelf && (!Number.isInteger(targetId) || targetId <= 0)) {
    fail(400, 'Pick a staff member');
  }

  const exists = await User.findOne({
    where: { id: forSelf ? actor.id : targetId, active: true },
    attributes: ['id', 'role', 'active', 'holiday_allowance', 'name'],
  });
  if (!exists) fail(400, 'That staff member does not exist or is inactive');
  if (exists.role !== ROLES.STAFF) fail(400, 'Holiday requests are for field staff');

  if (forSelf) {
    const rawNotice = Number(await getSetting('holiday_notice_days'));
    const noticeDays = Number.isFinite(rawNotice) ? rawNotice : 28;
    const notice = noticeDaysUntil(start);
    if (notice < noticeDays) {
      fail(400, `Requires ${noticeDays} days' notice — this date is only ${Math.max(notice, 0)} days away`, { notice_days: noticeDays });
    }
  }

  const clash = await HolidayRequest.findOne({
    where: overlapWhere(exists.id, start, end),
  });
  if (clash) fail(400, 'Those dates overlap an existing pending or approved request');

  await assertAllowance(exists, start, end);

  const autoApprove = actor.role === ROLES.ADMIN || actor.role === ROLES.OFFICE;
  const created = await HolidayRequest.create({
    user_id: exists.id,
    start_date: start,
    end_date: end,
    days: daysBetween(start, end),
    reason: reason ? String(reason).trim() || null : null,
    status: autoApprove ? 'approved' : 'pending',
    decided_by: autoApprove ? actor.id : null,
    decided_at: autoApprove ? new Date() : null,
  });
  const staffName = exists.name || 'A crew member';
  const range = kind === 'single' ? start : `${start} to ${end}`;
  if (autoApprove) {
    await notifyHolidayDecision(created, 'approved');
  } else {
    const { safeNotify, notifyOffice } = require('./notifications');
    await safeNotify(() => notifyOffice({
      kind: 'holiday_submitted',
      message: `${staffName} requested ${range} (${created.days} day${created.days === 1 ? '' : 's'})`,
      entity_type: 'holiday',
      entity_id: created.id,
    }));
  }
  return { id: created.id, days: created.days, kind, status: created.status };
}

function overlapWhere(userId, start, end, excludeId) {
  const where = {
    user_id: userId,
    status: { [Op.in]: ['pending', 'approved'] },
    start_date: { [Op.lte]: end },
    end_date: { [Op.gte]: start },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return where;
}

async function usedDaysInYear(userId, year, excludeId) {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const rows = await HolidayRequest.findAll({
    where: overlapWhere(userId, yStart, yEnd, excludeId),
    attributes: ['start_date', 'end_date'],
  });
  return rows.reduce((sum, row) => sum + daysInYear(row.start_date, row.end_date, year), 0);
}

/**
 * Pending + approved days in each calendar year the range touches cannot exceed
 * holiday_allowance. excludeId skips this row (approve of an existing pending).
 */
async function assertAllowance(user, start, end, excludeId) {
  const allowance = allowanceOf(user);
  for (const year of yearsTouched(start, end)) {
    const used = await usedDaysInYear(user.id, year, excludeId);
    const add = daysInYear(start, end, year);
    if (used + add > allowance) {
      const remaining = Math.max(allowance - used, 0);
      fail(400, `Only ${remaining} of ${allowance} days left in ${year} — this request needs ${add}`, {
        remaining, allowance, year,
      });
    }
  }
}

async function balanceForUser(user, year = currentYear()) {
  const allowance = allowanceOf(user);
  const used = await usedDaysInYear(user.id, year);
  return { year, allowance, used, remaining: Math.max(allowance - used, 0) };
}

async function balancesForUsers(users, year = currentYear()) {
  const unique = [];
  const seen = new Set();
  for (const user of users || []) {
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    unique.push(user);
  }
  const out = {};
  await Promise.all(unique.map(async (user) => {
    out[user.id] = await balanceForUser(user, year);
  }));
  return out;
}

async function notifyHolidayDecision(row, decision, reason) {
  const { safeNotify, notifyUsers } = require('./notifications');
  const start = isoDay(row.start_date);
  const end = isoDay(row.end_date);
  const kind = decision === 'approved' ? 'holiday_approved' : 'holiday_declined';
  const message = decision === 'approved'
    ? `Your holiday ${start} to ${end} was approved`
    : `Your holiday ${start} to ${end} was declined${reason ? ` — ${reason}` : ''}`;
  await safeNotify(() => notifyUsers([row.user_id], {
    kind,
    message,
    entity_type: 'holiday',
    entity_id: row.id,
  }));
}

/**
 * Office / Admin decide a request (requirement 10.2).
 * Pending → approved | declined; approved → declined; declined → approved.
 * Decline always needs a non-empty reason. Approve clears any prior decline_reason.
 * Approving re-checks 10.1 overlap against other pending / approved rows.
 */
async function decideRequest(actor, id, { decision, decline_reason } = {}) {
  if (![ROLES.ADMIN, ROLES.OFFICE].includes(actor.role)) {
    fail(403, 'Not permitted');
  }
  if (!['approved', 'declined'].includes(decision)) {
    fail(400, 'decision must be approved or declined');
  }

  const row = await HolidayRequest.findByPk(id);
  if (!row) fail(404, 'Request not found');
  if (row.status === decision) fail(400, `This request is already ${decision}`);

  const allowed = {
    pending: ['approved', 'declined'],
    approved: ['declined'],
    declined: ['approved'],
  };
  if (!(allowed[row.status] || []).includes(decision)) {
    fail(400, 'That decision is not allowed from the current status');
  }

  if (decision === 'declined') {
    const reason = decline_reason != null ? String(decline_reason).trim() : '';
    if (!reason) fail(400, 'A reason is required to decline');
    await row.update({
      status: 'declined',
      decided_by: actor.id,
      decided_at: new Date(),
      decline_reason: reason,
    });
    await notifyHolidayDecision(row, 'declined', reason);
    return { ok: true, status: 'declined' };
  }

  const clash = await HolidayRequest.findOne({
    where: overlapWhere(row.user_id, row.start_date, row.end_date, row.id),
  });
  if (clash) fail(400, 'Those dates overlap an existing pending or approved request');

  const holder = await User.findByPk(row.user_id, { attributes: ['id', 'holiday_allowance'] });
  if (!holder) fail(400, 'That staff member does not exist or is inactive');
  await assertAllowance(holder, isoDay(row.start_date), isoDay(row.end_date), row.id);

  await row.update({
    status: 'approved',
    decided_by: actor.id,
    decided_at: new Date(),
    decline_reason: null,
  });
  await notifyHolidayDecision(row, 'approved');
  return { ok: true, status: 'approved' };
}

/**
 * Staff withdraw their own pending request; office / admin may withdraw any pending.
 */
async function withdrawRequest(actor, id) {
  const row = await HolidayRequest.findByPk(id);
  if (!row) fail(404, 'Request not found');
  if (actor.role === ROLES.STAFF && row.user_id !== actor.id) fail(403, 'Not permitted');
  if (row.status !== 'pending') fail(400, 'Only pending requests can be withdrawn');
  await row.destroy();
  return { ok: true };
}

module.exports = {
  daysBetween,
  daysInYear,
  noticeDaysUntil,
  parseIsoDate,
  kindFromDates,
  currentYear,
  createRequest,
  decideRequest,
  withdrawRequest,
  balanceForUser,
  balancesForUsers,
};

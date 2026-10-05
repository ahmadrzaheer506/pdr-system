'use strict';

/**
 * In-app notification centre (requirement 13.1) plus per-user opt-in (13.2).
 * Email goes only to field staff on crew add/remove, and only when they opt in.
 * Office events stay in-app. Unread badge is the 13.1 count (no extra endpoint).
 */
const { Op } = require('sequelize');
const { Notification, User } = require('./models');
const { todayStr } = require('./db');
const { ROLES } = require('./roles');
const email = require('./integrations/email');
const { EMAIL_KINDS, wantsInApp, wantsEmail } = require('./notificationPrefs');

const KINDS = Object.freeze([
  'crew_added',
  'crew_removed',
  'new_enquiry',
  'quote_accepted',
  'visit_booked',
  'invoice_overdue',
  'task_reminder',
  'holiday_submitted',
  'holiday_approved',
  'holiday_declined',
]);

const KIND_TITLES = Object.freeze({
  crew_added: 'Assigned to a job',
  crew_removed: 'Taken off a job',
  new_enquiry: 'New enquiry',
  quote_accepted: 'Quote accepted',
  visit_booked: 'Site visit booked',
  invoice_overdue: 'Invoice overdue',
  task_reminder: 'Task reminder',
  holiday_submitted: 'Holiday request',
  holiday_approved: 'Holiday approved',
  holiday_declined: 'Holiday declined',
});

function titleFor(kind) {
  return KIND_TITLES[kind] || 'Notification';
}

/**
 * @param {string} role
 * @param {{ kind: string, job_id?: number, entity_type?: string, entity_id?: number, work_date?: string }} row
 */
function hrefFor(row, role) {
  const staff = role === ROLES.STAFF;
  switch (row.kind) {
    case 'crew_added':
    case 'crew_removed':
      return staff && row.job_id ? `/staff/jobs/${row.job_id}` : '/schedule';
    case 'new_enquiry':
      return '/inbox';
    case 'quote_accepted':
      return row.entity_type === 'customer' && row.entity_id
        ? `/leads/${row.entity_id}`
        : '/customers';
    case 'visit_booked':
      if (staff && row.entity_type === 'appointment' && row.entity_id) {
        return `/staff/visits/${row.entity_id}`;
      }
      return row.entity_type === 'customer' && row.entity_id
        ? `/leads/${row.entity_id}`
        : '/customers';
    case 'invoice_overdue':
      return '/invoices';
    case 'task_reminder': {
      if (row.entity_id == null) return staff ? '/staff/tasks' : '/tasks';
      const today = todayStr();
      const day = row.work_date ? String(row.work_date).slice(0, 10) : '';
      let when = 'ALL';
      if (day && day < today) when = 'overdue';
      else if (day && day === today) when = 'today';
      else if (day) when = 'due';
      const params = new URLSearchParams();
      if (when !== 'ALL') params.set('when', when);
      params.set('task', String(row.entity_id));
      return `${staff ? '/staff/tasks' : '/tasks'}?${params.toString()}`;
    }
    case 'holiday_submitted':
      return '/holidays';
    case 'holiday_approved':
    case 'holiday_declined':
      return '/staff/holidays';
    default:
      return null;
  }
}

function serialize(row, role) {
  const o = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
  return {
    id: o.id,
    kind: o.kind,
    title: titleFor(o.kind),
    message: o.message,
    job_id: o.job_id || null,
    work_date: o.work_date || null,
    entity_type: o.entity_type || null,
    entity_id: o.entity_id || null,
    read_at: o.read_at || null,
    created_at: o.created_at,
    href: hrefFor(o, role),
  };
}

async function officeUserIds({ excludeId } = {}) {
  const rows = await User.findAll({
    where: { active: true, role: { [Op.in]: [ROLES.ADMIN, ROLES.OFFICE] } },
    attributes: ['id'],
  });
  return rows.map((r) => r.id).filter((id) => id !== excludeId);
}

async function emailCrewRows(rows, byId) {
  try {
    const crew = rows.filter((r) => EMAIL_KINDS.includes(r.kind));
    if (!crew.length) return;
    await Promise.all(crew.map(async (row) => {
      const user = byId[row.user_id];
      if (!user || !user.email || !wantsEmail(user.notification_prefs, row.kind, user.role)) return;
      try {
        await email.send(user.email, titleFor(row.kind), row.message);
      } catch (err) {
        console.error('[notify] crew email failed', err.message);
      }
    }));
  } catch (err) {
    console.error('[notify] crew email failed', err.message);
  }
}

/**
 * @param {Array<{ user_id: number, kind: string, message: string, job_id?: number, work_date?: string, entity_type?: string, entity_id?: number }>} rows
 * @param {{ transaction?: import('sequelize').Transaction, dedupe?: boolean }} [opts]
 */
async function createNotifications(rows, { transaction, dedupe = false } = {}) {
  const prepared = [];
  for (const row of rows || []) {
    if (!KINDS.includes(row.kind) || !row.user_id || !row.message) continue;
    prepared.push({
      user_id: row.user_id,
      kind: row.kind,
      message: row.message,
      job_id: row.job_id || null,
      work_date: row.work_date || null,
      entity_type: row.entity_type || null,
      entity_id: row.entity_id || null,
    });
  }
  if (!prepared.length) return [];

  const users = await User.findAll({
    where: { id: { [Op.in]: [...new Set(prepared.map((r) => r.user_id))] } },
    attributes: ['id', 'email', 'role', 'name', 'notification_prefs'],
    transaction,
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  const optedIn = prepared.filter((row) => {
    const user = byId[row.user_id];
    return user && wantsInApp(user.notification_prefs, row.kind, user.role);
  });

  let toCreate = optedIn;
  if (dedupe) {
    toCreate = [];
    for (const row of optedIn) {
      if (row.entity_id == null || !row.entity_type) {
        toCreate.push(row);
        continue;
      }
      const existing = await Notification.findOne({
        where: {
          user_id: row.user_id,
          kind: row.kind,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
        },
        transaction,
      });
      if (!existing) toCreate.push(row);
    }
  }
  if (toCreate.length) await Notification.bulkCreate(toCreate, { transaction });
  await emailCrewRows(prepared, byId);
  return toCreate;
}

async function notifyUsers(userIds, fields, opts = {}) {
  const ids = [...new Set((userIds || []).filter((id) => Number.isInteger(id) && id > 0))];
  return createNotifications(ids.map((user_id) => ({ ...fields, user_id })), opts);
}

async function notifyOffice(fields, { excludeId, ...opts } = {}) {
  const ids = await officeUserIds({ excludeId });
  return notifyUsers(ids, fields, opts);
}

async function safeNotify(work) {
  try {
    return await work();
  } catch (err) {
    console.error('[notify]', err.message);
    return [];
  }
}

module.exports = {
  KINDS,
  KIND_TITLES,
  EMAIL_KINDS,
  titleFor,
  hrefFor,
  serialize,
  officeUserIds,
  createNotifications,
  notifyUsers,
  notifyOffice,
  safeNotify,
};

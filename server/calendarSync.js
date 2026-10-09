'use strict';

/**
 * Requirement 16.3 — push CRM events onto each connected user's Google Calendar.
 * Admin and office see the full CRM set; field staff see assigned visits/jobs,
 * their own holidays, and tasks assigned to them. Unconnected users are skipped.
 */
const { Op } = require('sequelize');
const {
  User, Appointment, AppointmentAssignee, Job, JobDayAssignment,
  HolidayRequest, Task, TaskAssignee, CalendarSyncLink, OauthToken, Customer,
  Lead, Quote,
} = require('./models');
const { ROLES } = require('./roles');
const gcal = require('./integrations/gcal');
const { addCalendarDays, ymdInZone, zonedWallTime, partsInZone } = require('./ukTime');
const {
  GCAL_COLOR, formatTimeRange, formatTimeRangeFromHhmm, formatDayRange, prettyStatus,
  eventTitle, eventDescription, appointmentTypeLabel, joinNames,
} = require('./gcalEventFormat');

const ENTITY = Object.freeze({
  APPOINTMENT: 'appointment',
  JOB: 'job',
  HOLIDAY: 'holiday',
  TASK: 'task',
});

async function connectedUserIds() {
  const rows = await OauthToken.findAll({
    where: { provider: 'google', user_id: { [Op.ne]: null } },
    attributes: ['user_id'],
  });
  return [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
}

async function officeAudienceIds() {
  const rows = await User.findAll({
    where: { active: true, role: { [Op.in]: [ROLES.ADMIN, ROLES.OFFICE] } },
    attributes: ['id'],
  });
  return rows.map((row) => row.id);
}

function mergeIds(...lists) {
  const ids = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      const n = Number(id);
      if (Number.isInteger(n) && n > 0) ids.add(n);
    }
  }
  return [...ids];
}

async function audienceForAppointment(appt) {
  const assignees = await AppointmentAssignee.findAll({
    where: { appointment_id: appt.id },
    attributes: ['user_id'],
  });
  return mergeIds(
    await officeAudienceIds(),
    [appt.created_by],
    assignees.map((row) => row.user_id),
  );
}

async function audienceForJob(job) {
  const crew = await JobDayAssignment.findAll({
    where: { job_id: job.id },
    attributes: ['user_id'],
  });
  return mergeIds(await officeAudienceIds(), crew.map((row) => row.user_id));
}

async function audienceForHoliday(row) {
  return mergeIds(await officeAudienceIds(), [row.user_id]);
}

async function audienceForTask(task) {
  const assignees = await TaskAssignee.findAll({
    where: { task_id: task.id },
    attributes: ['user_id'],
  });
  return mergeIds(
    await officeAudienceIds(),
    [task.assignee_id],
    assignees.map((row) => row.user_id),
  );
}

function isoDay(value) {
  if (!value) return null;
  if (value instanceof Date) return ymdInZone(value);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function exclusiveEnd(startDate, endDate) {
  const last = endDate && endDate >= startDate ? endDate : startDate;
  return addCalendarDays(last, 1);
}

async function appointmentPayload(appt) {
  const customer = appt.Customer || (appt.customer_id
    ? await Customer.findByPk(appt.customer_id, { attributes: ['name'] })
    : null);
  const lead = appt.Lead || (appt.lead_id
    ? await Lead.findByPk(appt.lead_id, { attributes: ['ref'] })
    : null);
  const assigneeRows = await AppointmentAssignee.findAll({
    where: { appointment_id: appt.id },
    include: [{ model: User, attributes: ['name'] }],
  });
  const booker = appt.creator || (appt.created_by
    ? await User.findByPk(appt.created_by, { attributes: ['name'] })
    : null);
  const type = appointmentTypeLabel(appt.visit_type);
  const time = formatTimeRange(appt.start, appt.end);
  const reference = lead?.ref || `VISIT-${appt.id}`;
  const customerName = customer?.name || null;
  const startDate = isoDay(appt.start);
  const endDate = isoDay(appt.end) || startDate;
  if (!startDate) return null;
  return {
    title: eventTitle({ timeRange: time, typeLabel: type, reference: customerName || reference }),
    allDay: true,
    startDate,
    endDateExclusive: exclusiveEnd(startDate, endDate),
    address: appt.address || null,
    colorId: GCAL_COLOR.appointment,
    notes: eventDescription({
      time,
      type,
      status: prettyStatus(appt.status) || 'Booked',
      reference,
      customer: customerName,
      assignees: joinNames(assigneeRows.map((row) => row.User?.name)),
      location: appt.address,
      notes: [appt.complete_note, appt.notes].filter(Boolean).join('\n'),
      bookedBy: booker?.name,
    }),
  };
}

async function jobPayload(job) {
  const startDate = isoDay(job.start_date);
  if (!startDate) return null;
  const endDate = isoDay(job.end_date) || startDate;
  const customer = job.Customer || (job.customer_id
    ? await Customer.findByPk(job.customer_id, { attributes: ['name'] })
    : null);
  const quote = job.Quote || (job.quote_id
    ? await Quote.findByPk(job.quote_id, { attributes: ['ref'] })
    : null);
  const crewRows = await JobDayAssignment.findAll({
    where: { job_id: job.id },
    include: [{ model: User, attributes: ['name'] }],
  });
  const time = formatTimeRangeFromHhmm(job.start_time || '08:00', job.end_time || '16:30');
  const reference = quote?.ref || `JOB-${job.id}`;
  return {
    title: eventTitle({ timeRange: time, typeLabel: 'Job', reference: job.title }),
    allDay: true,
    startDate,
    endDateExclusive: exclusiveEnd(startDate, endDate),
    address: job.address || null,
    colorId: GCAL_COLOR.job,
    notes: eventDescription({
      time,
      type: 'Job',
      status: prettyStatus(job.status),
      reference,
      customer: customer?.name,
      assignees: joinNames(crewRows.map((row) => row.User?.name)),
      location: job.address,
      notes: job.notes || job.description || null,
    }),
  };
}

function holidayPayload(row, userName) {
  const startDate = isoDay(row.start_date);
  const endDate = isoDay(row.end_date);
  if (!startDate || !endDate) return null;
  const time = formatDayRange(startDate, endDate);
  return {
    title: eventTitle({ typeLabel: 'Holiday', reference: userName }),
    allDay: true,
    startDate,
    endDateExclusive: addCalendarDays(endDate, 1),
    colorId: GCAL_COLOR.holiday,
    notes: eventDescription({
      time,
      type: 'Holiday',
      status: prettyStatus(row.status),
      reference: userName,
      notes: row.reason || null,
    }),
  };
}

function taskPayload(task) {
  const due = isoDay(task.due_date);
  if (!due) return null;
  const time = formatDayRange(due, due);
  const reference = `TASK-${task.id}`;
  return {
    title: eventTitle({ typeLabel: 'Task', reference: task.title }),
    allDay: true,
    startDate: due,
    endDateExclusive: addCalendarDays(due, 1),
    colorId: GCAL_COLOR.task,
    notes: eventDescription({
      time,
      type: 'Task',
      status: prettyStatus(task.status) || 'Open',
      reference,
      notes: task.detail || null,
    }),
  };
}

async function upsertLink(userId, entityType, entityId, payload) {
  if (!payload) return null;
  const existing = await CalendarSyncLink.findOne({
    where: { user_id: userId, entity_type: entityType, entity_id: entityId },
  });
  if (existing) {
    await gcal.updateEvent(existing.gcal_event_id, payload, userId);
    return existing;
  }
  const created = await gcal.createEvent({ ...payload, userId });
  if (!created?.eventId || created.simulated) return null;
  return CalendarSyncLink.create({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    gcal_event_id: created.eventId,
  });
}

async function dropLink(link) {
  try {
    await gcal.cancelEvent(link.gcal_event_id, link.user_id);
  } catch { /* remote delete is best-effort */ }
  await link.destroy();
}

async function dropAllLinks(entityType, entityId) {
  const links = await CalendarSyncLink.findAll({
    where: { entity_type: entityType, entity_id: entityId },
  });
  for (const link of links) await dropLink(link);
}

/**
 * Create/update Google events for every connected user in `audienceIds`;
 * remove stale copies from users who should no longer see the record.
 */
async function pushToAudience(audienceIds, entityType, entityId, payload) {
  if (!payload) {
    await dropAllLinks(entityType, entityId);
    return;
  }
  const connected = new Set(await connectedUserIds());
  const wanted = new Set(audienceIds.filter((id) => connected.has(id)));
  const existing = await CalendarSyncLink.findAll({
    where: { entity_type: entityType, entity_id: entityId },
  });
  for (const link of existing) {
    if (wanted.has(link.user_id)) {
      await gcal.updateEvent(link.gcal_event_id, payload, link.user_id);
      wanted.delete(link.user_id);
    } else {
      await dropLink(link);
    }
  }
  for (const userId of wanted) {
    await upsertLink(userId, entityType, entityId, payload);
  }
}

async function syncAppointment(appointmentId) {
  try {
    const appt = await Appointment.findByPk(appointmentId);
    if (!appt) return;
    if (appt.status === 'cancelled') {
      await dropAllLinks(ENTITY.APPOINTMENT, appt.id);
      return;
    }
    const payload = await appointmentPayload(appt);
    await pushToAudience(await audienceForAppointment(appt), ENTITY.APPOINTMENT, appt.id, payload);
    const link = await CalendarSyncLink.findOne({
      where: { entity_type: ENTITY.APPOINTMENT, entity_id: appt.id },
      order: [['id', 'ASC']],
    });
    if (!gcal.isConfigured()) {
      await appt.update({ gcal_status: 'simulated' });
    } else if (link) {
      await appt.update({ gcal_event_id: link.gcal_event_id, gcal_status: 'synced' });
    }
  } catch (err) {
    // Sync must never fail the CRM write.
  }
}

async function syncJob(jobId) {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return;
    const payload = await jobPayload(job);
    await pushToAudience(await audienceForJob(job), ENTITY.JOB, job.id, payload);
  } catch { /* non-fatal */ }
}

async function syncHoliday(holidayId) {
  try {
    const row = await HolidayRequest.findByPk(holidayId);
    if (!row || row.status === 'declined') {
      if (holidayId) await dropAllLinks(ENTITY.HOLIDAY, Number(holidayId));
      return;
    }
    const holder = await User.findByPk(row.user_id, { attributes: ['name'] });
    const payload = holidayPayload(row, holder?.name);
    await pushToAudience(await audienceForHoliday(row), ENTITY.HOLIDAY, row.id, payload);
  } catch { /* non-fatal */ }
}

async function syncTask(taskId) {
  try {
    const task = await Task.findByPk(taskId);
    if (!task || task.status !== 'open') {
      if (taskId) await dropAllLinks(ENTITY.TASK, Number(taskId));
      return;
    }
    const payload = taskPayload(task);
    await pushToAudience(await audienceForTask(task), ENTITY.TASK, task.id, payload);
  } catch { /* non-fatal */ }
}

async function removeTask(taskId) {
  try {
    await dropAllLinks(ENTITY.TASK, Number(taskId));
  } catch { /* non-fatal */ }
}

/**
 * After OAuth connect: push every CRM record this user is allowed to see.
 */
async function backfillUser(userId) {
  if (!userId || !(await gcal.isConnected(userId))) return { appointments: 0, jobs: 0, holidays: 0, tasks: 0 };
  const user = await User.findByPk(userId, { attributes: ['id', 'role'] });
  if (!user) return { appointments: 0, jobs: 0, holidays: 0, tasks: 0 };

  const appointments = await Appointment.findAll({ where: { status: { [Op.ne]: 'cancelled' } } });
  let apptCount = 0;
  for (const appt of appointments) {
    const audience = await audienceForAppointment(appt);
    if (!audience.includes(userId)) continue;
    const payload = await appointmentPayload(appt);
    await upsertLink(userId, ENTITY.APPOINTMENT, appt.id, payload);
    apptCount += 1;
  }

  const jobs = await Job.findAll({ where: { start_date: { [Op.ne]: null } } });
  let jobCount = 0;
  for (const job of jobs) {
    const audience = await audienceForJob(job);
    if (!audience.includes(userId)) continue;
    const payload = await jobPayload(job);
    if (!payload) continue;
    await upsertLink(userId, ENTITY.JOB, job.id, payload);
    jobCount += 1;
  }

  const holidays = await HolidayRequest.findAll({
    where: { status: { [Op.in]: ['pending', 'approved'] } },
  });
  let holidayCount = 0;
  for (const row of holidays) {
    const audience = await audienceForHoliday(row);
    if (!audience.includes(userId)) continue;
    const holder = await User.findByPk(row.user_id, { attributes: ['name'] });
    const payload = holidayPayload(row, holder?.name);
    if (!payload) continue;
    await upsertLink(userId, ENTITY.HOLIDAY, row.id, payload);
    holidayCount += 1;
  }

  const tasks = await Task.findAll({ where: { status: 'open' } });
  let taskCount = 0;
  for (const task of tasks) {
    const audience = await audienceForTask(task);
    if (!audience.includes(userId)) continue;
    const payload = taskPayload(task);
    if (!payload) continue;
    await upsertLink(userId, ENTITY.TASK, task.id, payload);
    taskCount += 1;
  }

  return { appointments: apptCount, jobs: jobCount, holidays: holidayCount, tasks: taskCount };
}

/**
 * Two-way: mirror Google time moves onto the CRM row. Calendar cancels only
 * cancel site visits; jobs/holidays/tasks stay in the CRM.
 */
async function applyInboundChange(link, ev) {
  if (!ev) return false;
  if (ev.status === 'cancelled') {
    if (link.entity_type === ENTITY.APPOINTMENT) {
      const appt = await Appointment.findByPk(link.entity_id);
      if (appt && appt.status === 'booked') {
        appt.status = 'cancelled';
        await appt.save();
      }
    }
    await link.destroy();
    return true;
  }
  if (link.entity_type === ENTITY.APPOINTMENT) {
    const appt = await Appointment.findByPk(link.entity_id);
    if (!appt || appt.status !== 'booked') return false;
    if (ev.start?.date) {
      const newDay = ev.start.date;
      const oldDay = isoDay(appt.start);
      if (newDay && newDay !== oldDay) {
        const clock = partsInZone(new Date(appt.start));
        const duration = new Date(appt.end) - new Date(appt.start);
        const nextStart = zonedWallTime(newDay, Number(clock.hour), Number(clock.minute), Number(clock.second) || 0, 0);
        if (nextStart) {
          appt.start = nextStart;
          appt.end = new Date(nextStart.getTime() + Math.max(duration, 30 * 60 * 1000));
          await appt.save();
          return true;
        }
      }
      return false;
    }
    const newStart = ev.start?.dateTime;
    const newEnd = ev.end?.dateTime;
    if (newStart && new Date(newStart).getTime() !== new Date(appt.start).getTime()) {
      appt.start = new Date(newStart);
      if (newEnd) appt.end = new Date(newEnd);
      await appt.save();
      return true;
    }
  }
  if (link.entity_type === ENTITY.JOB) {
    const job = await Job.findByPk(link.entity_id);
    if (!job) return false;
    const newStart = ev.start?.date || isoDay(ev.start?.dateTime);
    const rawEnd = ev.end?.date || isoDay(ev.end?.dateTime);
    if (!newStart) return false;
    const newEnd = ev.start?.date && rawEnd ? addCalendarDays(rawEnd, -1) : (rawEnd || newStart);
    if (newStart !== isoDay(job.start_date) || newEnd !== isoDay(job.end_date || job.start_date)) {
      await job.update({ start_date: newStart, end_date: newEnd || newStart });
      return true;
    }
  }
  if (link.entity_type === ENTITY.HOLIDAY) {
    const row = await HolidayRequest.findByPk(link.entity_id);
    if (!row || row.status === 'declined') return false;
    const newStart = ev.start?.date || isoDay(ev.start?.dateTime);
    const rawEnd = ev.end?.date || isoDay(ev.end?.dateTime);
    if (!newStart) return false;
    const newEnd = rawEnd ? addCalendarDays(rawEnd, -1) : newStart;
    if (newStart !== isoDay(row.start_date) || newEnd !== isoDay(row.end_date)) {
      row.start_date = newStart;
      row.end_date = newEnd;
      await row.save();
      return true;
    }
  }
  if (link.entity_type === ENTITY.TASK) {
    const task = await Task.findByPk(link.entity_id);
    if (!task || task.status !== 'open') return false;
    const newDue = ev.start?.date || isoDay(ev.start?.dateTime);
    if (newDue && newDue !== isoDay(task.due_date)) {
      task.due_date = newDue;
      await task.save();
      return true;
    }
  }
  return false;
}

async function payloadForLink(link) {
  if (link.entity_type === ENTITY.APPOINTMENT) {
    const appt = await Appointment.findByPk(link.entity_id);
    return appt && appt.status !== 'cancelled' ? appointmentPayload(appt) : null;
  }
  if (link.entity_type === ENTITY.JOB) {
    const job = await Job.findByPk(link.entity_id);
    return job ? jobPayload(job) : null;
  }
  if (link.entity_type === ENTITY.HOLIDAY) {
    const row = await HolidayRequest.findByPk(link.entity_id);
    if (!row || row.status === 'declined') return null;
    const holder = await User.findByPk(row.user_id, { attributes: ['name'] });
    return holidayPayload(row, holder?.name);
  }
  if (link.entity_type === ENTITY.TASK) {
    const task = await Task.findByPk(link.entity_id);
    return task && task.status === 'open' ? taskPayload(task) : null;
  }
  return null;
}

async function pollInbound() {
  if (!gcal.isConfigured()) return 0;
  const links = await CalendarSyncLink.findAll();
  let changed = 0;
  for (const link of links) {
    if (!(await gcal.isConnected(link.user_id))) continue;
    try {
      const ev = await gcal.getEvent(link.user_id, link.gcal_event_id);
      const inbound = await applyInboundChange(link, ev);
      if (inbound) changed += 1;
      if (ev?.status === 'cancelled') continue;
      const payload = await payloadForLink(link);
      try {
        if (payload) await gcal.updateEvent(link.gcal_event_id, payload, link.user_id);
      } catch { /* Google write is best-effort; never drop the CRM row */ }
    } catch (err) {
      // Missing event on Google is treated as a cancel for visits only.
      if (String(err.message).includes('Google Calendar API 404') && link.entity_type === ENTITY.APPOINTMENT) {
        await applyInboundChange(link, { status: 'cancelled' });
        changed += 1;
      }
    }
  }
  return changed;
}

module.exports = {
  ENTITY,
  syncAppointment,
  syncJob,
  syncHoliday,
  syncTask,
  removeTask,
  backfillUser,
  pollInbound,
  audienceForAppointment,
  audienceForJob,
  audienceForHoliday,
  audienceForTask,
};

const express = require('express');
const { Op, fn, col, literal } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { Job, Customer, JobDayAssignment, JobMessage, User, HolidayRequest, Timesheet, Task, TaskAssignee, Appointment } = require('../models');
const { getSetting, DATA_DIR, todayStr, plain } = require('../db');
const { requireAuth, asyncHandler } = require('../auth');
const { ROLES } = require('../roles');
const { STAFF_JOB_ATTRS, toPublicStaffJob, omitFinancial } = require('../staffView');
const { logActivity, setStage } = require('../services/pipeline');
const jobKit = require('../jobKit');
const jobFiles = require('../jobFiles');
const jobDays = require('../jobDays');
const ts = require('../services/timesheets');
const holidayRequests = require('../holidayRequests');
const { listWhere } = require('../taskList');
const { assignedTaskIds, publicAssignees } = require('../taskAssignees');
const visitAssignees = require('../appointmentAssignees');
const { completeVisit } = require('../services/taskEngine');

const router = express.Router();
router.use(requireAuth);

function uniqueStaffCrew(slots) {
  const out = [];
  const seen = new Set();
  for (const s of slots) {
    if (seen.has(s.user_id)) continue;
    seen.add(s.user_id);
    out.push({ id: s.user_id, name: s.name });
  }
  return out;
}

async function staffJobOrDeny(req, res) {
  const jb = await Job.findByPk(req.params.id, { attributes: ['id', 'customer_id', 'title'] });
  if (!jb) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  if (req.user.role === ROLES.STAFF) {
    if (!(await jobDays.userAssignedToJob(jb.id, req.user.id))) {
      res.status(403).json({ error: 'Not your job' });
      return null;
    }
  }
  return jb;
}

function emptyTaskCounts() {
  return { open: 0, overdue: 0, today: 0, due: 0, done: 0 };
}

async function leadNamesById(ids) {
  if (!ids.length) return new Map();
  const rows = await Customer.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name'],
  });
  return new Map(plain(rows).map((c) => [Number(c.id), c.name]));
}

function toStaffTask(row, leadMap) {
  const o = plain(row);
  const assignees = publicAssignees(o.assignees);
  return {
    id: o.id,
    title: o.title,
    detail: o.detail || null,
    due_date: o.due_date || null,
    priority: o.priority,
    status: o.status,
    type: o.type,
    lead_name: o.entity_type === 'customer' && o.entity_id ? (leadMap.get(Number(o.entity_id)) || null) : null,
    assignees,
    assignee_name: assignees.map((a) => a.name).join(', ') || null,
  };
}

router.get('/tasks', asyncHandler(async (req, res) => {
  const { status = 'open', when } = req.query;
  const today = todayStr();
  const ids = await assignedTaskIds(req.user.id);
  if (!ids.length) {
    return res.json({ tasks: [], counts: emptyTaskCounts() });
  }
  const assigned = { id: { [Op.in]: ids } };
  const where = { ...assigned, ...listWhere({ status, when }, today) };
  const order = when === 'done'
    ? [['done_at', 'DESC NULLS LAST'], ['id', 'DESC']]
    : [
      [literal(`CASE "Task"."priority" WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`), 'ASC'],
      ['due_date', 'ASC NULLS LAST'],
    ];
  const tasks = await Task.findAll({
    where,
    include: [{
      model: User,
      as: 'assignees',
      attributes: ['id', 'name', 'role'],
      through: { attributes: [] },
    }],
    order,
  });
  const leadIds = [...new Set(tasks.map((t) => {
    const o = plain(t);
    return o.entity_type === 'customer' && o.entity_id ? Number(o.entity_id) : null;
  }).filter(Boolean))];
  const leadMap = await leadNamesById(leadIds);
  const openWhere = { ...assigned, status: 'open' };
  const [open, overdue, todayCount, due, done] = await Promise.all([
    Task.count({ where: openWhere }),
    Task.count({ where: { ...openWhere, due_date: { [Op.lt]: today } } }),
    Task.count({ where: { ...openWhere, due_date: today } }),
    Task.count({ where: { ...openWhere, due_date: { [Op.gt]: today } } }),
    Task.count({ where: { ...assigned, status: { [Op.in]: ['done', 'dismissed'] } } }),
  ]);
  res.json({
    tasks: tasks.map((t) => toStaffTask(t, leadMap)),
    counts: { open, overdue, today: todayCount, due, done },
  });
}));

router.put('/tasks/:id', asyncHandler(async (req, res) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId < 1) return res.status(404).json({ error: 'Task not found' });
  const assigned = await TaskAssignee.findOne({ where: { task_id: taskId, user_id: req.user.id } });
  if (!assigned) return res.status(404).json({ error: 'Task not found' });
  const t = await Task.findByPk(taskId);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (req.body?.status !== 'done') {
    return res.status(400).json({ error: 'Field staff can only mark a task done' });
  }
  await t.update({ status: 'done', done_at: new Date() });
  res.json({ ok: true });
}));

router.get('/jobs', asyncHandler(async (req, res) => {
  const userId = Number(req.user.role === ROLES.STAFF ? req.user.id : (req.query.user_id || req.user.id));
  const { from, to } = req.query;
  const dateFrom = jobDays.parseIsoDate(from) || todayStr();
  const dateTo = jobDays.parseIsoDate(to) || jobDays.addIsoDays(dateFrom, 13);

  const assigned = await JobDayAssignment.findAll({
    where: { user_id: userId, work_date: { [Op.between]: [dateFrom, dateTo] } },
    attributes: ['job_id', 'work_date'],
  });
  const datesByJob = {};
  for (const a of assigned) {
    const day = jobDays.toIsoDate(a.work_date);
    if (!day) continue;
    const list = (datesByJob[a.job_id] ||= []);
    if (!list.includes(day)) list.push(day);
  }
  const ids = Object.keys(datesByJob).map(Number);
  const paidIds = ids.length ? await ts.paidInvoiceJobIds(ids) : new Set();
  const jobs = ids.length ? await Job.findAll({
    attributes: STAFF_JOB_ATTRS,
    where: {
      id: ids,
      start_date: { [Op.ne]: null, [Op.lte]: dateTo },
      [Op.or]: [
        { end_date: { [Op.gte]: dateFrom } },
        { end_date: null, start_date: { [Op.gte]: dateFrom } },
      ],
    },
    include: [
      { model: Customer, attributes: ['name'] },
      { association: 'selectedPhone', attributes: ['value'] },
    ],
    order: [['start_date', 'ASC'], ['start_time', 'ASC']],
  }) : [];

  const crewByJob = {};
  if (jobs.length) {
    const slots = await JobDayAssignment.findAll({
      where: { job_id: jobs.map((j) => j.id) },
      include: [{ model: User, attributes: ['name'] }],
    });
    for (const c of slots) {
      const name = c.User?.name;
      if (!name) continue;
      const list = (crewByJob[c.job_id] ||= []);
      if (!list.includes(name)) list.push(name);
    }
  }
  res.json({
    jobs: jobs.map((j) => {
      const o = plain(j);
      o.customer_name = o.Customer?.name;
      o.customer_phone = o.selectedPhone?.value || null;
      o.crew = crewByJob[j.id] || [];
      o.work_dates = (datesByJob[j.id] || []).slice().sort();
      o.invoice_paid = o.status === 'PAID' || paidIds.has(Number(j.id));
      delete o.Customer;
      delete o.selectedPhone;
      return toPublicStaffJob(o);
    }),
  });
}));

router.get('/jobs/:id', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id, {
    attributes: STAFF_JOB_ATTRS,
    include: [
      { model: Customer, attributes: ['name'] },
      { association: 'selectedPhone', attributes: ['value'] },
    ],
  });
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (req.user.role === ROLES.STAFF) {
    if (!(await jobDays.userAssignedToJob(jb.id, req.user.id))) return res.status(403).json({ error: 'Not your job' });
  }
  const slots = await jobDays.listDayAssignments(jb.id);
  const messages = (await JobMessage.findAll({
    where: { job_id: jb.id },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'ASC']],
  })).map((m) => {
    const o = plain(m);
    return { id: o.id, body: o.body, created_at: o.created_at, user_name: o.User?.name };
  });
  const job = plain(jb);
  job.customer_name = job.Customer?.name;
  job.customer_phone = job.selectedPhone?.value || null;
  delete job.Customer;
  delete job.selectedPhone;
  job.crew = uniqueStaffCrew(slots);
  job.work_dates = [...new Set(
    slots
      .filter((s) => Number(s.user_id) === Number(req.user.id))
      .map((s) => jobDays.toIsoDate(s.work_date))
      .filter(Boolean),
  )].sort();
  job.invoice_paid = await ts.jobClockInClosed(job.id, job.status);
  const kit = await jobKit.attachJobKit(job);
  const withFiles = await jobFiles.attachJobFiles(kit);
  res.json({ job: toPublicStaffJob(withFiles), messages });
}));

router.put('/jobs/:id', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  if (req.body?.notes === undefined) return res.status(400).json({ error: 'notes is required' });
  await jb.update({ notes: jobFiles.normaliseJobNotes(req.body.notes) });
  await logActivity(jb.customer_id, req.user.id, 'job_updated', `Job "${jb.title}" updated`, 'job', jb.id);
  res.json({ ok: true });
}));

router.post('/jobs/:id/messages', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id, { attributes: ['id'] });
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (req.user.role === ROLES.STAFF) {
    if (!(await jobDays.userAssignedToJob(jb.id, req.user.id))) return res.status(403).json({ error: 'Not your job' });
  }
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const created = await JobMessage.create({ job_id: jb.id, user_id: req.user.id, body });
  res.json({ id: created.id });
}));

router.post('/jobs/:id/materials', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobKit.addMaterial(jb.id, req.body || {});
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_materials', `Materials added on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.put('/jobs/:id/materials/:lineId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  return jobKit.sendKitResult(res, await jobKit.updateMaterial(jb.id, req.params.lineId, req.body || {}));
}));

router.delete('/jobs/:id/materials/:lineId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobKit.removeMaterial(jb.id, req.params.lineId);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_materials', `Materials line removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.post('/jobs/:id/checklist', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobKit.addChecklistItem(jb.id, req.body || {});
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_checklist', `Checklist item added on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.put('/jobs/:id/checklist/:itemId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  return jobKit.sendKitResult(res, await jobKit.updateChecklistItem(jb.id, req.params.itemId, req.body || {}));
}));

router.delete('/jobs/:id/checklist/:itemId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobKit.removeChecklistItem(jb.id, req.params.itemId);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_checklist', `Checklist item removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.post('/jobs/:id/files', jobFiles.handleUpload, asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobFiles.addFile(jb.id, req.user.id, req.file, req.body?.stage);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_file', `File added on "${jb.title}"`, 'job', jb.id);
  }
  return jobFiles.sendResult(res, result);
}));

router.get('/jobs/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const row = await jobFiles.getFileRow(jb.id, Number(req.params.fileId));
  if (!row) return res.status(404).json({ error: 'File not found' });
  return jobFiles.sendResult(res, jobFiles.sendStoredFile(res, row, req.query.download === '1'));
}));

router.put('/jobs/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  return jobFiles.sendResult(res, await jobFiles.updateStage(jb.id, Number(req.params.fileId), req.body?.stage));
}));

router.delete('/jobs/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await staffJobOrDeny(req, res);
  if (!jb) return;
  const result = await jobFiles.removeFile(jb.id, Number(req.params.fileId));
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_file', `File removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobFiles.sendResult(res, result);
}));

router.get('/holidays/team', asyncHandler(async (req, res) => {
  const rows = await HolidayRequest.findAll({
    attributes: ['user_id', 'start_date', 'end_date'],
    where: { status: 'approved', end_date: { [Op.gte]: todayStr() } },
    include: [{ model: User, attributes: ['name'] }],
  });
  res.json({
    holidays: rows.map((h) => ({
      user_id: h.user_id,
      user_name: h.User?.name,
      start_date: h.start_date,
      end_date: h.end_date,
      kind: holidayRequests.kindFromDates(h.start_date, h.end_date),
    })),
  });
}));

router.get('/holidays/mine', asyncHandler(async (req, res) => {
  const rows = await HolidayRequest.findAll({
    where: { user_id: req.user.id },
    order: [['created_at', 'DESC']],
  });
  const balance = await holidayRequests.balanceForUser(req.user);
  res.json({
    holidays: plain(rows).map((o) => {
      o.kind = holidayRequests.kindFromDates(o.start_date, o.end_date);
      return o;
    }),
    notice_days: await getSetting('holiday_notice_days'),
    ...balance,
  });
}));

function publicStaffVisit(row) {
  const o = plain(row);
  const decorated = visitAssignees.decorateAssignees(o);
  return {
    id: o.id,
    title: o.title,
    start: o.start,
    end: o.end,
    address: o.address,
    notes: o.notes,
    complete_note: o.complete_note || '',
    visit_type: o.visit_type,
    status: o.status,
    customer_name: o.Customer?.name || null,
    customer_phone: o.selectedPhone?.value || null,
    assignees: decorated.assignees,
    assignee_name: decorated.assignee_name,
  };
}

async function staffVisitOrDeny(req, res) {
  const visit = await Appointment.findByPk(req.params.id, {
    include: [
      { model: Customer, attributes: ['id', 'name', 'stage'] },
      { association: 'selectedPhone', attributes: ['value'] },
      {
        association: 'assignees',
        attributes: ['id', 'name', 'role'],
        through: { attributes: [] },
      },
    ],
  });
  if (!visit) {
    res.status(404).json({ error: 'Visit not found' });
    return null;
  }
  if (req.user.role === ROLES.STAFF) {
    if (!(await visitAssignees.userAssignedToVisit(visit.id, req.user.id))) {
      res.status(403).json({ error: 'Not your visit' });
      return null;
    }
  }
  return visit;
}

router.get('/visits', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ids = await visitAssignees.assignedAppointmentIds(userId);
  const from = jobDays.parseIsoDate(req.query.from) || todayStr();
  const to = jobDays.parseIsoDate(req.query.to) || jobDays.addIsoDays(from, 13);
  const startFrom = new Date(`${from}T00:00:00`);
  const startTo = new Date(`${to}T23:59:59`);
  const visits = ids.length ? await Appointment.findAll({
    where: {
      id: ids,
      status: { [Op.ne]: 'cancelled' },
      start: { [Op.gte]: startFrom, [Op.lte]: startTo },
    },
    include: [
      { model: Customer, attributes: ['name'] },
      { association: 'selectedPhone', attributes: ['value'] },
      {
        association: 'assignees',
        attributes: ['id', 'name', 'role'],
        through: { attributes: [] },
      },
    ],
    order: [['start', 'ASC']],
  }) : [];
  res.json({ visits: visits.map(publicStaffVisit), range: { from, to } });
}));

router.get('/visits/:id', asyncHandler(async (req, res) => {
  const visit = await staffVisitOrDeny(req, res);
  if (!visit) return;
  res.json({ visit: publicStaffVisit(visit) });
}));

router.post('/visits/:id/complete', asyncHandler(async (req, res) => {
  const visit = await staffVisitOrDeny(req, res);
  if (!visit) return;
  const completeNote = String(req.body?.complete_note || '').trim();
  try {
    const result = await completeVisit(visit, setStage, req.user.id, completeNote);
    if (!result.already) {
      const summary = result.hasQuote
        ? 'Site visit completed — quote already on the lead'
        : 'Site visit completed — quote needed';
      await logActivity(
        visit.customer_id,
        req.user.id,
        'appointment_completed',
        completeNote ? `${summary}. Remarks: ${completeNote}` : summary,
        'appointment',
        visit.id,
      );
    }
    res.json({ ok: true, already: !!result.already, has_quote: result.hasQuote, task_id: result.taskId || null });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

function safeShift(row) {
  if (!row) return null;
  const { approved_by, ...safe } = omitFinancial(row);
  return safe;
}

router.get('/clock/status', asyncHandler(async (req, res) => {
  const shift = await ts.activeShift(req.user.id);
  const cfg = (await getSetting('timesheets')) || {};
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  })();
  const week = await Timesheet.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', col('worked_minutes')), 0), 'hours_minutes'],
      [fn('COUNT', col('id')), 'shifts'],
    ],
    where: { user_id: req.user.id, work_date: { [Op.gte]: weekStart }, status: { [Op.ne]: 'active' } },
    raw: true,
  });
  const hoursMinutes = Number(week?.hours_minutes || 0);

  res.json({
    active: safeShift(shift),
    on_break: !!(shift && shift.break_started_at),
    enabled: cfg.enabled !== false,
    require_location: !!cfg.require_location,
    require_photo: !!cfg.require_photo_on_clockout,
    week_hours: Math.round((hoursMinutes / 60) * 100) / 100,
    week_shifts: Number(week?.shifts || 0),
  });
}));

router.post('/clock/in', asyncHandler(async (req, res) => {
  const { job_id, lat, lng, accuracy } = req.body || {};
  try {
    const shift = await ts.clockIn(req.user.id, {
      job_id,
      lat: lat ?? null, lng: lng ?? null, accuracy: accuracy ?? null,
    });
    res.json({ ok: true, shift: safeShift(shift) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.post('/clock/break/start', asyncHandler(async (req, res) => {
  try { res.json({ ok: true, shift: safeShift(await ts.startBreak(req.user.id)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
}));

router.post('/clock/break/end', asyncHandler(async (req, res) => {
  try { res.json({ ok: true, shift: safeShift(await ts.endBreak(req.user.id)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
}));

router.post('/clock/out', asyncHandler(async (req, res) => {
  const { lat, lng, accuracy, notes, photo } = req.body || {};
  let photoFile = null;

  if (photo && typeof photo === 'string' && photo.startsWith('data:image/')) {
    try {
      const match = photo.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const buf = Buffer.from(match[2], 'base64');
        if (buf.length <= 8 * 1024 * 1024) {
          photoFile = `shift-${req.user.id}-${Date.now()}.${ext}`;
          fs.writeFileSync(path.join(DATA_DIR, 'files', photoFile), buf);
        }
      }
    } catch { photoFile = null; }
  }

  try {
    const shift = await ts.clockOut(req.user.id, {
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
}));

router.get('/timesheets/mine', asyncHandler(async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10);
  const rows = await ts.myTimesheets(req.user.id, from, to);
  const totalHours = rows.reduce((s, r) => s + (Number(r.worked_minutes) || 0), 0) / 60;
  res.json({ timesheets: rows.map(omitFinancial), total_hours: Math.round(totalHours * 100) / 100, range: { from, to } });
}));

module.exports = router;

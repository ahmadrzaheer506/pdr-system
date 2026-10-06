const express = require('express');
const { literal } = require('sequelize');
const { Job, Customer, User, JobMessage, AiProposal, Invoice } = require('../models');
const { sequelize, todayStr, plain } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { setStage, logActivity, resolveLeadForCustomer } = require('../services/pipeline');
const { JOB_STATUSES, canAdvanceJobStatus, canUnscheduleJob, parseJobPriority } = require('../jobStatus');
const { normaliseJobSkills } = require('../skills');
const jobKit = require('../jobKit');
const jobFiles = require('../jobFiles');
const jobVariations = require('../jobVariations');
const jobDays = require('../jobDays');
const crewAvailability = require('../crewAvailability');
const crewNotifications = require('../crewNotifications');
const { buildContext, validateProposal, proposalConflicts } = require('../services/schedulerEngine');
const ai = require('../integrations/ai');
const contacts = require('../customerContacts');
const geocode = require('../geocode');

const router = express.Router();
router.use(requireAuth, requireOffice);

function mapJob(jobJson) {
  return {
    ...jobJson,
    required_skills: Array.isArray(jobJson.required_skills) ? jobJson.required_skills : [],
    needs_driver: !!jobJson.needs_driver,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { from, to, status } = req.query;
  const where = {};
  if (from || to) Object.assign(where, jobDays.overlapWhere(from, to));
  if (status) where.status = status;
  const rows = await Job.findAll({
    where,
    include: [
      { model: Customer, attributes: ['id', 'name'] },
      { association: 'selectedPhone', attributes: ['id', 'value', 'type'] },
    ],
    order: [
      [literal('"Job"."start_date" IS NULL'), 'ASC'],
      ['start_date', 'ASC'],
      ['priority', 'ASC'],
    ],
  });
  const jobs = rows.map((jb) => {
    const o = mapJob(plain(jb));
    o.customer_name = o.Customer?.name;
    o.phone = o.selectedPhone?.value || null;
    delete o.Customer;
    delete o.selectedPhone;
    return o;
  });
  res.json({ jobs: await jobDays.attachDayAssignmentsMany(jobs) });
}));

router.get('/unscheduled', asyncHandler(async (req, res) => {
  const rows = await Job.findAll({
    where: { status: 'PENDING' },
    include: [{ model: Customer, attributes: ['name'] }],
    order: [[literal(`CASE "Job"."priority" WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`), 'ASC'], ['created_at', 'ASC']],
  });
  res.json({
    jobs: rows.map((jb) => {
      const o = plain(jb);
      o.customer_name = o.Customer?.name;
      o.customer_address = o.address;
      o.required_skills = Array.isArray(o.required_skills) ? o.required_skills : [];
      o.needs_driver = !!o.needs_driver;
      delete o.Customer;
      return o;
    }),
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { customer_id, title, description, address, priority, required_skills, materials, value, start_date, end_date, start_time, end_time } = req.body || {};
  if (!customer_id || !title) return res.status(400).json({ error: 'customer_id and title required' });
  const parsedPriority = parseJobPriority(priority, { fallback: 'normal' });
  if (parsedPriority.error) return res.status(400).json({ error: parsedPriority.error });
  const customer = await Customer.findByPk(customer_id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  let lead = null;
  try {
    lead = await resolveLeadForCustomer(customer_id, req.body?.lead_id);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const picked = await contacts.resolveCustomerContactSelection(customer_id, req.body || {});
  if (picked.error) return res.status(400).json({ error: picked.error });
  const siteAddress = contacts.formatSite(picked.site);
  const created = await Job.create({
    customer_id, lead_id: lead?.id || null, title,
    description: description || null,
    address: address || siteAddress || null,
    priority: parsedPriority.value,
    required_skills: normaliseJobSkills(required_skills),
    needs_driver: !!req.body?.needs_driver,
    materials: materials || null,
    value: value || null,
    start_date: start_date || null,
    end_date: end_date || null,
    start_time: start_time || '08:00',
    end_time: end_time || '16:30',
    status: start_date ? 'SCHEDULED' : 'PENDING',
    site_id: picked.site_id,
    phone_id: picked.phone_id,
    email_id: picked.email_id,
  });
  await logActivity(customer_id, req.user.id, 'job_created', `Job "${title}" created`, 'job', created.id);
  await geocode.ensureJobSitePoint(created, { refresh: true });
  res.json({ id: created.id });
}));

router.get('/checklist-templates', asyncHandler(async (req, res) => {
  res.json({ templates: await jobKit.listTemplates() });
}));

router.get('/availability', asyncHandler(async (req, res) => {
  const result = await crewAvailability.overlay(req.query.from, req.query.to);
  return jobDays.sendResult(res, result);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id, {
    include: [
      { model: Customer, attributes: ['id', 'name'] },
      { association: 'selectedPhone', attributes: ['id', 'value', 'type'] },
    ],
  });
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const job = mapJob(plain(jb));
  const customer = await contacts.loadCustomerWithContacts(jb.customer_id);
  job.customer_name = job.Customer?.name;
  job.phone = job.selectedPhone?.value || customer?.phone || null;
  job.customer_address = job.address;
  job.sites = customer?.sites || [];
  job.phones = customer?.phones || [];
  job.emails = customer?.emails || [];
  delete job.Customer;
  delete job.selectedPhone;
  Object.assign(job, await jobKit.attachJobKit(job));
  Object.assign(job, await jobFiles.attachJobFiles(job));
  Object.assign(job, await jobVariations.attachJobVariations(job));
  Object.assign(job, await jobDays.attachDayAssignments(job));
  const linked = await Invoice.findOne({ where: { job_id: jb.id }, attributes: ['id', 'ref'] });
  job.invoice_id = linked?.id || null;
  job.invoice_ref = linked?.ref || null;
  const messages = (await JobMessage.findAll({
    where: { job_id: jb.id },
    include: [{ model: User, attributes: ['name', 'color'] }],
    order: [['created_at', 'ASC']],
  })).map((m) => {
    const o = plain(m);
    o.user_name = o.User?.name;
    o.color = o.User?.color;
    delete o.User;
    return o;
  });
  res.json({ job, messages });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const fields = ['title', 'description', 'address', 'materials', 'value', 'start_date', 'end_date', 'start_time', 'end_time'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.priority !== undefined) {
    const parsedPriority = parseJobPriority(req.body.priority);
    if (parsedPriority.error) return res.status(400).json({ error: parsedPriority.error });
    if (!parsedPriority.value) return res.status(400).json({ error: 'Priority must be low, normal, high, or urgent' });
    updates.priority = parsedPriority.value;
  }
  if (updates.start_date !== undefined || updates.end_date !== undefined) {
    const dated = jobDays.validateJobDates(
      updates.start_date !== undefined ? updates.start_date : jb.start_date,
      updates.end_date !== undefined ? updates.end_date : jb.end_date,
    );
    if (dated.error) return res.status(dated.status).json({ error: dated.error });
    if (updates.start_date !== undefined) updates.start_date = dated.start;
    if (updates.end_date !== undefined) updates.end_date = dated.end;
  }
  if (req.body.notes !== undefined) updates.notes = jobFiles.normaliseJobNotes(req.body.notes);
  if (req.body.required_skills !== undefined) updates.required_skills = normaliseJobSkills(req.body.required_skills);
  if (req.body.needs_driver !== undefined) updates.needs_driver = !!req.body.needs_driver;
  if (req.body.site_id !== undefined || req.body.phone_id !== undefined || req.body.email_id !== undefined) {
    const picked = await contacts.resolveCustomerContactSelection(jb.customer_id, {
      site_id: req.body.site_id !== undefined ? req.body.site_id : jb.site_id,
      phone_id: req.body.phone_id !== undefined ? req.body.phone_id : jb.phone_id,
      email_id: req.body.email_id !== undefined ? req.body.email_id : jb.email_id,
    });
    if (picked.error) return res.status(400).json({ error: picked.error });
    updates.site_id = picked.site_id;
    updates.phone_id = picked.phone_id;
    updates.email_id = picked.email_id;
    if (req.body.address === undefined) updates.address = contacts.formatSite(picked.site);
  }
  if (Object.keys(updates).length) await jb.update(updates);
  if (updates.address !== undefined) {
    await jb.reload();
    await geocode.ensureJobSitePoint(jb, { refresh: true });
  }
  if (updates.start_date !== undefined || updates.end_date !== undefined) {
    await jb.reload();
    if (jb.start_date) await jobDays.pruneOutsideRange(jb.id, jb.start_date, jb.end_date || jb.start_date);
  }
  if (req.body.start_date && jb.status === 'PENDING') {
    await jb.update({ status: 'SCHEDULED' });
    const cust = await Customer.findByPk(jb.customer_id, { attributes: ['stage'] });
    const lead = await resolveLeadForCustomer(jb.customer_id, jb.lead_id);
    if ((lead?.stage || cust?.stage) === 'WON') {
      await setStage(jb.customer_id, 'SCHEDULED', req.user.id, 'Job dated and scheduled', { leadId: lead?.id || jb.lead_id });
    }
  }
  await logActivity(jb.customer_id, req.user.id, 'job_updated', `Job "${jb.title}" updated`, 'job', jb.id);
  res.json({ ok: true });
}));

router.put('/:id/status', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const { status } = req.body || {};
  if (!JOB_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (!canAdvanceJobStatus(jb.status, status)) {
    return res.status(400).json({ error: 'Job status can only move forward' });
  }
  await jb.update({ status, completed_at: status === 'COMPLETED' ? new Date() : jb.completed_at });
  const cust = await Customer.findByPk(jb.customer_id, { attributes: ['stage'] });
  const lead = await resolveLeadForCustomer(jb.customer_id, jb.lead_id);
  const stage = lead?.stage || cust?.stage;
  if (status === 'COMPLETED' && cust && !['COMPLETED', 'INVOICED', 'PAID'].includes(stage)) {
    await setStage(jb.customer_id, 'COMPLETED', req.user.id, `Job "${jb.title}" completed`, { leadId: lead?.id || jb.lead_id });
  }
  await logActivity(jb.customer_id, req.user.id, 'job_status', `Job "${jb.title}" → ${status}`, 'job', jb.id);
  res.json({ ok: true });
}));

/**
 * Pull a scheduled / in-progress job off the board: PENDING again, dates
 * cleared, crew freed, Unscheduled queue. Stepper stays forward-only.
 */
router.post('/:id/unschedule', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (!canUnscheduleJob(jb.status)) {
    return res.status(400).json({ error: 'Only scheduled or in-progress jobs can be unscheduled' });
  }
  const crewByDate = await jobDays.listCrewByDate(jb.id);
  await jobDays.clearAllCrew(jb.id);
  for (const [workDate, previousIds] of crewByDate) {
    await crewNotifications.notifyCrewChange({
      job: jb,
      workDate,
      previousIds,
      nextIds: [],
    });
  }
  await jb.update({ status: 'PENDING', start_date: null, end_date: null });
  const cust = await Customer.findByPk(jb.customer_id, { attributes: ['stage'] });
  const lead = await resolveLeadForCustomer(jb.customer_id, jb.lead_id);
  const stage = lead?.stage || cust?.stage;
  if (stage === 'SCHEDULED' || stage === 'IN_PROGRESS') {
    await setStage(jb.customer_id, 'WON', req.user.id, `Job "${jb.title}" unscheduled`, {
      leadId: lead?.id || jb.lead_id,
    });
  }
  await logActivity(jb.customer_id, req.user.id, 'job_unscheduled', `Job "${jb.title}" unscheduled`, 'job', jb.id);
  res.json({ ok: true });
}));

router.post('/:id/materials', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobKit.addMaterial(jb.id, req.body || {});
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_materials', `Materials added on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.put('/:id/materials/:lineId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  return jobKit.sendKitResult(res, await jobKit.updateMaterial(jb.id, req.params.lineId, req.body || {}));
}));

router.delete('/:id/materials/:lineId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobKit.removeMaterial(jb.id, req.params.lineId);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_materials', `Materials line removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.post('/:id/checklist/apply', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobKit.applyChecklistTemplate(jb.id, req.body?.template_id);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_checklist', `Applied checklist on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.post('/:id/checklist', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobKit.addChecklistItem(jb.id, req.body || {});
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_checklist', `Checklist item added on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.put('/:id/checklist/:itemId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  return jobKit.sendKitResult(res, await jobKit.updateChecklistItem(jb.id, req.params.itemId, req.body || {}));
}));

router.delete('/:id/checklist/:itemId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobKit.removeChecklistItem(jb.id, req.params.itemId);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_checklist', `Checklist item removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobKit.sendKitResult(res, result);
}));

router.post('/:id/files', jobFiles.handleUpload, asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobFiles.addFile(jb.id, req.user.id, req.file, req.body?.stage);
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_file', `File added on "${jb.title}"`, 'job', jb.id);
  }
  return jobFiles.sendResult(res, result);
}));

router.get('/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const row = await jobFiles.getFileRow(jb.id, Number(req.params.fileId));
  if (!row) return res.status(404).json({ error: 'File not found' });
  return jobFiles.sendResult(res, jobFiles.sendStoredFile(res, row, req.query.download === '1'));
}));

router.put('/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  return jobFiles.sendResult(res, await jobFiles.updateStage(jb.id, Number(req.params.fileId), req.body?.stage));
}));

router.delete('/:id/files/:fileId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobFiles.removeFile(jb.id, Number(req.params.fileId));
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_file', `File removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobFiles.sendResult(res, result);
}));

router.post('/:id/variations', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobVariations.addVariation(jb.id, req.body || {});
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_variation', `Variation added on "${jb.title}"`, 'job', jb.id);
  }
  return jobVariations.sendResult(res, result);
}));

router.put('/:id/variations/:lineId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  return jobVariations.sendResult(res, await jobVariations.updateVariation(jb.id, Number(req.params.lineId), req.body || {}));
}));

router.delete('/:id/variations/:lineId', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const result = await jobVariations.removeVariation(jb.id, Number(req.params.lineId));
  if (!result.error) {
    await logActivity(jb.customer_id, req.user.id, 'job_variation', `Variation removed on "${jb.title}"`, 'job', jb.id);
  }
  return jobVariations.sendResult(res, result);
}));

router.put('/:id/assignments', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  if (jobDays.parseIsoDate(jb.start_date)) {
    const conflicts = await crewAvailability.assignmentConflicts(jb, req.body?.work_date, req.body?.user_ids);
    if (conflicts.length && !req.body?.confirm_conflicts) {
      return res.status(409).json({
        error: 'Some of this crew are on holiday or already booked',
        needs_confirm: true,
        conflicts,
      });
    }
  }
  const result = await jobDays.setDayCrew(jb, req.body?.work_date, req.body?.user_ids);
  if (!result.error) {
    result.warnings = await crewAvailability.assignmentWarnings(jb, result.work_date, result.user_ids);
    await crewNotifications.notifyCrewChange({
      job: jb,
      workDate: result.work_date,
      previousIds: result.previous_user_ids,
      nextIds: result.user_ids,
    });
    await logActivity(jb.customer_id, req.user.id, 'job_assigned', `Crew updated for "${jb.title}" on ${result.work_date} (${result.user_ids.length} assigned)`, 'job', jb.id);
  }
  return jobDays.sendResult(res, result);
}));

router.post('/:id/messages', asyncHandler(async (req, res) => {
  const jb = await Job.findByPk(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const created = await JobMessage.create({ job_id: jb.id, user_id: req.user.id, body });
  res.json({ id: created.id });
}));

router.get('/ai/context/:date', asyncHandler(async (req, res) => {
  res.json(await buildContext(req.params.date));
}));

router.post('/ai/propose', asyncHandler(async (req, res) => {
  const { date, transcript } = req.body || {};
  const forDate = date || todayStr();
  if (forDate < todayStr()) {
    return res.status(400).json({ error: 'Cannot schedule for a date in the past' });
  }
  const context = await buildContext(forDate);
  if (!context.unscheduledJobs.length) {
    return res.json({ provider: 'none', assignments: [], unassigned: [], warnings: [], errors: [], summary: 'No unscheduled jobs waiting — nothing to propose.' });
  }
  try {
    const { provider, proposal } = await ai.proposeSchedule(context, transcript || '');
    const validated = validateProposal(proposal, context);
    const created = await AiProposal.create({
      for_date: forDate,
      transcript: transcript || null,
      provider,
      proposal: { ...proposal, assignments: validated.assignments },
      warnings: [...validated.warnings, ...validated.errors],
      created_by: req.user.id,
    });
    res.json({
      proposal_id: created.id,
      provider,
      for_date: forDate,
      assignments: validated.assignments,
      unassigned: proposal.unassigned || [],
      warnings: validated.warnings,
      errors: validated.errors,
      summary: proposal.summary,
      context,
    });
  } catch (err) {
    res.status(500).json({ error: `Scheduling assistant failed: ${err.message}` });
  }
}));

router.post('/ai/approve', asyncHandler(async (req, res) => {
  const { proposal_id, assignments = [], confirm_conflicts } = req.body || {};
  const context = await buildContext(req.body.date || todayStr());
  const conflicts = proposalConflicts(assignments, context);
  if (conflicts.length && !confirm_conflicts) {
    return res.status(409).json({
      error: 'Some of this crew are on holiday or already booked',
      needs_confirm: true,
      conflicts,
    });
  }
  const { assignments: clean, errors } = validateProposal({ assignments }, context, {
    allowConflicts: !!confirm_conflicts,
  });
  if (errors.length) return res.status(400).json({ error: 'Some assignments failed validation', errors });

  await sequelize.transaction(async (t) => {
    for (const a of clean) {
      const job = await Job.findByPk(a.job_id, { transaction: t });
      await job.update({
        status: 'SCHEDULED',
        start_date: job.start_date || context.forDate,
        end_date: job.end_date || job.start_date || context.forDate,
        start_time: a.start_time || '08:00',
        end_time: a.end_time || '16:30',
      }, { transaction: t });
      await job.reload({ transaction: t });
      const dayResult = await jobDays.setDayCrew(job, context.forDate, a.user_ids, t);
      if (dayResult.error) throw new Error(dayResult.error);
      await crewNotifications.notifyCrewChange({
        job,
        workDate: dayResult.work_date,
        previousIds: dayResult.previous_user_ids,
        nextIds: dayResult.user_ids,
        transaction: t,
      });
      const cust = await Customer.findByPk(job.customer_id, { attributes: ['stage'], transaction: t });
      const lead = await resolveLeadForCustomer(job.customer_id, job.lead_id);
      if ((lead?.stage || cust?.stage) === 'WON') {
        await setStage(job.customer_id, 'SCHEDULED', req.user.id, 'Scheduled via AI assistant', { leadId: lead?.id || job.lead_id });
      }
      await logActivity(job.customer_id, req.user.id, 'job_scheduled', `"${job.title}" scheduled via AI assistant for ${context.forDate}`, 'job', a.job_id);
    }
  });

  if (proposal_id) {
    await AiProposal.update(
      { status: 'approved', approved_at: new Date(), proposal: { assignments: clean } },
      { where: { id: proposal_id } }
    );
  }
  res.json({ ok: true, scheduled: clean.length });
}));

router.get('/ai/proposals', asyncHandler(async (req, res) => {
  const rows = await AiProposal.findAll({ order: [['id', 'DESC']], limit: 30 });
  res.json({ proposals: plain(rows) });
}));

module.exports = router;

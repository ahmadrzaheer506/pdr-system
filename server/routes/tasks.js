const express = require('express');
const { Op, literal } = require('sequelize');
const { sequelize, Task, User, Customer, Lead } = require('../models');
const { todayStr } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { listWhere } = require('../taskList');
const {
  parseAssigneeIds, assertAssignableUsers, replaceAssignees,
} = require('../taskAssignees');
const { ASSIGNEE_INCLUDE, decorateTasks } = require('../taskDecorate');

const router = express.Router();
router.use(requireAuth, requireOffice);

function parseLeadId(raw) {
  if (raw == null || raw === '') return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid lead' };
  return { value: n };
}

router.get('/', asyncHandler(async (req, res) => {
  const { status = 'open', when } = req.query;
  const today = todayStr();
  const where = listWhere({ status, when }, today);
  const order = when === 'done'
    ? [['done_at', 'DESC NULLS LAST'], ['id', 'DESC']]
    : [
      [literal(`CASE "Task"."priority" WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`), 'ASC'],
      ['due_date', 'ASC NULLS LAST'],
    ];
  const tasks = await Task.findAll({
    where,
    include: [
      { model: User, as: 'assignee', attributes: ['name'] },
      ASSIGNEE_INCLUDE,
    ],
    order,
  });
  const decorated = await decorateTasks(tasks);
  const openWhere = { status: 'open' };
  const [open, overdue, todayCount, due, done] = await Promise.all([
    Task.count({ where: openWhere }),
    Task.count({ where: { ...openWhere, due_date: { [Op.lt]: today } } }),
    Task.count({ where: { ...openWhere, due_date: today } }),
    Task.count({ where: { ...openWhere, due_date: { [Op.gt]: today } } }),
    Task.count({ where: { status: { [Op.in]: ['done', 'dismissed'] } } }),
  ]);
  res.json({
    tasks: decorated,
    counts: { open, overdue, today: todayCount, due, done },
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, detail, due_date, priority, assignee_id, assignee_ids, entity_type, entity_id, lead_id, enquiry_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  if (due_date && String(due_date).slice(0, 10) < todayStr()) {
    return res.status(400).json({ error: 'Due date cannot be in the past' });
  }
  const enquiry = parseLeadId(enquiry_id);
  if (enquiry.error) return res.status(400).json({ error: enquiry.error });
  let entityType = 'customer';
  let entityId = null;
  if (enquiry.value) {
    const row = await Lead.findByPk(enquiry.value, { attributes: ['id', 'customer_id'] });
    if (!row) return res.status(400).json({ error: 'Lead not found' });
    entityType = 'lead';
    entityId = enquiry.value;
  } else {
    const lead = parseLeadId(lead_id != null ? lead_id : entity_id);
    if (lead.error) return res.status(400).json({ error: lead.error });
    if (!lead.value) return res.status(400).json({ error: 'Pick a lead' });
    const found = await Customer.findByPk(lead.value, { attributes: ['id'] });
    if (!found) return res.status(400).json({ error: 'Lead not found' });
    if (entity_type && entity_type !== 'customer' && entity_type !== 'lead') {
      return res.status(400).json({ error: 'Manual tasks belong to a lead' });
    }
    entityId = lead.value;
  }

  const parsed = parseAssigneeIds(assignee_ids != null ? assignee_ids : assignee_id);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const allowed = await assertAssignableUsers(parsed.ids);
  if (allowed.error) return res.status(400).json({ error: allowed.error });

  const created = await sequelize.transaction(async (transaction) => {
    const row = await Task.create({
      type: 'manual',
      title,
      detail: detail || null,
      due_date: due_date || todayStr(),
      priority: priority || 'normal',
      assignee_id: allowed.ids[0] || null,
      entity_type: entityType,
      entity_id: entityId,
    }, { transaction });
    await replaceAssignees(row.id, allowed.ids, { transaction });
    return row;
  });
  await require('../calendarSync').syncTask(created.id);
  res.json({ id: created.id });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const { status, title, detail, due_date, priority, assignee_ids, assignee_id, lead_id, entity_id, enquiry_id } = req.body || {};
  const patch = {};
  if (status) {
    if (!['open', 'done', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'status must be open, done, or dismissed' });
    }
    patch.status = status;
    patch.done_at = ['done', 'dismissed'].includes(status) ? new Date() : null;
  }
  if (title !== undefined) patch.title = title;
  if (detail !== undefined) patch.detail = detail;
  if (due_date !== undefined) {
    if (due_date) {
      const day = String(due_date).slice(0, 10);
      const current = t.due_date ? String(t.due_date).slice(0, 10) : '';
      if (day < todayStr() && day !== current) {
        return res.status(400).json({ error: 'Due date cannot be in the past' });
      }
    }
    patch.due_date = due_date;
  }
  if (priority !== undefined) patch.priority = priority;

  let nextAssignees = null;
  if (assignee_ids !== undefined || assignee_id !== undefined) {
    const parsed = parseAssigneeIds(assignee_ids != null ? assignee_ids : assignee_id);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const allowed = await assertAssignableUsers(parsed.ids);
    if (allowed.error) return res.status(400).json({ error: allowed.error });
    nextAssignees = allowed.ids;
    patch.assignee_id = nextAssignees[0] || null;
  }

  const canMove = t.type === 'manual' || t.entity_type === 'customer' || t.entity_type === 'lead' || !t.entity_type;
  if (enquiry_id !== undefined && canMove) {
    const enquiry = parseLeadId(enquiry_id);
    if (enquiry.error) return res.status(400).json({ error: enquiry.error });
    if (!enquiry.value) return res.status(400).json({ error: 'Pick a lead' });
    const row = await Lead.findByPk(enquiry.value, { attributes: ['id'] });
    if (!row) return res.status(400).json({ error: 'Lead not found' });
    patch.entity_type = 'lead';
    patch.entity_id = enquiry.value;
  } else {
    const leadRaw = lead_id !== undefined ? lead_id : entity_id;
    if (leadRaw !== undefined && canMove) {
      const lead = parseLeadId(leadRaw);
      if (lead.error) return res.status(400).json({ error: lead.error });
      if (!lead.value) return res.status(400).json({ error: 'Pick a lead' });
      const found = await Customer.findByPk(lead.value, { attributes: ['id'] });
      if (!found) return res.status(400).json({ error: 'Lead not found' });
      patch.entity_type = 'customer';
      patch.entity_id = lead.value;
    }
  }

  await sequelize.transaction(async (transaction) => {
    await t.update(patch, { transaction });
    if (nextAssignees) await replaceAssignees(t.id, nextAssignees, { transaction });
  });
  await require('../calendarSync').syncTask(t.id);
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const taskId = t.id;
  await t.destroy();
  await require('../calendarSync').removeTask(taskId);
  res.json({ ok: true });
}));

module.exports = router;

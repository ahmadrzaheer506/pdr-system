const express = require('express');
const { Op, literal } = require('sequelize');
const { sequelize, Task, User, Customer } = require('../models');
const { todayStr, plain } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { listWhere } = require('../taskList');
const {
  parseAssigneeIds, assertAssignableUsers, replaceAssignees, publicAssignees,
} = require('../taskAssignees');

const router = express.Router();
router.use(requireAuth, requireOffice);

const ASSIGNEE_INCLUDE = {
  model: User,
  as: 'assignees',
  attributes: ['id', 'name', 'role'],
  through: { attributes: [] },
};

function parseLeadId(raw) {
  if (raw == null || raw === '') return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid lead' };
  return { value: n };
}

async function leadNamesById(ids) {
  if (!ids.length) return new Map();
  const rows = await Customer.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name'],
  });
  return new Map(plain(rows).map((c) => [Number(c.id), c.name]));
}

function decorateTask(row, leadMap) {
  const o = plain(row);
  const assignees = publicAssignees(o.assignees);
  o.assignees = assignees;
  o.assignee_ids = assignees.map((a) => a.id);
  o.assignee_name = assignees.map((a) => a.name).join(', ') || o.assignee?.name || null;
  o.lead_id = o.entity_type === 'customer' ? o.entity_id : null;
  o.lead_name = o.lead_id ? (leadMap.get(Number(o.lead_id)) || null) : null;
  delete o.assignee;
  return o;
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
  const leadIds = [...new Set(tasks.map((t) => {
    const o = plain(t);
    return o.entity_type === 'customer' && o.entity_id ? Number(o.entity_id) : null;
  }).filter(Boolean))];
  const leadMap = await leadNamesById(leadIds);
  const openWhere = { status: 'open' };
  const [open, overdue, todayCount, due, done] = await Promise.all([
    Task.count({ where: openWhere }),
    Task.count({ where: { ...openWhere, due_date: { [Op.lt]: today } } }),
    Task.count({ where: { ...openWhere, due_date: today } }),
    Task.count({ where: { ...openWhere, due_date: { [Op.gt]: today } } }),
    Task.count({ where: { status: { [Op.in]: ['done', 'dismissed'] } } }),
  ]);
  res.json({
    tasks: tasks.map((t) => decorateTask(t, leadMap)),
    counts: { open, overdue, today: todayCount, due, done },
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, detail, due_date, priority, assignee_id, assignee_ids, entity_type, entity_id, lead_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  if (due_date && String(due_date).slice(0, 10) < todayStr()) {
    return res.status(400).json({ error: 'Due date cannot be in the past' });
  }
  const lead = parseLeadId(lead_id != null ? lead_id : entity_id);
  if (lead.error) return res.status(400).json({ error: lead.error });
  if (!lead.value) return res.status(400).json({ error: 'Pick a lead' });
  const found = await Customer.findByPk(lead.value, { attributes: ['id'] });
  if (!found) return res.status(400).json({ error: 'Lead not found' });
  if (entity_type && entity_type !== 'customer') {
    return res.status(400).json({ error: 'Manual tasks belong to a lead' });
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
      entity_type: 'customer',
      entity_id: lead.value,
    }, { transaction });
    await replaceAssignees(row.id, allowed.ids, { transaction });
    return row;
  });
  res.json({ id: created.id });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const { status, title, detail, due_date, priority, assignee_ids, assignee_id, lead_id, entity_id } = req.body || {};
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

  const leadRaw = lead_id !== undefined ? lead_id : entity_id;
  if (leadRaw !== undefined && (t.type === 'manual' || t.entity_type === 'customer' || !t.entity_type)) {
    const lead = parseLeadId(leadRaw);
    if (lead.error) return res.status(400).json({ error: lead.error });
    if (!lead.value) return res.status(400).json({ error: 'Pick a lead' });
    const found = await Customer.findByPk(lead.value, { attributes: ['id'] });
    if (!found) return res.status(400).json({ error: 'Lead not found' });
    patch.entity_type = 'customer';
    patch.entity_id = lead.value;
  }

  await sequelize.transaction(async (transaction) => {
    await t.update(patch, { transaction });
    if (nextAssignees) await replaceAssignees(t.id, nextAssignees, { transaction });
  });
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const t = await Task.findByPk(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  await t.destroy();
  res.json({ ok: true });
}));

module.exports = router;

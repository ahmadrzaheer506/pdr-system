const express = require('express');
const { Op } = require('sequelize');
const { Timesheet } = require('../models');
const { requireAuth, requireOffice, requireLabourCosts, canSeeLabourCosts, asyncHandler } = require('../auth');
const ts = require('../services/timesheets');

const router = express.Router();
router.use(requireAuth, requireOffice);

const LABOUR_COST_KEYS = ['labour_cost', 'cost_rate', 'actual_labour_cost', 'cost'];

function stripLabourCosts(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of LABOUR_COST_KEYS) delete out[key];
  return out;
}

function hideLabourCosts(user, row) {
  return canSeeLabourCosts(user) ? row : stripLabourCosts(row);
}

function listFilters(req) {
  const { from, to } = defaultRange(req);
  const raw = req.query.status ? String(req.query.status).trim() : '';
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  return {
    from,
    to,
    status: raw || null,
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
  };
}

function sendServiceError(res, err) {
  res.status(err.status || 400).json({ error: err.message });
}

function defaultRange(req) {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

router.get('/', asyncHandler(async (req, res) => {
  const { from, to, status, userId } = listFilters(req);
  const rows = await ts.listTimesheets({
    from, to, status, userId,
    jobId: req.query.job_id ? Number(req.query.job_id) : null,
  });
  const counts = {
    awaiting: await Timesheet.count({ where: { status: 'completed' } }),
    flagged: await Timesheet.count({ where: { location_flag: { [Op.ne]: null }, status: { [Op.ne]: 'approved' } } }),
    running: await Timesheet.count({ where: { status: 'active' } }),
  };
  res.json({ timesheets: rows.map((r) => hideLabourCosts(req.user, r)), counts, range: { from, to } });
}));

router.get('/live', asyncHandler(async (req, res) => {
  const board = await ts.liveBoard();
  res.json({
    work_date: board.work_date,
    active: board.active.map((row) => hideLabourCosts(req.user, row)),
    not_clocked_in: board.not_clocked_in,
  });
}));

router.get('/totals', asyncHandler(async (req, res) => {
  const { from, to } = defaultRange(req);
  res.json({ totals: (await ts.weeklyTotals(from, to)).map((r) => hideLabourCosts(req.user, r)), range: { from, to } });
}));

router.get('/costing', requireLabourCosts, asyncHandler(async (req, res) => {
  res.json({ jobs: await ts.jobCosting(req.query.job_id ? Number(req.query.job_id) : null) });
}));

router.get('/export.csv', asyncHandler(async (req, res) => {
  const { from, to, status, userId } = listFilters(req);
  const rows = await ts.listTimesheets({ from, to, status, userId });
  const includeCost = canSeeLabourCosts(req.user);
  const head = includeCost
    ? ['Date', 'Staff', 'Job', 'Customer', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Rate', 'Cost', 'Status', 'Flag', 'Notes']
    : ['Date', 'Staff', 'Job', 'Customer', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Status', 'Flag', 'Notes'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const r of rows) {
    const cols = [
      r.work_date, r.user_name, r.job_title || '', r.customer_name || '',
      r.clock_in || '', r.clock_out || '', r.break_minutes || 0,
      r.worked_minutes ? (r.worked_minutes / 60).toFixed(2) : '',
    ];
    if (includeCost) cols.push(r.cost_rate ?? '', r.labour_cost ?? '');
    cols.push(r.status, r.location_flag || '', r.notes || '');
    lines.push(cols.map(esc).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${from}-to-${to}.csv"`);
  res.send(lines.join('\n'));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const result = await ts.correctShift(req.params.id, req.body || {});
    const payload = { ok: true, worked_minutes: result.worked_minutes };
    if (canSeeLabourCosts(req.user)) payload.labour_cost = result.labour_cost;
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  try {
    res.json(await ts.approveShift(req.params.id, req.user.id));
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.post('/approve-batch', asyncHandler(async (req, res) => {
  try {
    res.json(await ts.approveBatch(req.body?.ids, req.user.id));
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.post('/:id/reject', asyncHandler(async (req, res) => {
  try {
    res.json(await ts.rejectShift(req.params.id, req.user.id, req.body?.reason));
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.post('/:id/force-clockout', asyncHandler(async (req, res) => {
  const row = await Timesheet.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Timesheet not found' });
  if (row.status !== 'active') return res.status(400).json({ error: 'That shift is not running' });
  try {
    const result = await ts.clockOut(row.user_id, { notes: `Clocked out by office (${req.user.name})` });
    res.json({ ok: true, timesheet: hideLabourCosts(req.user, result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

module.exports = router;

'use strict';

const express = require('express');
const { requireAuth, requireOffice, requireAdmin, asyncHandler, canSeeLabourCosts } = require('../auth');
const { sendCsv, isoDay } = require('../csv');
const {
  parseReportRange, leadVolume, winLoss, pipelineValueSnapshot,
  listCustomers, listJobs, listInvoices, listProfitability,
} = require('../reports');

const router = express.Router();
router.use(requireAuth, requireOffice);

function rangeOr400(req, res, { required = false } = {}) {
  const parsed = parseReportRange(req.query, { required });
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return null;
  }
  return parsed;
}

router.get('/lead-volume', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res);
  if (!range) return;
  const data = await leadVolume(range.fromDt, range.toDt, { includeTrend: true, includeLeads: true });
  res.json({ range: { from: range.from, to: range.to }, ...data });
}));

router.get('/lead-volume.csv', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res);
  if (!range) return;
  const data = await leadVolume(range.fromDt, range.toDt, { includeTrend: true });
  sendCsv(res, `lead-volume-${range.from}-to-${range.to}.csv`, ['source', 'count'],
    (data.bySource || []).map((s) => [s.source, s.count]));
}));

router.get('/win-loss', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res);
  if (!range) return;
  const data = await winLoss(range.fromDt, range.toDt, { includeCustomers: true });
  res.json({ range: { from: range.from, to: range.to }, ...data });
}));

router.get('/win-loss.csv', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res);
  if (!range) return;
  const data = await winLoss(range.fromDt, range.toDt, { includeCustomers: true });
  sendCsv(res, `win-loss-${range.from}-to-${range.to}.csv`,
    ['name', 'stage', 'lost_reason', 'updated_at'],
    (data.customers || []).map((c) => [c.name, c.stage, c.lost_reason || '', isoDay(c.updated_at)]));
}));

router.get('/pipeline-value', asyncHandler(async (req, res) => {
  const data = await pipelineValueSnapshot();
  res.json(data);
}));

router.get('/pipeline-value.csv', asyncHandler(async (req, res) => {
  const data = await pipelineValueSnapshot();
  sendCsv(res, 'pipeline-value-live.csv', ['stage', 'label', 'value'],
    (data.byStage || []).map((s) => [s.stage, s.label, s.value]));
}));

router.get('/customers', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const customers = await listCustomers(range.fromDt, range.toDt);
  res.json({ range: { from: range.from, to: range.to }, customers });
}));

router.get('/customers.csv', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const customers = await listCustomers(range.fromDt, range.toDt);
  sendCsv(res, `customers-${range.from}-to-${range.to}.csv`,
    ['name', 'type', 'stage', 'source', 'lost_reason', 'created_at'],
    customers.map((c) => [c.name, c.customer_type, c.stage, c.source, c.lost_reason || '', isoDay(c.created_at)]));
}));

router.get('/jobs', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const jobs = await listJobs(range.fromDt, range.toDt);
  res.json({ range: { from: range.from, to: range.to }, jobs });
}));

router.get('/jobs.csv', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const jobs = await listJobs(range.fromDt, range.toDt);
  sendCsv(res, `jobs-${range.from}-to-${range.to}.csv`,
    ['title', 'status', 'customer', 'start_date', 'end_date', 'created_at'],
    jobs.map((j) => [j.title, j.status, j.customer_name, j.start_date || '', j.end_date || '', isoDay(j.created_at)]));
}));

router.get('/invoices', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const includeTotals = canSeeLabourCosts(req.user);
  const invoices = await listInvoices(range.fromDt, range.toDt, { includeTotals });
  res.json({ range: { from: range.from, to: range.to }, include_totals: includeTotals, invoices });
}));

router.get('/invoices.csv', asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const includeTotals = canSeeLabourCosts(req.user);
  const invoices = await listInvoices(range.fromDt, range.toDt, { includeTotals });
  const header = includeTotals
    ? ['ref', 'status', 'customer', 'total', 'amount_due', 'created_at']
    : ['ref', 'status', 'customer', 'created_at'];
  const rows = invoices.map((inv) => {
    const cols = [inv.ref, inv.status, inv.customer_name];
    if (includeTotals) cols.push(inv.total, inv.amount_due);
    cols.push(isoDay(inv.created_at));
    return cols;
  });
  sendCsv(res, `invoices-${range.from}-to-${range.to}.csv`, header, rows);
}));

router.get('/profitability', requireAdmin, asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const data = await listProfitability(range.fromDt, range.toDt);
  res.json({ range: { from: range.from, to: range.to }, ...data });
}));

router.get('/profitability.csv', requireAdmin, asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const data = await listProfitability(range.fromDt, range.toDt);
  sendCsv(res, `profitability-${range.from}-to-${range.to}.csv`,
    ['title', 'customer', 'quoted_ex_vat', 'hours', 'labour_cost', 'after_labour', 'margin_percent', 'created_at'],
    (data.jobs || []).map((j) => [
      j.title, j.customer_name, j.net_value, j.actual_hours, j.actual_labour_cost,
      j.gross_profit, j.margin_percent ?? '', isoDay(j.created_at),
    ]));
}));

router.get('/profitability-labour.csv', requireAdmin, asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res, { required: true });
  if (!range) return;
  const data = await listProfitability(range.fromDt, range.toDt);
  sendCsv(res, `profitability-labour-${range.from}-to-${range.to}.csv`,
    ['name', 'hours', 'labour_cost'],
    (data.labour || []).map((row) => [row.name, row.hours, row.labour_cost]));
}));

module.exports = router;

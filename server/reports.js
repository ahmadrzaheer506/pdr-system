'use strict';

/**
 * Management reports (requirements 14.1–14.3): lead volume, customer win/loss,
 * live pipeline value, generated lists, and Director-only job profitability.
 */
const { Op, fn, col, literal } = require('sequelize');
const { Lead, Quote, Customer, Job, Invoice, Timesheet, User, Appointment, Task } = require('./models');
const { STAGES, ACTIVE_PIPELINE_STAGES, STAGE_LABELS } = require('./services/pipeline');
const { LEAD_PIPELINE_VALUE_SQL } = require('./pipelineFilters');
const invoicePayments = require('./invoicePayments');
const { ymdInZone, addCalendarDays, zoneDayStart, zoneDayEnd } = require('./ukTime');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RANGE_DAYS = 30;

function todayIso() {
  return ymdInZone();
}

function daysAgoIso(days) {
  return addCalendarDays(todayIso(), -days);
}

/**
 * Inclusive `from`/`to` (YYYY-MM-DD). Omitted pair defaults to the last 30 days
 * unless `required` is set (Customers / Jobs / Invoices generate — requirement 14.2).
 * @param {{ from?: unknown, to?: unknown }} query
 * @param {{ required?: boolean }} [opts]
 * @returns {{ from: string, to: string, fromDt: Date, toDt: Date }|{ error: string }}
 */
function parseReportRange(query = {}, { required = false } = {}) {
  const hasFrom = query.from != null && String(query.from).trim() !== '';
  const hasTo = query.to != null && String(query.to).trim() !== '';
  if (required && (!hasFrom || !hasTo)) return { error: 'from and to are required' };
  if (hasFrom !== hasTo) return { error: 'from and to are required together' };

  let from = hasFrom ? String(query.from).trim() : daysAgoIso(DEFAULT_RANGE_DAYS);
  let to = hasTo ? String(query.to).trim() : todayIso();
  if (!DATE_RE.test(from)) return { error: 'Invalid from date' };
  if (!DATE_RE.test(to)) return { error: 'Invalid to date' };
  if (from > to) return { error: 'from must be on or before to' };
  return { from, to, fromDt: zoneDayStart(from), toDt: zoneDayEnd(to) };
}

function winRate(won, lost) {
  const decided = won + lost;
  return decided ? +((won / decided) * 100).toFixed(1) : null;
}

/**
 * Inbox leads created in the window (requirement 14.1 lead volume).
 * @param {Date} fromDt
 * @param {Date} toDt
 * @param {{ includeTrend?: boolean, includeLeads?: boolean }} [opts]
 */
async function leadVolume(fromDt, toDt, { includeTrend = true, includeLeads = false } = {}) {
  const where = { created_at: { [Op.between]: [fromDt, toDt] } };
  const bySource = (await Lead.findAll({
    attributes: ['source', [fn('COUNT', col('id')), 'count']],
    where,
    group: ['source'],
    order: [[literal('count'), 'DESC']],
    raw: true,
  })).map((r) => ({ source: r.source, count: Number(r.count) }));
  const total = bySource.reduce((s, r) => s + r.count, 0);
  const result = { total, bySource };
  if (includeTrend) {
    result.trend = (await Lead.findAll({
      attributes: [[literal("DATE(created_at AT TIME ZONE 'Europe/London')"), 'day'], [fn('COUNT', col('id')), 'leads']],
      where,
      group: [literal("DATE(created_at AT TIME ZONE 'Europe/London')")],
      order: [[literal('day'), 'ASC']],
      raw: true,
    })).map((r) => ({ day: r.day, leads: Number(r.leads) }));
  }
  if (includeLeads) {
    const rows = await Lead.findAll({
      where,
      attributes: ['id', 'customer_id', 'source', 'subject', 'message', 'status', 'created_at'],
      include: [{ model: Customer, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
    });
    result.leads = rows.map((row) => {
      const o = plainRow(row);
      return {
        id: o.id,
        customer_id: o.customer_id,
        customer_name: o.Customer?.name || o.customer?.name || '',
        source: o.source,
        subject: o.subject || null,
        message: o.message || null,
        status: o.status,
        created_at: o.created_at,
      };
    });
  }
  return result;
}

/**
 * Enquiries currently WON or LOST whose updated_at falls in the window (14.1).
 * Names come from the customer record so the win/loss report still lists people.
 * @param {Date} fromDt
 * @param {Date} toDt
 * @param {{ includeCustomers?: boolean }} [opts]
 */
async function winLoss(fromDt, toDt, { includeCustomers = true } = {}) {
  const rows = await Lead.findAll({
    where: {
      stage: { [Op.in]: ['WON', 'LOST'] },
      updated_at: { [Op.between]: [fromDt, toDt] },
    },
    attributes: ['id', 'ref', 'customer_id', 'stage', 'lost_reason', 'updated_at'],
    include: [{ model: Customer, attributes: ['id', 'name'] }],
    order: [['updated_at', 'DESC']],
  });
  const list = rows.map((row) => (typeof row.toJSON === 'function' ? row.toJSON() : row));
  let won = 0;
  let lost = 0;
  const reasonCounts = {};
  for (const row of list) {
    if (row.stage === 'WON') won += 1;
    else {
      lost += 1;
      const reason = (row.lost_reason && String(row.lost_reason).trim()) || 'No reason';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }
  const byReason = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  const result = { won, lost, winRate: winRate(won, lost), byReason };
  if (includeCustomers) {
    result.customers = list.map((row) => ({
      id: row.customer_id,
      lead_id: row.id,
      ref: row.ref || null,
      name: row.Customer?.name || row.customer?.name || '',
      stage: row.stage,
      lost_reason: row.lost_reason || null,
      updated_at: row.updated_at,
    }));
  }
  return result;
}

/**
 * Live pipeline value — latest sent/draft quote per enquiry, Enquiry → Follow-up
 * (requirement 4.5). Matches the board cards and column totals. Not date-windowed.
 */
async function pipelineValueSnapshot() {
  const rows = await Lead.findAll({
    where: { stage: { [Op.in]: ACTIVE_PIPELINE_STAGES } },
    attributes: ['id', 'stage', [literal(LEAD_PIPELINE_VALUE_SQL), 'pipeline_value']],
    raw: true,
  });
  const byStageMap = {};
  let pipelineValue = 0;
  let pipelineCount = 0;
  for (const row of rows || []) {
    const value = Number(row.pipeline_value || 0);
    if (value > 0) pipelineCount += 1;
    pipelineValue += value;
    byStageMap[row.stage] = (byStageMap[row.stage] || 0) + value;
  }
  return {
    pipelineValue: roundMoney(pipelineValue),
    pipelineCount,
    byStage: ACTIVE_PIPELINE_STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      value: roundMoney(byStageMap[stage] || 0),
    })),
  };
}

function isoDay(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * One point per calendar day so the home trend chart does not skip empty days.
 */
function fillDailyTrend(fromIso, toIso, points) {
  const byDay = {};
  for (const row of points || []) {
    const day = isoDay(row.day);
    if (day) byDay[day] = Number(row.leads) || 0;
  }
  const trend = [];
  for (let day = fromIso; day <= toIso; day = addCalendarDays(day, 1)) {
    trend.push({ day, leads: byDay[day] || 0 });
  }
  return trend;
}

/**
 * Home dashboard payload: 14.1 metrics plus visits, quotes, job average,
 * charts, open tasks, and invoice balances.
 */
async function dashboardHome(fromDt, toDt, { from, to, today } = {}) {
  const fromIso = from || isoDay(fromDt);
  const toIso = to || isoDay(toDt);
  const todayIso = today || ymdInZone();
  const [
    leads,
    outcome,
    pipeline,
    visits,
    quotesRow,
    jobsRow,
    stageRows,
    openTasks,
    overdueTasks,
    invoices,
  ] = await Promise.all([
    leadVolume(fromDt, toDt, { includeTrend: true }),
    winLoss(fromDt, toDt, { includeCustomers: false }),
    pipelineValueSnapshot(),
    Appointment.count({
      where: {
        start: { [Op.between]: [fromDt, toDt] },
        status: { [Op.ne]: 'cancelled' },
      },
    }),
    Quote.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'count'],
        [fn('COALESCE', fn('SUM', col('total')), 0), 'value'],
      ],
      where: { sent_at: { [Op.between]: [fromDt, toDt] } },
      raw: true,
    }),
    Job.findOne({
      attributes: [
        [fn('AVG', col('value')), 'avg'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        created_at: { [Op.between]: [fromDt, toDt] },
        value: { [Op.gt]: 0 },
      },
      raw: true,
    }),
    Lead.findAll({
      attributes: ['stage', [fn('COUNT', col('id')), 'count']],
      group: ['stage'],
      raw: true,
    }),
    Task.count({ where: { status: 'open' } }),
    Task.count({ where: { status: 'open', due_date: { [Op.lt]: todayIso } } }),
    invoicePayments.balanceSummary(),
  ]);

  const quotesSent = Number(quotesRow?.count || 0);
  const quotesValue = roundMoney(quotesRow?.value || 0);
  const jobCount = Number(jobsRow?.count || 0);
  const avgJobValue = jobCount ? roundMoney(jobsRow.avg) : null;
  const stageMap = Object.fromEntries((stageRows || []).map((row) => [row.stage, Number(row.count)]));

  return {
    leads: {
      total: leads.total,
      bySource: leads.bySource || [],
      trend: fillDailyTrend(fromIso, toIso, leads.trend),
    },
    visits,
    quotesSent,
    quotesValue,
    won: outcome.won,
    lost: outcome.lost,
    winRate: outcome.winRate,
    avgJobValue,
    pipelineValue: pipeline.pipelineValue,
    pipelineCount: pipeline.pipelineCount,
    customersByStage: STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: stageMap[stage] || 0,
    })),
    tasks: { open: openTasks, overdue: overdueTasks },
    invoices: {
      outstanding: invoices.outstanding,
      overdue: invoices.overdue,
      overdue_count: invoices.overdue_count,
    },
  };
}

function createdInRange(fromDt, toDt) {
  return { created_at: { [Op.between]: [fromDt, toDt] } };
}

function plainRow(row) {
  return typeof row.toJSON === 'function' ? row.toJSON() : row;
}

/**
 * Customer rows created in the window (requirement 14.2).
 */
async function listCustomers(fromDt, toDt) {
  const rows = await Customer.findAll({
    where: createdInRange(fromDt, toDt),
    attributes: ['id', 'name', 'customer_type', 'stage', 'source', 'lost_reason', 'created_at'],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return rows.map((row) => {
    const o = plainRow(row);
    return {
      id: o.id,
      name: o.name,
      customer_type: o.customer_type,
      stage: o.stage,
      source: o.source,
      lost_reason: o.lost_reason || null,
      created_at: o.created_at,
    };
  });
}

/**
 * Jobs created in the window (requirement 14.2). No costing columns (14.3).
 */
async function listJobs(fromDt, toDt) {
  const rows = await Job.findAll({
    where: createdInRange(fromDt, toDt),
    attributes: ['id', 'title', 'status', 'start_date', 'end_date', 'created_at', 'customer_id'],
    include: [{ model: Customer, attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return rows.map((row) => {
    const o = plainRow(row);
    return {
      id: o.id,
      title: o.title,
      status: o.status,
      customer_id: o.customer_id,
      customer_name: o.Customer?.name || o.customer?.name || '',
      start_date: o.start_date || null,
      end_date: o.end_date || null,
      created_at: o.created_at,
    };
  });
}

/**
 * Invoices created in the window (requirement 14.2). Totals omitted when
 * `includeTotals` is false (restricted office — requirement 1.6).
 */
async function listInvoices(fromDt, toDt, { includeTotals = true } = {}) {
  const rows = await Invoice.findAll({
    where: createdInRange(fromDt, toDt),
    attributes: ['id', 'ref', 'status', 'total', 'amount_paid', 'due_now', 'created_at', 'customer_id'],
    include: [{ model: Customer, attributes: ['id', 'name'] }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return rows.map((row) => {
    const o = plainRow(row);
    const item = {
      id: o.id,
      ref: o.ref,
      status: o.status,
      customer_id: o.customer_id,
      customer_name: o.Customer?.name || o.customer?.name || '',
      created_at: o.created_at,
    };
    if (includeTotals) {
      item.total = Number(o.total || 0);
      item.amount_due = invoicePayments.outstanding(o);
    }
    return item;
  });
}

const COSTED_SHEET_STATUSES = Object.freeze(['completed', 'approved']);
/** Quoted job.value is treated as inc-VAT, same as Timesheets Costing. */
const QUOTED_VAT_DIVISOR = 1.2;
const UNDERQUOTED_MARGIN_PCT = 20;

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function roundHours(minutes) {
  return Math.round(((Number(minutes) || 0) / 60) * 100) / 100;
}

/**
 * Quoted ex-VAT vs clocked labour (requirement 14.3). Same maths as Timesheets Costing.
 * @param {number} quotedValue
 * @param {{ worked_minutes?: number, labour_cost?: number }[]} sheets
 */
function labourVsQuote(quotedValue, sheets) {
  const labour = roundMoney(sheets.reduce((s, t) => s + (Number(t.labour_cost) || 0), 0));
  const actual_hours = roundHours(sheets.reduce((s, t) => s + (Number(t.worked_minutes) || 0), 0));
  const value = Number(quotedValue) || 0;
  const net_value = roundMoney(value / QUOTED_VAT_DIVISOR);
  const margin_percent = net_value
    ? Math.round(((net_value - labour) / net_value) * 1000) / 10
    : null;
  return {
    actual_hours,
    actual_labour_cost: labour,
    net_value,
    gross_profit: roundMoney(net_value - labour),
    margin_percent,
    underquoted: margin_percent !== null && margin_percent < UNDERQUOTED_MARGIN_PCT,
  };
}

function timesheetsOf(jobPlain) {
  return jobPlain.Timesheets || jobPlain.timesheets || [];
}

/**
 * Jobs created in the window (requirement 14.3): profitability rows with clocked
 * hours, plus hours/cost by operative on those jobs.
 * @param {Date} fromDt
 * @param {Date} toDt
 */
async function listProfitability(fromDt, toDt) {
  const rows = await Job.findAll({
    where: createdInRange(fromDt, toDt),
    attributes: ['id', 'title', 'status', 'value', 'created_at', 'customer_id'],
    include: [
      { model: Customer, attributes: ['id', 'name'] },
      {
        model: Timesheet,
        required: false,
        where: { status: { [Op.in]: COSTED_SHEET_STATUSES } },
        attributes: ['id', 'user_id', 'worked_minutes', 'labour_cost'],
        include: [{ model: User, attributes: ['id', 'name'] }],
      },
    ],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });

  const jobs = [];
  const labourMap = new Map();
  for (const row of rows) {
    const o = plainRow(row);
    const sheets = timesheetsOf(o);
    const cost = labourVsQuote(o.value, sheets);
    if (cost.actual_hours > 0) {
      jobs.push({
        id: o.id,
        title: o.title,
        status: o.status,
        customer_id: o.customer_id,
        customer_name: o.Customer?.name || o.customer?.name || '',
        created_at: o.created_at,
        ...cost,
      });
    }
    for (const sheet of sheets) {
      const uid = sheet.user_id;
      if (uid == null) continue;
      const name = sheet.User?.name || sheet.user?.name || 'Unknown';
      const cur = labourMap.get(uid) || { user_id: uid, name, minutes: 0, labour_cost: 0 };
      cur.minutes += Number(sheet.worked_minutes) || 0;
      cur.labour_cost += Number(sheet.labour_cost) || 0;
      labourMap.set(uid, cur);
    }
  }

  const labour = [...labourMap.values()]
    .map((row) => ({
      user_id: row.user_id,
      name: row.name,
      hours: roundHours(row.minutes),
      labour_cost: roundMoney(row.labour_cost),
    }))
    .sort((a, b) => b.labour_cost - a.labour_cost || a.name.localeCompare(b.name));

  return { jobs, labour };
}

module.exports = {
  DEFAULT_RANGE_DAYS,
  parseReportRange,
  winRate,
  leadVolume,
  winLoss,
  pipelineValueSnapshot,
  fillDailyTrend,
  dashboardHome,
  listCustomers,
  listJobs,
  listInvoices,
  listProfitability,
};

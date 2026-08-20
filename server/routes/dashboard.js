// Lead & Conversion Dashboard (PRD §10.5)
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { ACTIVE_PIPELINE_STAGES } = require('../services/pipeline');

const router = express.Router();
router.use(requireAuth, requireOffice);

router.get('/', (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);

  const leadsBySource = db.prepare(
    `SELECT source, COUNT(*) AS count FROM leads WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY source ORDER BY count DESC`
  ).all(dateFrom, dateTo);
  const totalLeads = leadsBySource.reduce((s, r) => s + r.count, 0);

  const visits = db.prepare(
    `SELECT COUNT(*) AS c FROM appointments WHERE date(created_at) BETWEEN date(?) AND date(?) AND status != 'cancelled'`
  ).get(dateFrom, dateTo).c;

  const quotesSent = db.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS value FROM quotes WHERE sent_at IS NOT NULL AND date(sent_at) BETWEEN date(?) AND date(?)`
  ).get(dateFrom, dateTo);

  const won = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS value FROM quotes WHERE status = 'accepted' AND date(decided_at) BETWEEN date(?) AND date(?)`).get(dateFrom, dateTo);
  const lost = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS value FROM quotes WHERE status = 'declined' AND date(decided_at) BETWEEN date(?) AND date(?)`).get(dateFrom, dateTo);
  const decided = won.c + lost.c;
  const winRate = decided ? +((won.c / decided) * 100).toFixed(1) : null;
  const avgJobValue = won.c ? +(won.value / won.c).toFixed(2) : 0;

  const pipelinePlaceholders = ACTIVE_PIPELINE_STAGES.map(() => '?').join(',');
  const pipelineValue = db.prepare(
    `SELECT COALESCE(SUM(q.total),0) AS value, COUNT(DISTINCT c.id) AS count
     FROM customers c JOIN quotes q ON q.customer_id = c.id AND q.status IN ('sent','draft')
     WHERE c.stage IN (${pipelinePlaceholders})`
  ).get(...ACTIVE_PIPELINE_STAGES);

  const trend = db.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS leads FROM leads WHERE date(created_at) BETWEEN date(?) AND date(?) GROUP BY day ORDER BY day`
  ).all(dateFrom, dateTo);

  const stageCounts = db.prepare(`SELECT stage, COUNT(*) AS c FROM customers GROUP BY stage`).all();

  const openTasks = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status = 'open'`).get().c;
  const overdueTasks = db.prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status = 'open' AND due_date IS NOT NULL AND date(due_date) < date('now')`).get().c;
  const outstanding = db.prepare(`SELECT COALESCE(SUM(total - amount_paid),0) AS v FROM invoices WHERE status IN ('sent','part_paid','overdue')`).get().v;
  const overdueInvoices = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(total - amount_paid),0) AS v FROM invoices WHERE status = 'overdue'`).get();

  res.json({
    range: { from: dateFrom, to: dateTo },
    leads: { total: totalLeads, bySource: leadsBySource },
    visits,
    quotesSent: quotesSent.c,
    quotesValue: quotesSent.value,
    won: won.c, lost: lost.c, winRate,
    avgJobValue,
    pipelineValue: pipelineValue.value,
    pipelineCount: pipelineValue.count,
    trend,
    stageCounts,
    tasks: { open: openTasks, overdue: overdueTasks },
    invoicing: { outstanding, overdueCount: overdueInvoices.c, overdueValue: overdueInvoices.v },
  });
});

module.exports = router;

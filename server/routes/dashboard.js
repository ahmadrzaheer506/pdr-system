'use strict';

const express = require('express');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { parseReportRange, dashboardHome } = require('../reports');

const router = express.Router();
router.use(requireAuth, requireOffice);

/**
 * Home dashboard: 14.1 lead volume, win/loss, live pipeline value, plus
 * visits, quotes sent, job average, charts, tasks, and invoice balances.
 */
router.get('/', asyncHandler(async (req, res) => {
  const range = parseReportRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });
  const home = await dashboardHome(range.fromDt, range.toDt, {
    from: range.from,
    to: range.to,
  });
  res.json({
    range: { from: range.from, to: range.to },
    ...home,
  });
}));

module.exports = router;

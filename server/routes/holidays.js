const express = require('express');
const { Op } = require('sequelize');
const { HolidayRequest, User } = require('../models');
const { getSetting, plain } = require('../db');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const holidayRequests = require('../holidayRequests');

const router = express.Router();

function sendServiceError(res, err) {
  const body = { error: err.message };
  if (err.notice_days != null) body.notice_days = err.notice_days;
  if (err.remaining != null) body.remaining = err.remaining;
  if (err.allowance != null) body.allowance = err.allowance;
  if (err.year != null) body.year = err.year;
  res.status(err.status || 400).json(body);
}

router.get('/', requireAuth, requireOffice, asyncHandler(async (req, res) => {
  const { status, user_id } = req.query;
  const where = {};
  if (status) where.status = status;
  if (user_id) where.user_id = user_id;
  const rows = await HolidayRequest.findAll({
    where,
    include: [{ model: User, attributes: ['name', 'color', 'holiday_allowance', 'avatar_file', 'email', 'phone'] }],
    order: [['created_at', 'DESC']],
  });
  const balances = await holidayRequests.balancesForUsers(rows.map((h) => ({
    id: h.user_id,
    holiday_allowance: h.User?.holiday_allowance,
  })));
  res.json({
    holidays: rows.map((h) => {
      const o = plain(h);
      o.user_name = o.User?.name;
      o.color = o.User?.color;
      o.avatar_file = o.User?.avatar_file || null;
      o.email = o.User?.email || null;
      o.phone = o.User?.phone || null;
      o.kind = holidayRequests.kindFromDates(o.start_date, o.end_date);
      delete o.User;
      Object.assign(o, balances[h.user_id] || {});
      return o;
    }),
    notice_days: await getSetting('holiday_notice_days'),
    year: holidayRequests.currentYear(),
  });
}));

router.get('/calendar', requireAuth, requireOffice, asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const rows = await HolidayRequest.findAll({
    attributes: ['id', 'user_id', 'start_date', 'end_date'],
    where: {
      status: 'approved',
      start_date: { [Op.lte]: to || '2100-01-01' },
      end_date: { [Op.gte]: from || '1900-01-01' },
    },
    include: [{ model: User, attributes: ['name', 'color', 'avatar_file', 'email', 'phone'] }],
  });
  res.json({
    holidays: rows.map((h) => {
      const o = plain(h);
      o.user_name = o.User?.name;
      o.color = o.User?.color;
      o.avatar_file = o.User?.avatar_file || null;
      o.email = o.User?.email || null;
      o.phone = o.User?.phone || null;
      o.kind = holidayRequests.kindFromDates(o.start_date, o.end_date);
      delete o.User;
      return o;
    }),
  });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  try {
    const created = await holidayRequests.createRequest(req.user, req.body || {});
    res.json(created);
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.put('/:id/decision', requireAuth, requireOffice, asyncHandler(async (req, res) => {
  try {
    res.json(await holidayRequests.decideRequest(req.user, req.params.id, req.body || {}));
  } catch (err) {
    sendServiceError(res, err);
  }
}));

router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    res.json(await holidayRequests.withdrawRequest(req.user, req.params.id));
  } catch (err) {
    sendServiceError(res, err);
  }
}));

module.exports = router;

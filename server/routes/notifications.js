'use strict';

const express = require('express');
const { Notification, User } = require('../models');
const { requireAuth, asyncHandler } = require('../auth');
const { serialize, KIND_TITLES } = require('../notifications');
const { parsePreferences, catalog, emptyPrefs } = require('../notificationPrefs');

const router = express.Router();
router.use(requireAuth);

router.get('/preferences', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'notification_prefs'] });
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const parsed = parsePreferences(user.notification_prefs || {}, user.role);
  const preferences = parsed.value || emptyPrefs(user.role);
  res.json({ kinds: catalog(user.role, KIND_TITLES), preferences });
}));

router.put('/preferences', asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const parsed = parsePreferences(req.body, user.role);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  await user.update({ notification_prefs: parsed.value });
  res.json({ kinds: catalog(user.role, KIND_TITLES), preferences: parsed.value });
}));

router.get('/', asyncHandler(async (req, res) => {
  const where = { user_id: req.user.id };
  const [rows, unread] = await Promise.all([
    Notification.findAll({
      where,
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit: 50,
    }),
    Notification.count({ where: { ...where, read_at: null } }),
  ]);
  res.json({
    notifications: rows.map((row) => serialize(row, req.user.role)),
    unread,
  });
}));

router.put('/read-all', asyncHandler(async (req, res) => {
  const now = new Date();
  await Notification.update(
    { read_at: now },
    { where: { user_id: req.user.id, read_at: null } },
  );
  res.json({ ok: true });
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  const row = await Notification.findOne({
    where: { id: req.params.id, user_id: req.user.id },
  });
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  if (!row.read_at) await row.update({ read_at: new Date() });
  res.json({ ok: true });
}));

module.exports = router;

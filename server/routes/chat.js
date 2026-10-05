const express = require('express');
const { TeamMessage, User } = require('../models');
const { requireAuth, asyncHandler } = require('../auth');
const { plain } = require('../db');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const rows = await TeamMessage.findAll({
    include: [{ model: User, attributes: ['name', 'color', 'role'] }],
    order: [['created_at', 'DESC']],
    limit: 100,
  });
  const messages = rows.reverse().map((tm) => {
    const o = plain(tm);
    o.user_name = o.User?.name;
    o.color = o.User?.color;
    o.role = o.User?.role;
    delete o.User;
    return o;
  });
  res.json({ messages });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
  const created = await TeamMessage.create({ user_id: req.user.id, body: body.trim() });
  res.json({ id: created.id });
}));

module.exports = router;

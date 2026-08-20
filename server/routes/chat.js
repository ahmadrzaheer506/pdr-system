// Team communication — all-staff channel (PRD §11.3). Per-job chat lives in routes/jobs.js.
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT tm.*, u.name AS user_name, u.color, u.role FROM team_messages tm JOIN users u ON u.id = tm.user_id ORDER BY tm.created_at DESC LIMIT 100'
  ).all();
  res.json({ messages: rows.reverse() });
});

router.post('/', (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
  const r = db.prepare('INSERT INTO team_messages (user_id, body) VALUES (?,?)').run(req.user.id, body.trim());
  res.json({ id: r.lastInsertRowid });
});

module.exports = router;

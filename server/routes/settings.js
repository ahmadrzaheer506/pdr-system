// Settings, users/staff management, integration status (PRD §16 — admin only for settings/integrations)
const express = require('express');
const { db, allSettings, setSetting, pj, j } = require('../db');
const { requireAuth, requireOffice, requireAdmin, hashPassword } = require('../auth');
const registry = require('../integrations/registry');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireOffice, (req, res) => res.json({ settings: allSettings() }));

router.put('/', requireAdmin, (req, res) => {
  for (const [key, value] of Object.entries(req.body || {})) setSetting(key, value);
  res.json({ ok: true, settings: allSettings() });
});

router.get('/integrations', requireOffice, (req, res) => {
  res.json({ integrations: registry.all(), events: registry.recentEvents(30) });
});

// ---------- staff/user management (Owner/Admin only, per Roles matrix §16) ----------
router.get('/users', requireOffice, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, phone, role, skills, is_driver, active, holiday_allowance, color, created_at FROM users ORDER BY role, name').all();
  res.json({ users: rows.map((u) => ({ ...u, skills: pj(u.skills, []) })) });
});

router.post('/users', requireAdmin, (req, res) => {
  const { name, email, phone, password, role, skills, is_driver, holiday_allowance, color } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  if (!['ADMIN', 'OFFICE', 'STAFF'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const r = db.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, skills, is_driver, holiday_allowance, color) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(name, email.toLowerCase().trim(), phone || null, hashPassword(password), role, j(skills || []), is_driver ? 1 : 0, holiday_allowance || 28, color || '#64748b');
    res.json({ id: r.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That email is already in use' : err.message });
  }
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { name, phone, role, skills, is_driver, active, holiday_allowance, color, password } = req.body || {};
  db.prepare(
    `UPDATE users SET name = ?, phone = ?, role = ?, skills = ?, is_driver = ?, active = ?, holiday_allowance = ?, color = ? WHERE id = ?`
  ).run(
    name ?? u.name, phone ?? u.phone, role ?? u.role, skills !== undefined ? j(skills) : u.skills,
    is_driver !== undefined ? (is_driver ? 1 : 0) : u.is_driver, active !== undefined ? (active ? 1 : 0) : u.active,
    holiday_allowance ?? u.holiday_allowance, color ?? u.color, u.id
  );
  if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u.id);
  res.json({ ok: true });
});

module.exports = router;

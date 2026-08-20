const express = require('express');
const { db } = require('../db');
const { signToken, verifyPassword, hashPassword, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
  if (!user || !verifyPassword(user, password)) return res.status(401).json({ error: 'Wrong email or password' });
  if (!user.active) return res.status(401).json({ error: 'Account disabled' });
  const token = signToken(user);
  res.cookie('pdr_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env.APP_URL || '').startsWith('https'),
    maxAge: 30 * 24 * 3600 * 1000,
  });
  const { password_hash, ...safe } = user;
  res.json({ user: safe, token });
});

router.post('/logout', (req, res) => {
  res.clearCookie('pdr_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.put('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(user, current || '')) return res.status(400).json({ error: 'Current password is wrong' });
  if (!next || next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

module.exports = router;

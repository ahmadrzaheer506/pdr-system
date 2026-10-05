const express = require('express');
const { Op } = require('sequelize');
const { User } = require('../models');
const { plain } = require('../db');
const {
  issueSession, clearSession, verifyPassword, hashPassword, passwordError,
  requireAuth, asyncHandler, readSessionPayload,
} = require('../auth');
const { hashResetToken } = require('../passwordReset');
const { issueResetEmail } = require('../passwordMail');
const { logSecurityEvent, SECURITY_ACTIONS, nextTokenVersion } = require('../securityAudit');
const avatars = require('../avatars');

const router = express.Router();

function publicUser(row) {
  const {
    password_hash,
    password_reset_token,
    password_reset_expires,
    token_version,
    ...safe
  } = row;
  return safe;
}

/**
 * Email/password sign-in against an existing user row.
 * No public registration (accounts are created under requirement 1.7).
 * Verifies credentials (requirement 1.2) and issues an httpOnly session cookie (requirement 1.3).
 */
router.post('/login', asyncHandler(async (req, res) => {
  const email = String((req.body || {}).email || '').trim();
  const password = (req.body || {}).password;
  if (!email || password == null || password === '') {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const pwdErr = passwordError(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  const user = await User.findOne({
    where: { email: { [Op.iLike]: email } },
  });
  const row = plain(user);
  if (!row || !verifyPassword(row, password)) {
    await logSecurityEvent({
      actorUserId: null,
      targetUserId: row ? row.id : null,
      action: SECURITY_ACTIONS.LOGIN_FAILURE,
      detail: email,
    });
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  if (!row.active) {
    await logSecurityEvent({
      actorUserId: null,
      targetUserId: row.id,
      action: SECURITY_ACTIONS.LOGIN_FAILURE,
      detail: email,
    });
    return res.status(401).json({ error: 'Account disabled' });
  }

  issueSession(res, row);
  await logSecurityEvent({
    actorUserId: row.id,
    targetUserId: row.id,
    action: SECURITY_ACTIONS.LOGIN_SUCCESS,
  });
  res.json({ user: publicUser(row) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const payload = readSessionPayload(req);
  clearSession(res);
  if (payload && payload.uid) {
    await logSecurityEvent({
      actorUserId: payload.uid,
      targetUserId: payload.uid,
      action: SECURITY_ACTIONS.LOGOUT,
    });
  }
  res.json({ ok: true });
}));

router.get('/me', asyncHandler(requireAuth), (req, res) => {
  res.json({ user: req.user });
});

/**
 * Signed-in user updates their own display name. Email stays admin-managed.
 */
router.put('/profile', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (name.length > 120) return res.status(400).json({ error: 'Name is too long' });

  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account disabled' });
  user.name = name;
  await user.save();
  res.json({ user: publicUser(plain(user)) });
}));

router.get('/avatar', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const requested = Number(req.query.user);
  const ownId = Number(req.user.id);
  const userId = Number.isInteger(requested) && requested > 0 ? requested : ownId;
  if (userId === ownId) {
    avatars.sendAvatar(res, ownId, req.user.avatar_file);
    return;
  }
  const other = await User.findByPk(userId, { attributes: ['id', 'avatar_file'] });
  if (!other) return res.status(404).json({ error: 'Photo not found' });
  avatars.sendAvatar(res, other.id, other.avatar_file);
}));

router.post('/avatar', asyncHandler(requireAuth), avatars.handleUpload, asyncHandler(async (req, res) => {
  const saved = avatars.saveAvatar(req.user.id, req.file);
  if (saved.error) return res.status(saved.status || 400).json({ error: saved.error });
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account disabled' });
  user.avatar_file = saved.avatar_file;
  await user.save();
  res.json({ user: publicUser(plain(user)) });
}));

router.delete('/avatar', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account disabled' });
  avatars.removeAvatar(req.user.id);
  user.avatar_file = null;
  await user.save();
  res.json({ user: publicUser(plain(user)) });
}));

router.put('/password', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!user || !verifyPassword(plain(user), current || '')) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  const pwdErr = passwordError(next);
  if (pwdErr) return res.status(400).json({ error: pwdErr });
  user.password_hash = hashPassword(next);
  user.password_reset_token = null;
  user.password_reset_expires = null;
  user.token_version = nextTokenVersion(user);
  await user.save();
  await logSecurityEvent({
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    action: SECURITY_ACTIONS.PASSWORD_CHANGE,
  });
  res.json({ ok: true });
}));

const FORGOT_MESSAGE = 'If that email is on an account, we have sent a reset link.';
const INACTIVE_ACCOUNT_MESSAGE = 'This account is inactive. Ask an administrator to reactivate it before you can reset the password.';

/**
 * Public forgot-password (requirement 1.7). Unknown emails get the same 200 body so they are not enumerable.
 * Inactive accounts are told explicitly so the person knows why no mail arrives.
 */
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const emailAddr = String((req.body || {}).email || '').trim();
  if (!emailAddr) return res.status(400).json({ error: 'Email is required' });

  const user = await User.findOne({ where: { email: { [Op.iLike]: emailAddr } } });
  const row = plain(user);
  if (row && !row.active) {
    await logSecurityEvent({
      actorUserId: null,
      targetUserId: row.id,
      action: SECURITY_ACTIONS.FORGOT_PASSWORD,
      detail: emailAddr,
    });
    return res.status(403).json({ error: INACTIVE_ACCOUNT_MESSAGE });
  }
  if (row && row.active) {
    try {
      await issueResetEmail(user);
    } catch (err) {
      return res.status(500).json({ error: 'Could not send the reset email' });
    }
  }
  await logSecurityEvent({
    actorUserId: null,
    targetUserId: row ? row.id : null,
    action: SECURITY_ACTIONS.FORGOT_PASSWORD,
    detail: emailAddr,
  });
  res.json({ ok: true, message: FORGOT_MESSAGE });
}));

/**
 * Consume a forgot-password token and set a new password (requirement 1.7).
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
  const token = String((req.body || {}).token || '');
  const password = (req.body || {}).password;
  if (!token) return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  const pwdErr = passwordError(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  const hash = hashResetToken(token);
  const user = await User.findOne({
    where: {
      password_reset_token: hash,
      password_reset_expires: { [Op.gt]: new Date() },
      active: true,
    },
  });
  if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  user.password_hash = hashPassword(password);
  user.password_reset_token = null;
  user.password_reset_expires = null;
  user.token_version = nextTokenVersion(user);
  await user.save();
  await logSecurityEvent({
    actorUserId: null,
    targetUserId: user.id,
    action: SECURITY_ACTIONS.PASSWORD_RESET,
  });
  res.json({ ok: true });
}));

module.exports = router;

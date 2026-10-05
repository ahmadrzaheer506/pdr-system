const express = require('express');
const { Op } = require('sequelize');
const { User, SecurityEvent } = require('../models');
const { allSettings, setSetting, getSetting, plain } = require('../db');
const { requireAuth, requireOffice, requireAdmin, hashPassword, passwordError, isValidRole, asyncHandler } = require('../auth');
const { ROLES } = require('../roles');
const ukTax = require('../services/ukTax');
const quoteFollowups = require('../quoteFollowups');
const { parseAutomation } = require('../automationSchedule');
const messageTemplates = require('../messageTemplates');
const jobChecklists = require('../jobChecklists');
const timesheetRules = require('../timesheetRules');
const branding = require('../branding');
const registry = require('../integrations/registry');
const { logSecurityEvent, SECURITY_ACTIONS, nextTokenVersion } = require('../securityAudit');
const { issueResetEmail, sendWelcomeCredentials } = require('../passwordMail');

/** Keys Company / Templates may persist. Branding is file-upload only. */
const SETTINGS_WRITE_KEYS = new Set([
  'company',
  'uk',
  'vat_rate',
  'quote_validity_days',
  'invoice_due_days',
  'holiday_notice_days',
  'holiday_allowance_days',
  'automation',
  'followups',
  'timesheets',
  'templates',
  'checklist_templates',
]);

/** CIS verification status on a user (requirement 1.8). Aligns with ukTax CIS_RATES plus `none`. */
const CIS_STATUS_VALUES = Object.freeze(['none', 'gross', 'net20', 'higher30']);

/**
 * Parse hourly_cost: non-negative number (requirement 1.8).
 * @returns {{ value: number }|{ error: string }}
 */
function parseHourlyCost(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: 'Hourly cost must be a non-negative number' };
  }
  return { value: n };
}

function parseCisStatus(value) {
  if (!CIS_STATUS_VALUES.includes(value)) {
    return { error: 'Invalid CIS status' };
  }
  return { value };
}

const COMPANY_BANK_KEYS = Object.freeze([
  'bank_name', 'bank_account_name', 'bank_sort_code', 'bank_account_number',
]);

/**
 * Office users must not see company bank details (requirement 17.1 / 14.3-style).
 * @param {object} settings
 * @param {string} [role]
 */
function settingsForRole(settings, role) {
  if (!settings || role === ROLES.ADMIN) return settings;
  const company = { ...(settings.company || {}) };
  for (const key of COMPANY_BANK_KEYS) delete company[key];
  return { ...settings, company };
}

/**
 * Coerce company-level VAT/CIS flags. VAT rate rows stay on parseVatRates (6.3).
 * @returns {{ value: object }|{ error: string }}
 */
function parseUkPayload(uk) {
  if (!uk || typeof uk !== 'object' || Array.isArray(uk)) {
    return { error: 'Invalid UK settings' };
  }
  const next = { ...uk };
  if (uk.vat_registered !== undefined) next.vat_registered = !!uk.vat_registered;
  if (uk.cis_registered !== undefined) next.cis_registered = !!uk.cis_registered;
  if (uk.cis_utr !== undefined) next.cis_utr = String(uk.cis_utr).trim();
  if (uk.default_cis_rate !== undefined && uk.default_cis_rate !== '') {
    const rate = Number(uk.default_cis_rate);
    if (!ukTax.CIS_RATE_VALUES.includes(rate)) {
      return { error: 'Default CIS rate must be 0, 20, or 30' };
    }
    next.default_cis_rate = rate;
  }
  if (uk.vat_rates !== undefined) {
    const parsed = ukTax.parseVatRates(uk.vat_rates);
    if (parsed.error) return { error: parsed.error };
    next.vat_rates = parsed.value;
  }
  return { value: next };
}

const router = express.Router();
router.use(requireAuth);

router.get('/', requireOffice, asyncHandler(async (req, res) => {
  const settings = settingsForRole(await allSettings(), req.user?.role);
  res.json({
    settings: {
      ...settings,
      branding: { ...(settings.branding || {}), uploaded: branding.hasUploadedLogo() },
    },
  });
}));

router.put('/', requireAdmin, asyncHandler(async (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.uk) {
    const current = (await getSetting('uk')) || {};
    const parsed = parseUkPayload({ ...current, ...body.uk });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.uk = parsed.value;
    const standard = Array.isArray(parsed.value.vat_rates)
      ? parsed.value.vat_rates.find((r) => r.code === 'standard')
      : null;
    if (standard) body.vat_rate = standard.rate;
  }
  if (body.company !== undefined) {
    if (!body.company || typeof body.company !== 'object' || Array.isArray(body.company)) {
      return res.status(400).json({ error: 'Invalid company settings' });
    }
    const current = (await getSetting('company')) || {};
    body.company = { ...current, ...body.company };
  }
  if (body.followups !== undefined) {
    const parsed = quoteFollowups.parseFollowups(body.followups);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.followups = parsed.value;
  }
  if (body.automation !== undefined) {
    const parsed = parseAutomation(body.automation);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.automation = parsed.value;
  }
  if (body.templates !== undefined) {
    const current = (await getSetting('templates')) || {};
    const parsed = messageTemplates.parseTemplates({ ...current, ...body.templates });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.templates = parsed.value;
  }
  if (body.checklist_templates !== undefined) {
    const parsed = jobChecklists.parseChecklistTemplates(body.checklist_templates);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.checklist_templates = parsed.value;
  }
  if (body.timesheets !== undefined) {
    const current = (await getSetting('timesheets')) || {};
    const parsed = timesheetRules.parseTimesheets({ ...current, ...body.timesheets });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.timesheets = parsed.value;
  }
  if (body.holiday_allowance_days !== undefined) {
    const parsed = timesheetRules.parseHolidayAllowanceDays(body.holiday_allowance_days);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    body.holiday_allowance_days = parsed.value;
  }
  delete body.branding;
  for (const [key, value] of Object.entries(body)) {
    if (!SETTINGS_WRITE_KEYS.has(key)) continue;
    await setSetting(key, value);
  }
  if (body.automation !== undefined) {
    const { applyIntervalFromSettings } = require('../automation');
    await applyIntervalFromSettings();
  }
  res.json({ ok: true, settings: await allSettings() });
}));

router.get('/logo', (req, res) => branding.sendLogo(res));

router.post('/logo', requireAdmin, branding.handleUpload, asyncHandler(async (req, res) => {
  const saved = await branding.saveLogo(req.file);
  if (saved.error) return res.status(saved.status || 400).json({ error: saved.error });
  res.json({ ok: true, ...saved });
}));

router.get('/integrations', requireOffice, asyncHandler(async (req, res) => {
  res.json({ integrations: await registry.all(req.user.id), events: await registry.recentEvents(30) });
}));

router.get('/users', requireOffice, asyncHandler(async (req, res) => {
  const rows = await User.findAll({
    attributes: ['id', 'name', 'email', 'phone', 'role', 'skills', 'is_driver', 'active', 'holiday_allowance', 'color', 'financials_restricted', 'hourly_cost', 'cis_status', 'created_at', 'avatar_file'],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  res.json({
    users: plain(rows).map((u) => ({
      ...u,
      skills: Array.isArray(u.skills) ? u.skills : [],
      hourly_cost: Number(u.hourly_cost) || 0,
      cis_status: CIS_STATUS_VALUES.includes(u.cis_status) ? u.cis_status : 'none',
    })),
  });
}));

router.post('/users', requireAdmin, asyncHandler(async (req, res) => {
  const { name, email, phone, password, role, skills, is_driver, holiday_allowance, color, financials_restricted, hourly_cost, cis_status } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  if (!isValidRole(role)) return res.status(400).json({ error: 'Invalid role' });
  const pwdErr = passwordError(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });
  const cost = hourly_cost === undefined || hourly_cost === null || hourly_cost === ''
    ? { value: 0 }
    : parseHourlyCost(hourly_cost);
  if (cost.error) return res.status(400).json({ error: cost.error });
  const cis = cis_status === undefined || cis_status === null || cis_status === ''
    ? { value: 'none' }
    : parseCisStatus(cis_status);
  if (cis.error) return res.status(400).json({ error: cis.error });
  const isStaff = role === ROLES.STAFF;
  const allowance = timesheetRules.parseUserHolidayAllowance(holiday_allowance, { allowInherit: true });
  if (allowance.error) return res.status(400).json({ error: allowance.error });
  let nextAllowance = allowance.value;
  if (allowance.inherit) {
    nextAllowance = Number(await getSetting('holiday_allowance_days'));
    if (!Number.isFinite(nextAllowance)) nextAllowance = 28;
  }
  try {
    const created = await User.create({
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      password_hash: hashPassword(password),
      role,
      skills: isStaff ? (skills || []) : [],
      is_driver: isStaff && !!is_driver,
      holiday_allowance: nextAllowance,
      color: color || '#64748b',
      financials_restricted: role === ROLES.OFFICE && !!financials_restricted,
      hourly_cost: cost.value,
      cis_status: cis.value,
    });
    await logSecurityEvent({
      actorUserId: req.user.id,
      targetUserId: created.id,
      action: SECURITY_ACTIONS.USER_CREATE,
      detail: role,
    });
    let emailed = true;
    try {
      await sendWelcomeCredentials({ name, email: email.toLowerCase().trim(), password });
    } catch (_) {
      emailed = false;
    }
    res.json({ id: created.id, emailed });
  } catch (err) {
    res.status(400).json({ error: err.name === 'SequelizeUniqueConstraintError' ? 'That email is already in use' : err.message });
  }
}));

router.put('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const u = await User.findByPk(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { name, email, phone, role, skills, is_driver, active, holiday_allowance, color, password, financials_restricted, hourly_cost, cis_status } = req.body || {};
  if (role !== undefined && !isValidRole(role)) return res.status(400).json({ error: 'Invalid role' });

  const nextRole = role ?? u.role;
  const nextActive = active !== undefined ? !!active : u.active;
  const targetId = Number(req.params.id);

  if (u.active && !nextActive && targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const demotingOrDeactivatingAdmin = u.role === ROLES.ADMIN && u.active
    && (nextRole !== ROLES.ADMIN || !nextActive);
  if (demotingOrDeactivatingAdmin) {
    const admins = await User.count({ where: { role: ROLES.ADMIN, active: true } });
    if (admins <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate or change the role of the last administrator' });
    }
  }

  const nextRestricted = nextRole === ROLES.OFFICE
    ? (financials_restricted !== undefined ? !!financials_restricted : !!u.financials_restricted)
    : false;

  const allowance = timesheetRules.parseUserHolidayAllowance(holiday_allowance);
  if (allowance.error) return res.status(400).json({ error: allowance.error });
  const nextAllowance = allowance.omit ? u.holiday_allowance : allowance.value;

  let nextEmail = u.email;
  if (email !== undefined) {
    nextEmail = String(email).toLowerCase().trim();
    if (!nextEmail) return res.status(400).json({ error: 'Email is required' });
  }

  if (password) {
    const pwdErr = passwordError(password);
    if (pwdErr) return res.status(400).json({ error: pwdErr });
  }

  let nextCost = u.hourly_cost;
  if (hourly_cost !== undefined) {
    const cost = parseHourlyCost(hourly_cost);
    if (cost.error) return res.status(400).json({ error: cost.error });
    nextCost = cost.value;
  }

  let nextCis = u.cis_status || 'none';
  if (cis_status !== undefined) {
    const cis = parseCisStatus(cis_status);
    if (cis.error) return res.status(400).json({ error: cis.error });
    nextCis = cis.value;
  }

  const isStaff = nextRole === ROLES.STAFF;
  const nextSkills = isStaff ? (skills !== undefined ? skills : u.skills) : [];
  const nextDriver = isStaff ? (is_driver !== undefined ? !!is_driver : !!u.is_driver) : false;

  const previousRole = u.role;
  const roleChanged = nextRole !== previousRole;
  const deactivated = u.active && !nextActive;
  const reactivated = !u.active && nextActive;
  const tempPassword = !!password;
  const shouldRevoke = roleChanged || deactivated || tempPassword;

  try {
    await u.update({
      name: name ?? u.name,
      email: nextEmail,
      phone: phone !== undefined ? (phone || null) : u.phone,
      role: nextRole,
      skills: nextSkills,
      is_driver: nextDriver,
      active: nextActive,
      holiday_allowance: nextAllowance,
      color: color ?? u.color,
      financials_restricted: nextRestricted,
      hourly_cost: nextCost,
      cis_status: nextCis,
      ...(shouldRevoke ? { token_version: nextTokenVersion(u) } : {}),
    });
  } catch (err) {
    return res.status(400).json({ error: err.name === 'SequelizeUniqueConstraintError' ? 'That email is already in use' : err.message });
  }

  if (password) {
    u.password_hash = hashPassword(password);
    u.password_reset_token = null;
    u.password_reset_expires = null;
    await u.save();
  }

  const actorUserId = req.user.id;
  if (roleChanged) {
    await logSecurityEvent({
      actorUserId,
      targetUserId: u.id,
      action: SECURITY_ACTIONS.ROLE_CHANGE,
      detail: `${previousRole} → ${nextRole}`,
    });
  }
  if (deactivated) {
    await logSecurityEvent({
      actorUserId,
      targetUserId: u.id,
      action: SECURITY_ACTIONS.DEACTIVATE,
    });
  }
  if (reactivated) {
    await logSecurityEvent({
      actorUserId,
      targetUserId: u.id,
      action: SECURITY_ACTIONS.REACTIVATE,
    });
  }
  if (tempPassword) {
    await logSecurityEvent({
      actorUserId,
      targetUserId: u.id,
      action: SECURITY_ACTIONS.ADMIN_TEMP_PASSWORD,
    });
  }
  res.json({ ok: true });
}));

router.post('/users/:id/reset-password', requireAdmin, asyncHandler(async (req, res) => {
  const u = await User.findByPk(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!u.active) {
    return res.status(400).json({ error: 'This account is inactive. Reactivate it before sending a reset link.' });
  }
  if (!u.email) return res.status(400).json({ error: 'This account has no email address' });
  try {
    await issueResetEmail(u);
  } catch (err) {
    return res.status(500).json({ error: 'Could not send the reset email' });
  }
  await logSecurityEvent({
    actorUserId: req.user.id,
    targetUserId: u.id,
    action: SECURITY_ACTIONS.FORGOT_PASSWORD,
    detail: 'admin_reset_link',
  });
  res.json({ ok: true });
}));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECURITY_PAGE_SIZE = 20;
const SECURITY_PAGE_MAX = 100;
const SECURITY_DEFAULT_DAYS = 7;

function isoDayUtc(date) {
  return date.toISOString().slice(0, 10);
}

function defaultSecurityRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (SECURITY_DEFAULT_DAYS - 1));
  return { from: isoDayUtc(from), to: isoDayUtc(to) };
}

/**
 * Inclusive from/to (YYYY-MM-DD). Missing pair defaults to the last 7 days.
 */
function parseSecurityRange(query = {}) {
  const rawFrom = query.from == null ? '' : String(query.from).trim();
  const rawTo = query.to == null ? '' : String(query.to).trim();
  if (!rawFrom && !rawTo) return defaultSecurityRange();
  if (!ISO_DAY.test(rawFrom)) return { error: 'Invalid from date' };
  if (!ISO_DAY.test(rawTo)) return { error: 'Invalid to date' };
  if (rawFrom > rawTo) return { error: 'from must be on or before to' };
  return { from: rawFrom, to: rawTo };
}

function parseSecurityPage(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const requested = parseInt(query.limit, 10);
  const limit = Number.isFinite(requested)
    ? Math.min(SECURITY_PAGE_MAX, Math.max(1, requested))
    : SECURITY_PAGE_SIZE;
  return { page, limit, offset: (page - 1) * limit };
}

function mapSecurityEvent(row) {
  return {
    id: row.id,
    action: row.action,
    detail: row.detail,
    created_at: row.created_at,
    actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
    target: row.target ? { id: row.target.id, name: row.target.name, email: row.target.email } : null,
  };
}

/**
 * ADMIN-only security audit list (requirement 1.9). No export, no retention.
 * Date range + pagination so the office table does not load the full log.
 */
router.get('/security-events', requireAdmin, asyncHandler(async (req, res) => {
  const range = parseSecurityRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });
  const { page, limit, offset } = parseSecurityPage(req.query);
  const where = {
    created_at: {
      [Op.gte]: `${range.from}T00:00:00.000Z`,
      [Op.lte]: `${range.to}T23:59:59.999Z`,
    },
  };
  const total = await SecurityEvent.count({ where });
  const rows = await SecurityEvent.findAll({
    where,
    include: [
      { model: User, as: 'actor', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'target', attributes: ['id', 'name', 'email'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
  res.json({
    events: plain(rows).map(mapSecurityEvent),
    total,
    page,
    limit,
    from: range.from,
    to: range.to,
  });
}));

module.exports = router;
module.exports.CIS_STATUS_VALUES = CIS_STATUS_VALUES;

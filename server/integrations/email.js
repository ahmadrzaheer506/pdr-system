// ============================================================
// Outbound email adapter (SMTP via nodemailer).
// Live when SMTP_HOST, SMTP_USER, and SMTP_PASS are set; otherwise simulated.
// Every send wraps inner copy in the shared branded HTML layout.
// ============================================================
const path = require('path');
const nodemailer = require('nodemailer');
const { logIntegrationEvent } = require('../models');
const branding = require('../branding');
const { renderBrandedEmail, LOGO_CID, DEFAULT_COMPANY } = require('../emailLayout');

function smtpUser() {
  return String(process.env.SMTP_USER || '').trim();
}

/** Gmail app passwords are often copied with spaces; SMTP auth needs the 16 characters. */
function smtpPass() {
  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
}

function isConfigured() {
  return !!(String(process.env.SMTP_HOST || '').trim() && smtpUser() && smtpPass());
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = port === 465;
    transporter = nodemailer.createTransport({
      host: String(process.env.SMTP_HOST || '').trim(),
      port,
      secure,
      requireTLS: !secure,
      auth: { user: smtpUser(), pass: smtpPass() },
    });
  }
  return transporter;
}

async function logEvent(direction, event, payload, status = 'ok') {
  await logIntegrationEvent('email', direction, event, payload, status);
}

async function loadCompany() {
  try {
    const { getSetting } = require('../db');
    const company = await getSetting('company');
    if (company && typeof company === 'object') return { ...DEFAULT_COMPANY, ...company };
  } catch (_) { /* tests and boot without settings still get defaults */ }
  return { ...DEFAULT_COMPANY };
}

function logoAttachment(logoPath) {
  if (!logoPath) return null;
  return {
    filename: path.basename(logoPath),
    path: logoPath,
    cid: LOGO_CID,
    contentDisposition: 'inline',
  };
}

/**
 * Send an email. Third argument is plaintext or { greeting, body, actionUrl, actionLabel, note }.
 * attachments = [{ filename, path }]. Returns { simulated }.
 */
async function send(to, subject, payload, attachments = []) {
  if (!to) throw new Error('Customer has no email address on record');
  const company = await loadCompany();
  const logoPath = branding.resolveLogoPath();
  const { html, text } = renderBrandedEmail({
    subject,
    payload,
    company,
    logoSrc: logoPath ? `cid:${LOGO_CID}` : null,
  });
  const mailAttachments = [
    logoAttachment(logoPath),
    ...(Array.isArray(attachments) ? attachments : []),
  ].filter(Boolean);

  if (!isConfigured()) {
    await logEvent('out', 'email.simulated', { to, subject }, 'simulated');
    return { simulated: true };
  }
  try {
    await getTransporter().sendMail({
      from: String(process.env.SMTP_FROM || smtpUser()).trim() || smtpUser(),
      to,
      subject,
      text,
      html,
      attachments: mailAttachments,
    });
    await logEvent('out', 'email.sent', { to, subject });
    return { simulated: false };
  } catch (err) {
    await logEvent('out', 'email.error', { to, subject, error: String(err.message) }, 'error');
    throw err;
  }
}

function status() {
  return {
    id: 'email',
    name: 'Email (SMTP out + inbound parse)',
    configured: isConfigured(),
    connected: isConfigured(),
    mode: isConfigured() ? 'live' : 'simulated',
    env_needed: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_INBOUND_SECRET'],
    webhook_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/webhooks/email?secret=${process.env.EMAIL_INBOUND_SECRET || 'change-me'}`,
    detail: isConfigured()
      ? 'Live — sending via SMTP'
      : 'Simulated — emails are recorded in the CRM but not delivered. Add SMTP details in .env to go live.',
  };
}

function resetTransporter() {
  transporter = null;
}

module.exports = { isConfigured, send, status, resetTransporter };

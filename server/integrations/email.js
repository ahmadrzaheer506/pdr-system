// ============================================================
// Outbound email adapter (SMTP via nodemailer).
// Live when SMTP_HOST + SMTP_USER set; simulated otherwise.
// ============================================================
const nodemailer = require('nodemailer');
const { db } = require('../db');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function logEvent(direction, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('email', direction, event, JSON.stringify(payload).slice(0, 4000), status);
}

/**
 * Send an email. attachments = [{ filename, path }].
 * Returns { simulated }.
 */
async function send(to, subject, text, attachments = []) {
  if (!to) throw new Error('Customer has no email address on record');
  if (!isConfigured()) {
    logEvent('out', 'email.simulated', { to, subject }, 'simulated');
    return { simulated: true };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      attachments,
    });
    logEvent('out', 'email.sent', { to, subject });
    return { simulated: false };
  } catch (err) {
    logEvent('out', 'email.error', { to, subject, error: String(err.message) }, 'error');
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

module.exports = { isConfigured, send, status };

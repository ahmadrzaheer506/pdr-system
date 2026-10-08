// ============================================================
// Outbound email adapter (Mailgun HTTP API).
// Live when MAILGUN_API_KEY and MAILGUN_DOMAIN are set; otherwise simulated.
// Every send wraps inner copy in the shared branded HTML layout.
// ============================================================
const fs = require('fs');
const path = require('path');
const { logIntegrationEvent } = require('../models');
const branding = require('../branding');
const { renderBrandedEmail, LOGO_CID, DEFAULT_COMPANY } = require('../emailLayout');

function apiKey() {
  return String(process.env.MAILGUN_API_KEY || '').trim();
}

function domain() {
  return String(process.env.MAILGUN_DOMAIN || '').trim();
}

function fromAddress() {
  const explicit = String(process.env.MAILGUN_FROM || '').trim();
  if (explicit) return explicit;
  const host = domain();
  return host ? `Paul Douglas Roofing <mail@${host}>` : '';
}

function apiBase() {
  const explicit = String(process.env.MAILGUN_API_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const region = String(process.env.MAILGUN_REGION || 'us').toLowerCase();
  return region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
}

function isConfigured() {
  return !!(apiKey() && domain());
}

function authHeader() {
  return `Basic ${Buffer.from(`api:${apiKey()}`).toString('base64')}`;
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

function appendDiskFile(form, field, filePath, filename, mime) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const bytes = fs.readFileSync(filePath);
  const type = mime || 'application/octet-stream';
  form.append(field, new Blob([bytes], { type }), filename);
  return true;
}

function mailgunError(data, status) {
  const msg = data?.message || data?.Error || (typeof data === 'string' ? data : '') || `HTTP ${status}`;
  return new Error(`Mailgun ${status}: ${msg}`);
}

/**
 * Send an email. Third argument is plaintext or { greeting, body, actionUrl, actionLabel, note }.
 * attachments = [{ filename, path }]. Returns { simulated }.
 */
async function send(to, subject, payload, attachments = []) {
  if (!to) throw new Error('Customer has no email address on record');
  const company = await loadCompany();
  const logoPath = branding.resolveLogoPath();
  const logoExt = logoPath ? path.extname(logoPath) || '.png' : '.png';
  const inlineName = `${LOGO_CID}${logoExt}`;
  const { html, text } = renderBrandedEmail({
    subject,
    payload,
    company,
    logoSrc: logoPath ? `cid:${inlineName}` : null,
  });

  if (!isConfigured()) {
    await logEvent('out', 'email.simulated', { to, subject }, 'simulated');
    return { simulated: true };
  }

  const form = new FormData();
  form.append('from', fromAddress());
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text);
  form.append('html', html);
  const logoMime = typeof branding.mimeForPath === 'function'
    ? branding.mimeForPath(logoPath)
    : 'image/png';
  appendDiskFile(form, 'inline', logoPath, inlineName, logoMime);
  for (const att of Array.isArray(attachments) ? attachments : []) {
    if (!att?.path) continue;
    appendDiskFile(form, 'attachment', att.path, att.filename || path.basename(att.path), 'application/pdf');
  }

  try {
    const res = await fetch(`${apiBase()}/v3/${encodeURIComponent(domain())}/messages`, {
      method: 'POST',
      headers: { Authorization: authHeader() },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw mailgunError(data, res.status);
    await logEvent('out', 'email.sent', { to, subject, id: data.id || null });
    return { simulated: false, id: data.id || null };
  } catch (err) {
    await logEvent('out', 'email.error', { to, subject, error: String(err.message) }, 'error');
    throw err;
  }
}

function status() {
  return {
    id: 'email',
    name: 'Email (Mailgun + inbound parse)',
    configured: isConfigured(),
    connected: isConfigured(),
    mode: isConfigured() ? 'live' : 'simulated',
    env_needed: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_FROM', 'MAILGUN_REGION', 'EMAIL_INBOUND_SECRET'],
    webhook_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/webhooks/email?secret=${process.env.EMAIL_INBOUND_SECRET || 'change-me'}`,
    detail: isConfigured()
      ? `Live — sending via Mailgun (${domain()})`
      : 'Simulated — emails are recorded in the CRM but not delivered. Add MAILGUN_API_KEY and MAILGUN_DOMAIN in .env to go live.',
  };
}

/** Kept so existing tests can reset adapter state between cases. */
function resetTransporter() {}

module.exports = { isConfigured, send, status, resetTransporter, apiBase };

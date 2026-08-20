// ============================================================
// Facebook Page adapter — Messenger replies + Lead Ads fetch.
// (PRD §10.1). Live when FB_PAGE_ACCESS_TOKEN set.
// ============================================================
const crypto = require('crypto');
const { db } = require('../db');

const GRAPH = 'https://graph.facebook.com/v21.0';

function isConfigured() {
  return !!process.env.FB_PAGE_ACCESS_TOKEN;
}

function logEvent(direction, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('facebook', direction, event, JSON.stringify(payload).slice(0, 4000), status);
}

/** Verify X-Hub-Signature-256 on Meta webhooks (shared with WhatsApp). */
function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // not configured yet — accept (simulated phase)
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Reply to a Facebook page message (PSID = page-scoped sender id). */
async function sendPageMessage(psid, text) {
  if (!isConfigured()) {
    logEvent('out', 'page_message.simulated', { psid, text }, 'simulated');
    return { simulated: true };
  }
  const res = await fetch(`${GRAPH}/me/messages?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, message: { text }, messaging_type: 'RESPONSE' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logEvent('out', 'page_message.error', { psid, error: data }, 'error');
    throw new Error(`FB send failed: ${JSON.stringify(data.error || data)}`);
  }
  logEvent('out', 'page_message.sent', { psid });
  return { simulated: false };
}

/** Fetch full lead-form data when a leadgen webhook arrives. */
async function fetchLeadgen(leadgenId) {
  if (!isConfigured()) return null;
  const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logEvent('in', 'leadgen.fetch_error', { leadgenId, error: data }, 'error');
    return null;
  }
  // field_data: [{name, values:[..]}]
  const fields = {};
  for (const f of data.field_data || []) fields[f.name] = (f.values || [])[0];
  return fields;
}

/** Fetch a user's profile name from PSID (best effort). */
async function fetchProfileName(psid) {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${GRAPH}/${psid}?fields=name&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`);
    const data = await res.json();
    return data.name || null;
  } catch {
    return null;
  }
}

function status() {
  return {
    id: 'facebook',
    name: 'Facebook Page (Messenger + Lead Ads)',
    configured: isConfigured(),
    connected: isConfigured(),
    mode: isConfigured() ? 'live' : 'simulated',
    env_needed: ['FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN'],
    webhook_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/webhooks/facebook`,
    detail: isConfigured()
      ? 'Live — page messages and lead forms feed the CRM inbox'
      : 'Simulated — use the demo simulator to inject Facebook enquiries. Add page token to go live (needs Meta App Review for public traffic).',
  };
}

module.exports = { isConfigured, verifySignature, sendPageMessage, fetchLeadgen, fetchProfileName, status };
